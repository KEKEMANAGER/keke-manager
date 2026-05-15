import { Alert, Platform } from 'react-native';

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateRequired(value: string, fieldLabel: string): string | null {
  if (!value.trim()) {
    return `შეიყვანეთ ${fieldLabel}.`;
  }
  return null;
}

export function validateEmail(email: string, required = true): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return required ? 'შეიყვანეთ ელფოსტა.' : null;
  }
  if (!isValidEmail(trimmed)) {
    return 'ელფოსტის ფორმატი არასწორია.';
  }
  return null;
}

export function validatePassword(
  password: string,
  minLength: number = MIN_PASSWORD_LENGTH,
): string | null {
  if (!password) {
    return 'შეიყვანეთ პაროლი.';
  }
  if (password.length < minLength) {
    return `პაროლი უნდა იყოს მინიმუმ ${minLength} სიმბოლო.`;
  }
  return null;
}

export function validateSignInPassword(password: string): string | null {
  if (!password) {
    return 'შეიყვანეთ პაროლი.';
  }
  return null;
}

export function validateOptionalPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) {
    return 'ტელეფონის ნომერი არასწორია.';
  }
  return null;
}

export function validateExperienceYears(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const years = parseInt(trimmed, 10);
  if (!Number.isFinite(years) || years < 0 || years > 60) {
    return 'გამოცდილების წლები უნდა იყოს 0–60.';
  }
  return null;
}

export type SignInFormInput = {
  email: string;
  password: string;
};

export function validateSignInForm(input: SignInFormInput): string | null {
  return validateEmail(input.email) ?? validateSignInPassword(input.password);
}

export type SignUpFormInput = {
  role: string | null;
  fullName: string;
  email: string;
  password: string;
};

export function validateSignUpForm(input: SignUpFormInput): string | null {
  if (!input.role) {
    return 'აირჩიეთ როლი (მძღოლი ან კომპანია).';
  }
  return (
    validateRequired(input.fullName, 'სრული სახელი') ??
    validateEmail(input.email) ??
    validatePassword(input.password)
  );
}

export type CompanyProfileFormInput = {
  companyName: string;
  email: string;
  phone: string;
};

export function validateCompanyProfileForm(input: CompanyProfileFormInput): string | null {
  return (
    validateRequired(input.companyName, 'კომპანიის სახელი') ??
    validateEmail(input.email, false) ??
    validateOptionalPhone(input.phone)
  );
}

export type DriverProfileFormInput = {
  name: string;
  vehicleType: string | null;
  vehicleClass: string | null;
  experienceYears: string;
};

export function validateDriverProfileForm(input: DriverProfileFormInput): string | null {
  const nameErr = validateRequired(input.name, 'სახელი');
  if (nameErr) return nameErr;
  if (!input.vehicleType || !input.vehicleClass) {
    return 'აირჩიეთ ავტომობილის ტიპი და კლასი.';
  }
  return validateExperienceYears(input.experienceYears);
}

export function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message?: string }).message ?? '');
  }
  if (err instanceof Error) {
    return err.message;
  }
  return '';
}

export function isNetworkError(err: unknown): boolean {
  const lower = extractErrorMessage(err).toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('fetch failed') ||
    lower.includes('timeout')
  );
}

export function mapSupabaseError(err: unknown): string {
  if (isNetworkError(err)) {
    return 'ინტერნეტი არ არის — შეამოწმეთ კავშირი და სცადეთ თავიდან.';
  }

  const msg = extractErrorMessage(err);
  const lower = msg.toLowerCase();
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code ?? '')
      : '';

  if (lower.includes('invalid login credentials')) {
    return 'ელფოსტა ან პაროლი არასწორია.';
  }
  if (lower.includes('email not confirmed')) {
    return 'ელფოსტა არ არის დადასტურებული.';
  }
  if (
    code === 'user_already_exists' ||
    lower.includes('user already registered') ||
    lower.includes('already registered')
  ) {
    return 'ეს ელფოსტა უკვე რეგისტრირებულია — გადადით „შესვლაზე".';
  }
  if (lower.includes('password should be at least')) {
    return 'პაროლი უნდა იყოს მინიმუმ 6 სიმბოლო.';
  }
  if (lower.includes('unable to validate email')) {
    return 'ელფოსტის ფორმატი არასწორია.';
  }
  if (
    lower.includes('jwt') ||
    lower.includes('session') ||
    lower.includes('not authenticated') ||
    code === 'PGRST301'
  ) {
    return 'სესია ამოიწურა — გთხოვთ თავიდან შეხვიდეთ.';
  }
  if (lower.includes('permission') || code === '42501') {
    return 'წვდომა აკრძალულია.';
  }
  if (msg.trim()) {
    return msg;
  }
  return 'მონაცემები არასწორია ან მოთხოვნა ვერ შესრულდა.';
}

export function showErrorAlert(message: string, title = 'შეცდომა'): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function showValidationAlert(
  message: string,
  title = 'შევსება არ არის სრული',
): void {
  showErrorAlert(message, title);
}

export function showNetworkAlert(): void {
  showErrorAlert(
    'ინტერნეტი არ არის — შეამოწმეთ კავშირი და სცადეთ თავიდან.',
    'კავშირი',
  );
}
