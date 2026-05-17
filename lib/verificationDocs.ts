/** Storage object name under `verifications/[user_id]/`. */
export type VerificationDocSlot =
  | 'license_front'
  | 'license_back'
  | 'tech_passport_front'
  | 'tech_passport_back'
  | 'id_front'
  | 'id_back';

export type VerificationPhotos = Record<VerificationDocSlot, string | null>;

export const VERIFICATION_DOC_COLUMNS =
  'license_front, license_back, tech_passport_front, tech_passport_back, id_front, id_back';

export function emptyVerificationPhotos(): VerificationPhotos {
  return {
    license_front: null,
    license_back: null,
    tech_passport_front: null,
    tech_passport_back: null,
    id_front: null,
    id_back: null,
  };
}

export function verificationStepsForHired(isHired: boolean): VerificationDocSlot[] {
  if (isHired) {
    return ['license_front', 'license_back', 'id_front', 'id_back'];
  }
  return [
    'license_front',
    'license_back',
    'tech_passport_front',
    'tech_passport_back',
    'id_front',
    'id_back',
  ];
}

export function photosFromUserRow(row: Record<string, unknown> | null): VerificationPhotos {
  const p = emptyVerificationPhotos();
  if (!row) return p;
  for (const key of Object.keys(p) as VerificationDocSlot[]) {
    const v = row[key];
    p[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return p;
}

export function allVerificationPhotosPresent(
  photos: VerificationPhotos,
  isHired: boolean,
): boolean {
  const steps = verificationStepsForHired(isHired);
  return steps.every((slot) => !!photos[slot]?.trim());
}
