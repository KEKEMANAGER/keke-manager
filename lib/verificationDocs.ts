export type VerificationDocGroupKey = 'id' | 'license' | 'tech_passport';

export type VerificationDocGroup = {
  key: VerificationDocGroupKey;
  front: VerificationDocSlot;
  back: VerificationDocSlot;
};

/** Driver-facing document groups (front + back per type). */
export function verificationDocGroupsForHired(isHired: boolean): VerificationDocGroup[] {
  const groups: VerificationDocGroup[] = [
    { key: 'id', front: 'id_front', back: 'id_back' },
    { key: 'license', front: 'license_front', back: 'license_back' },
  ];
  if (!isHired) {
    groups.push({
      key: 'tech_passport',
      front: 'tech_passport_front',
      back: 'tech_passport_back',
    });
  }
  return groups;
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

/** Storage object name under `verification/[user_id]/`. */
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

const SIMPLE_DOC_MIRROR_PAIRS: [VerificationDocSlot, VerificationDocSlot][] = [
  ['license_front', 'license_back'],
  ['id_front', 'id_back'],
  ['tech_passport_front', 'tech_passport_back'],
];

/** Copy front URL to back when only one side was persisted (legacy / partial saves). */
export function normalizeVerificationPhotos(photos: VerificationPhotos): VerificationPhotos {
  const p = { ...photos };
  for (const [front, back] of SIMPLE_DOC_MIRROR_PAIRS) {
    const frontUrl = p[front]?.trim();
    if (frontUrl && !p[back]?.trim()) {
      p[back] = frontUrl;
    }
  }
  return p;
}

export function photosFromUserRow(row: Record<string, unknown> | null): VerificationPhotos {
  const p = emptyVerificationPhotos();
  if (!row) return p;
  for (const key of Object.keys(p) as VerificationDocSlot[]) {
    const v = row[key];
    p[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return normalizeVerificationPhotos(p);
}

/** True when every required front/back slot is filled (4 hired / 6 freelance). */
export function allVerificationPhotosPresent(
  photos: VerificationPhotos,
  isHired: boolean,
): boolean {
  return verificationStepsForHired(isHired).every((slot) => isVerificationSlotUploaded(photos, slot));
}
