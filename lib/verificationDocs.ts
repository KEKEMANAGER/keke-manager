/** Simplified verification groups (storage: verification/{user_id}/id|license|registration.jpg). */
export type VerificationSimpleDoc = 'id' | 'license' | 'registration';

export function verificationSimpleDocsForHired(isHired: boolean): VerificationSimpleDoc[] {
  if (isHired) return ['id', 'license'];
  return ['id', 'license', 'registration'];
}

export function simpleDocPrimarySlot(doc: VerificationSimpleDoc): VerificationDocSlot {
  if (doc === 'id') return 'id_front';
  if (doc === 'license') return 'license_front';
  return 'tech_passport_front';
}

export function isSimpleDocUploaded(photos: VerificationPhotos, doc: VerificationSimpleDoc): boolean {
  return !!photos[simpleDocPrimarySlot(doc)]?.trim();
}

export function photoUrlForSimpleDoc(
  photos: VerificationPhotos,
  doc: VerificationSimpleDoc,
): string | null {
  return photos[simpleDocPrimarySlot(doc)];
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

/** True when every required simple doc (2 hired / 3 freelance) has a primary photo. */
export function allVerificationPhotosPresent(
  photos: VerificationPhotos,
  isHired: boolean,
): boolean {
  return verificationSimpleDocsForHired(isHired).every((doc) => isSimpleDocUploaded(photos, doc));
}
