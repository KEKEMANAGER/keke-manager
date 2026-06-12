/**
 * Cloudflare Pages: serve index.html for client-side Expo Router paths on hard refresh.
 * Without this, a top-level 404.html (or missing SPA fallback) breaks /chat-list, /dashboard, etc.
 */
const ASSET_PREFIXES = ['/_expo/', '/assets/'];

function shouldSpaFallback(pathname, request) {
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (pathname === '/asset-not-found.html') return false;
  const accept = request.headers.get('Accept') ?? '';
  // Navigation / refresh — not XHR or script loads
  if (accept.includes('text/html') || accept.includes('*/*') || accept === '') return true;
  return false;
}

export async function onRequest(context) {
  const response = await context.next();
  if (response.status !== 404) return response;

  const url = new URL(context.request.url);
  if (!shouldSpaFallback(url.pathname, context.request)) return response;

  const indexUrl = new URL('/index.html', url.origin);
  const indexRequest = new Request(indexUrl.toString(), {
    method: 'GET',
    headers: context.request.headers,
  });
  const indexResponse = await context.env.ASSETS.fetch(indexRequest);
  if (!indexResponse.ok) return response;

  const headers = new Headers(indexResponse.headers);
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  return new Response(indexResponse.body, {
    status: 200,
    headers,
  });
}
