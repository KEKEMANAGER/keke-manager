export type VerificationDocGroupKey = 'id' | 'license';

export type VerificationDocGroup = {
  key: VerificationDocGroupKey;
  front: VerificationDocSlot;
  back: VerificationDocSlot;
};

/** Driver KYC groups — person documents only (tech passport lives on vehicles). */
export function verificationDocGroupsForHired(_isHired: boolean): VerificationDocGroup[] {
  return [
    { key: 'id', front: 'id_front', back: 'id_back' },
    { key: 'license', front: 'license_front', back: 'license_back' },
  ];
}

export function isVerificationSlotUploaded(
  photos: VerificationPhotos,
  slot: VerificationDocSlot,
): boolean {
  return !!photos[slot]?.trim();
}

export function isVerificationDocGroupComplete(
  photos: VerificationPhotos,
  group: VerificationDocGroup,
): boolean {
  return (
    isVerificationSlotUploaded(photos, group.front) &&
    isVerificationSlotUploaded(photos, group.back)
  );
}

/** KYC document slots on users (legacy tech_passport_* columns kept for migration reads). */
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

/** Slots required for driver KYC submit (4 photos — same for hired and freelance). */
export const DRIVER_KYC_DOC_SLOTS: VerificationDocSlot[] = [
  'license_front',
  'license_back',
  'id_front',
  'id_back',
];

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

/** @deprecated Use DRIVER_KYC_DOC_SLOTS — KYC no longer includes tech passport. */
export function verificationStepsForHired(_isHired: boolean): VerificationDocSlot[] {
  return DRIVER_KYC_DOC_SLOTS;
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

/** True when all four KYC front/back slots are filled. */
export function allVerificationPhotosPresent(
  photos: VerificationPhotos,
  _isHired?: boolean,
): boolean {
  return DRIVER_KYC_DOC_SLOTS.every((slot) => isVerificationSlotUploaded(photos, slot));
}
