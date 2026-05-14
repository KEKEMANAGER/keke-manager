import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const isProtectedRoute = createRouteMatcher([
  "/(ka|en|ru)/company(.*)",
  "/(ka|en|ru)/driver(.*)",
  "/(ka|en|ru)/onboarding(.*)",
]);

function shouldSkipIntl(pathname: string): boolean {
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/_vercel")) return true;
  if (pathname.startsWith("/sign-in")) return true;
  if (pathname.startsWith("/sign-up")) return true;
  if (pathname.startsWith("/onboarding")) return true;
  return false;
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;
  if (shouldSkipIntl(pathname)) {
    return;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
