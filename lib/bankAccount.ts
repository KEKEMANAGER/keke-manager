/** Normalize IBAN / bank account for storage (uppercase, no spaces). */
export function normalizeBankAccount(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function formatBankAccountForDisplay(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return '';
  const compact = normalizeBankAccount(raw);
  return compact.replace(/(.{4})/g, '$1 ').trim();
}

export function validateBankAccount(value: string): string | null {
  const compact = normalizeBankAccount(value);
  if (!compact) return null;
  if (compact.length < 15 || compact.length > 34) {
    return 'invalid_length';
  }
  if (!/^[A-Z0-9]+$/.test(compact)) {
    return 'invalid_chars';
  }
  return null;
}
