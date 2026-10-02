/**
 * Web Push (RFC 8291 payload encryption + RFC 8292 VAPID), on Web Crypto only.
 *
 * This is written out rather than pulled from a library on purpose: the whole
 * thing is ~150 lines of well-specified key derivation, and a dependency here
 * would have to be fetched at deploy time by a runtime we cannot test against
 * beforehand. Everything below runs identically in Deno and in Node 18+, so the
 * same code is verified locally against the RFC 8291 test vector before it ever
 * reaches the server.
 */

const enc = new TextEncoder();

// ── base64url ───────────────────────────────────────────────────────────────

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(b: Uint8Array): string {
  let bin = '';
  for (const byte of b) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ── HKDF, the two-step form the push RFCs spell out ─────────────────────────

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** One-block HKDF-Expand; every output the push spec needs is ≤ 32 bytes. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, Uint8Array.of(1)));
  return okm.slice(0, length);
}

// ── P-256 helpers ───────────────────────────────────────────────────────────

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, P256, true, []);
}

async function sharedSecret(priv: CryptoKey, pubRaw: Uint8Array): Promise<Uint8Array> {
  const pub = await importPublicKey(pubRaw);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  return new Uint8Array(bits);
}

// ── payload encryption (RFC 8291, aes128gcm) ────────────────────────────────

export type PushKeys = { p256dh: string; auth: string };

/**
 * `salt` and `ephemeral` are injectable so the implementation can be checked
 * against the RFC's worked example, where both are fixed. Production calls
 * leave them out and get fresh random values, which is what the spec requires.
 */
export async function encryptPayload(
  payload: string,
  keys: PushKeys,
  fixed?: { salt: Uint8Array; ephemeral: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(keys.p256dh);
  const authSecret = b64urlToBytes(keys.auth);

  const ephemeral =
    fixed?.ephemeral ?? ((await crypto.subtle.generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const ecdh = await sharedSecret(ephemeral.privateKey, uaPublic);

  // IKM comes from the ECDH secret keyed by the subscription's auth secret, with
  // both public keys bound into the info string so a record cannot be replayed
  // against a different subscriber.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // A single record, so the padding delimiter is 0x02 ("last record").
  const plaintext = concat(enc.encode(payload), Uint8Array.of(2));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext),
  );

  // header: salt(16) | record size(4) | key id length(1) | key id(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, ciphertext);
}

// ── VAPID (RFC 8292) ────────────────────────────────────────────────────────

export type VapidKeys = { publicKey: string; privateKey: string };

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: bytesToB64url(pub), privateKey: jwk.d as string };
}

/**
 * The private half is kept as the raw scalar (the JWK "d" value) so it is one
 * short string in settings; the public half is re-derived from it on import.
 */
async function importVapidPrivate(d: string, publicKey: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
    key_ops: ['sign'],
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function vapidHeader(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = bytesToB64url(
    enc.encode(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })),
  );
  const signingInput = enc.encode(`${header}.${body}`);

  const key = await importVapidPrivate(keys.privateKey, keys.publicKey);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput),
  );

  const jwt = `${header}.${body}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

// ── one delivery ────────────────────────────────────────────────────────────

export type DeliveryResult = { status: number; gone: boolean };

export async function sendWebPush(
  endpoint: string,
  keys: PushKeys,
  payload: string,
  vapid: VapidKeys,
  subject: string,
  ttlSeconds = 3600,
): Promise<DeliveryResult> {
  const body = await encryptPayload(payload, keys);
  const auth = await vapidHeader(endpoint, vapid, subject);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body,
  });

  // 404 and 410 are the push service saying this subscription is dead for good;
  // anything else may be transient and the row is worth keeping.
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
