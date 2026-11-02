// safelog.ts — what may go into booking_import_log and the function's logs.
//
// A file is often named after the guest ("Ivanov_Sergey_transfer.pdf"), and
// an error or a warning can quote a phone number or a name. None of that is
// needed to find a problem later, so none of it is stored: a file is kept as
// its type and a short fingerprint, and free text is masked.

/** A file name as the log keeps it: its extension and an 8-character fingerprint. */
export async function safeFileLabel(name: string): Promise<string> {
  const s = String(name ?? '').trim();
  if (!s) return '';
  const ext = (s.includes('.') ? s.split('.').pop() ?? '' : '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const hex = [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${ext ? `.${ext}` : 'file'} #${hex}`;
}

/**
 * Free text made safe to log: secrets, e-mail addresses, phone-like digit
 * runs, links and anything after a colon that could be a value are masked,
 * and the line is cut short.
 */
export function maskForLog(text: string, max = 200): string {
  return String(text ?? '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})\b/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, '[digits]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
