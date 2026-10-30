/**
 * A small SMTP client for Zoho Mail (implicit TLS on port 465) and the MIME
 * message the outreach sends: text + HTML, an inline logo, a PDF attachment.
 * Written here rather than imported so nothing depends on a library that may
 * not run on the current Deno edge runtime.
 */
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** The server refused the login: a wrong password, or the other data centre. */
export class SmtpAuthError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${what} timed out`)), ms);
    }),
  ]);
}

type Reply = { code: number; text: string };

class Session {
  private buf = '';
  private chunk = new Uint8Array(8192);
  constructor(private conn: Deno.TlsConn) {}

  /** One reply; multi-line replies ("250-…", then "250 …") come back whole. */
  async reply(ms = 30000): Promise<Reply> {
    const deadline = Date.now() + ms;
    for (;;) {
      const lines = this.buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}(?: |$)/.test(lines[i])) {
          this.buf = lines.slice(i + 1).join('\r\n');
          return { code: parseInt(lines[i].slice(0, 3), 10), text: lines.slice(0, i + 1).join(' | ') };
        }
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('smtp reply timed out');
      const n = await withTimeout(this.conn.read(this.chunk), left, 'smtp read');
      if (n === null) throw new Error('smtp connection closed');
      this.buf += dec.decode(this.chunk.subarray(0, n), { stream: true });
    }
  }

  async send(line: string): Promise<void> {
    const data = enc.encode(line);
    let off = 0;
    while (off < data.length) off += await this.conn.write(data.subarray(off));
  }

  async expect(line: string | null, code: number, ms?: number): Promise<Reply> {
    if (line !== null) await this.send(line);
    const r = await this.reply(ms);
    if (r.code !== code) throw new Error(`smtp ${code} expected, got: ${r.text}`);
    return r;
  }

  close() {
    try {
      this.conn.close();
    } catch {
      /* already closed */
    }
  }
}

export type DeliveryResult = { accepted: string[]; rejected: { to: string; reply: string }[]; reply: string };

export async function deliverSmtp(
  cfg: { host: string; port: number; user: string; pass: string },
  from: string,
  to: string[],
  message: string,
): Promise<DeliveryResult> {
  const conn = await withTimeout(Deno.connectTls({ hostname: cfg.host, port: cfg.port }), 15000, 'smtp connect');
  const s = new Session(conn);
  try {
    await s.expect(null, 220);
    await s.expect('EHLO kekemanager.com\r\n', 250);
    await s.expect('AUTH LOGIN\r\n', 334);
    await s.expect(`${encodeBase64(enc.encode(cfg.user))}\r\n`, 334);
    await s.send(`${encodeBase64(enc.encode(cfg.pass))}\r\n`);
    const auth = await s.reply();
    if (auth.code !== 235) throw new SmtpAuthError(auth.text);

    await s.expect(`MAIL FROM:<${from}>\r\n`, 250);
    const accepted: string[] = [];
    const rejected: { to: string; reply: string }[] = [];
    for (const rcpt of to) {
      await s.send(`RCPT TO:<${rcpt}>\r\n`);
      const r = await s.reply();
      if (r.code === 250 || r.code === 251) accepted.push(rcpt);
      else rejected.push({ to: rcpt, reply: r.text });
    }
    if (accepted.length === 0) {
      await s.send('QUIT\r\n');
      return { accepted, rejected, reply: '' };
    }
    await s.expect('DATA\r\n', 354);
    // Dot-stuffing: a line that starts with "." gets a second one.
    const body = message.replace(/\r\n\./g, '\r\n..');
    const done = await s.expect(`${body}\r\n.\r\n`, 250, 90000);
    try {
      await s.send('QUIT\r\n');
      await s.reply(5000);
    } catch {
      /* the message is already accepted */
    }
    return { accepted, rejected, reply: done.text };
  } finally {
    s.close();
  }
}

// ------------------------------------------------------------------ MIME

function wrap76(b64: string): string {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
  return out.join('\r\n');
}

/** RFC 2047 encoded words, split on whole characters so each stays short. */
function encodedWords(s: string): string {
  const words: string[] = [];
  let piece = '';
  for (const ch of s) {
    if (enc.encode(piece + ch).length > 45) {
      words.push(piece);
      piece = '';
    }
    piece += ch;
  }
  if (piece) words.push(piece);
  return words.map((w) => `=?UTF-8?B?${encodeBase64(enc.encode(w))}?=`).join('\r\n ');
}

export function buildMessage(opts: {
  fromName: string;
  fromAddr: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  logo: Uint8Array;
  pdf: Uint8Array;
  pdfName: string;
}): string {
  const id = crypto.randomUUID();
  const mix = `mix-${id}`;
  const rel = `rel-${id}`;
  const alt = `alt-${id}`;
  const b64 = (u: Uint8Array) => wrap76(encodeBase64(u));
  const lines = [
    `From: ${encodedWords(opts.fromName)} <${opts.fromAddr}>`,
    `To: ${opts.to.join(', ')}`,
    `Reply-To: ${opts.fromAddr}`,
    `Subject: ${encodedWords(opts.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@kekemanager.com>`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <mailto:${opts.fromAddr}?subject=unsubscribe>`,
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    '',
    `--${mix}`,
    `Content-Type: multipart/related; boundary="${rel}"`,
    '',
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(enc.encode(opts.text)),
    `--${alt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(enc.encode(opts.html)),
    `--${alt}--`,
    `--${rel}`,
    'Content-Type: image/png; name="keke-logo.png"',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <keke-logo>',
    'Content-Disposition: inline; filename="keke-logo.png"',
    '',
    b64(opts.logo),
    `--${rel}--`,
    `--${mix}`,
    `Content-Type: application/pdf; name="${opts.pdfName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${opts.pdfName}"`,
    '',
    b64(opts.pdf),
    `--${mix}--`,
    '',
  ];
  return lines.join('\r\n');
}
