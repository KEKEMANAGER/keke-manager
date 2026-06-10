import type { BlogLang } from './blogTypes';
import type { LandingLangCode } from './landingLanguages';

/** Blog content is available in ka / en / ru; other landing langs map to en. */
export function landingLangToBlogLang(code: LandingLangCode): BlogLang {
  if (code === 'ka' || code === 'en' || code === 'ru') return code;
  return 'en';
}

export function blogLangToLandingLang(code: BlogLang): LandingLangCode {
  return code;
}
