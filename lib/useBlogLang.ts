import { landingLangToBlogLang } from './blogLandingLang';
import type { BlogLang } from './blogTypes';
import { useLandingLang } from './useLandingLang';

/** Blog language follows landing picker (?lang=, storage, default ka). */
export function useBlogLang(): BlogLang {
  return landingLangToBlogLang(useLandingLang());
}
