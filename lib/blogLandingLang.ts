import type { BlogLang } from './blogTypes';
import type { LandingLangCode } from './landingLanguages';

/** Blog content is available in ka / en / ru / hy (hy uses en body until translated). */
export function landingLangToBlogLang(code: LandingLangCode): BlogLang {
  if (code === 'ka' || code === 'en' || code === 'ru' || code === 'hy') return code;
  return 'en';
}

export function blogLangToLandingLang(code: BlogLang): LandingLangCode {
  return code;
}
