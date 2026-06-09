export type SeoPageKind = 'location' | 'service';

export type SeoPageCopy = {
  h1Ka: string;
  h1En: string;
  introKa: string;
  introEn: string;
  bulletsKa: string[];
  bulletsEn: string[];
};

export type SeoPageDefinition = {
  kind: SeoPageKind;
  slug: string;
  path: string;
  titleKa: string;
  titleEn: string;
  descriptionKa: string;
  descriptionEn: string;
  keywordsKa: string;
  keywordsEn: string;
  copy: SeoPageCopy;
  relatedBlogSlugs: string[];
  /** For LocalBusiness schema on location pages */
  locality?: string;
  geo?: { latitude: number; longitude: number };
  serviceType?: string;
};
