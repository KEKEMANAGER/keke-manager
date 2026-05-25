import { Alert, Platform } from 'react-native';
import i18n from '../src/lib/i18n';
import { getSupabaseErrorMessage } from './errorHandler';

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateRequired(value: string, fieldLabel: string): string | null {
  if (!value.trim()) {
    return t('validation.required', { field: fieldLabel });
  }
  return null;
}

export function validateEmail(email: string, required = true): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return required ? t('validation.emailRequired') : null;
  }
  if (!isValidEmail(trimmed)) {
    return t('validation.emailInvalid');
  }
  return null;
}

export function validatePassword(
  password: string,
  minLength: number = MIN_PASSWORD_LENGTH,
): string | null {
  if (!password) {
    return t('validation.passwordRequired');
  }
  if (password.length < minLength) {
    return t('validation.passwordMin', { count: minLength });
  }
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm.trim()) {
    return t('validation.passwordConfirmRequired');
  }
  if (password !== confirm) {
    return t('validation.passwordMismatch');
  }
  return null;
}

export function validateSignInPassword(password: string): string | null {
  if (!password) {
    return t('validation.passwordRequired');
  }
  return null;
}

export function validateOptionalPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  return validatePhoneDigits(trimmed);
}

/** Required phone: Georgia (+995 5XX XXX XXX) or general international. */
export function validatePhoneRequired(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) {
    return t('validation.phoneRequired');
  }
  return validatePhoneDigits(trimmed);
}

function validatePhoneDigits(trimmed: string): string | null {
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9) {
    return t('validation.phoneInvalid');
  }
  if (digits.startsWith('995')) {
    if (digits.length !== 12 || !/^9955\d{8}$/.test(digits)) {
      return t('validation.phoneGeorgiaInvalid');
    }
    return null;
  }
  if (digits.length === 9 && digits.startsWith('5')) {
    return null;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return null;
  }
  return t('validation.phoneInvalid');
}

export function validateExperienceYears(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    return t('validation.experienceNumber');
  }
  const years = parseInt(trimmed, 10);
  if (!Number.isFinite(years) || years < 0 || years > 60) {
    return t('validation.experienceRange');
  }
  return null;
}

const BIO_MAX_LENGTH = 500;

export function validateBioLength(bio: string): string | null {
  if (bio.length > BIO_MAX_LENGTH) {
    return t('validation.bioMax', { max: BIO_MAX_LENGTH });
  }
  return null;
}

export function bioMaxLength(): number {
  return BIO_MAX_LENGTH;
}

export function validateVehicleSave(type: string | null, vehicleClass: string | null): string | null {
  if (!type) return t('validation.vehicleTypeRequired');
  if (!vehicleClass) return t('validation.vehicleClassRequired');
  return null;
}

export type SignInFormInput = {
  email: string;
  password: string;
};

export type SignInFieldErrors = {
  email?: string;
  password?: string;
};

export function validateSignInFields(input: SignInFormInput): SignInFieldErrors {
  const errors: SignInFieldErrors = {};
  const emailErr = validateEmail(input.email);
  if (emailErr) errors.email = emailErr.replace(/\.$/, '');
  const passErr = validateSignInPassword(input.password);
  if (passErr) errors.password = passErr.replace(/\.$/, '');
  return errors;
}

export function validateSignInForm(input: SignInFormInput): string | null {
  const e = validateSignInFields(input);
  return e.email ?? e.password ?? null;
}

export type SignUpAccountType = 'freelance_driver' | 'hired_driver' | 'company';

export type SignUpFormInput = {
  accountType: SignUpAccountType | null;
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  companyEmail?: string;
  companyPhone?: string;
  companyIdCode?: string;
  companyDirector?: string;
  driverPhone?: string;
};

export type SignUpFieldErrors = {
  accountType?: string;
  fullName?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyIdCode?: string;
  companyDirector?: string;
  driverPhone?: string;
};

export function validateSignUpFields(input: SignUpFormInput): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  if (!input.accountType) {
    errors.accountType = t('validation.roleRequired');
  }
  if (!input.fullName.trim()) {
    errors.fullName = t('validation.nameRequired');
  }
  const passErr = validatePassword(input.password);
  if (passErr) errors.password = passErr.replace(/\.$/, '');
  const confirmErr = validatePasswordConfirm(input.password, input.passwordConfirm);
  if (confirmErr) errors.passwordConfirm = confirmErr;

  if (input.accountType === 'company') {
    const companyEmailErr = validateEmail(input.companyEmail ?? '', true);
    if (companyEmailErr) errors.companyEmail = companyEmailErr.replace(/\.$/, '');
    const phoneErr = validatePhoneRequired(input.companyPhone ?? '');
    if (phoneErr) errors.companyPhone = phoneErr;
    if (!(input.companyIdCode ?? '').trim()) {
      errors.companyIdCode = t('validation.required', {
        field: t('authScreen.companyIdCode'),
      });
    }
    if (!(input.companyDirector ?? '').trim()) {
      errors.companyDirector = t('validation.required', {
        field: t('authScreen.companyDirector'),
      });
    }
  } else {
    const emailErr = validateEmail(input.email);
    if (emailErr) errors.email = emailErr.replace(/\.$/, '');
    const phoneErr = validatePhoneRequired(input.driverPhone ?? '');
    if (phoneErr) errors.driverPhone = phoneErr;
  }

  return errors;
}

export function validateSignUpForm(input: SignUpFormInput): string | null {
  const e = validateSignUpFields(input);
  return e.accountType ?? e.fullName ?? e.email ?? e.password ?? null;
}

export type CompanyProfileFormInput = {
  companyName: string;
  email: string;
  phone: string;
};

export function validateCompanyProfileForm(input: CompanyProfileFormInput): string | null {
  return (
    validateRequired(input.companyName, t('validation.fields.companyName')) ??
    validateEmail(input.email, false) ??
    validatePhoneRequired(input.phone)
  );
}

export type DriverProfileFormInput = {
  name: string;
  phone: string;
  vehicleType: string | null;
  vehicleClass: string | null;
  experienceYears: string;
};

export function validateDriverProfileForm(input: DriverProfileFormInput): string | null {
  const nameErr = validateRequired(input.name, t('validation.fields.name'));
  if (nameErr) return nameErr;
  const phoneErr = validatePhoneRequired(input.phone);
  if (phoneErr) return phoneErr;
  if (!input.vehicleType || !input.vehicleClass) {
    return t('validation.vehicleTypeClassRequired');
  }
  return validateExperienceYears(input.experienceYears);
}

export function validateDriverProfilePhoneOnly(input: {
  name: string;
  phone: string;
}): string | null {
  const nameErr = validateRequired(input.name, t('validation.fields.name'));
  if (nameErr) return nameErr;
  return validatePhoneRequired(input.phone);
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
  const mapped = getSupabaseErrorMessage(err);
  if (mapped) return mapped;

  const msg = extractErrorMessage(err);
  const lower = msg.toLowerCase();
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code ?? '')
      : '';

  if (
    code === 'user_already_exists' ||
    lower.includes('user already registered') ||
    lower.includes('already registered')
  ) {
    return t('validation.emailAlreadyRegistered');
  }
  if (lower.includes('password should be at least')) {
    return t('validation.passwordMin', { count: MIN_PASSWORD_LENGTH });
  }
  if (lower.includes('unable to validate email')) {
    return t('validation.emailInvalid');
  }
  return t('validation.genericInvalid');
}

export function showErrorAlert(message: string, title?: string): void {
  const alertTitle = title ?? t('system.errorTitle');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${alertTitle}\n\n${message}`);
    return;
  }
  Alert.alert(alertTitle, message);
}

export function showValidationAlert(message: string, title?: string): void {
  showErrorAlert(message, title ?? t('validation.alertTitle'));
}

export function showNetworkAlert(): void {
  showErrorAlert(t('validation.networkError'), t('validation.networkTitle'));
}
