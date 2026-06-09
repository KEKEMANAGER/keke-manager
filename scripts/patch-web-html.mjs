/**
 * Injects LCP-critical HTML + SEO meta into dist/index.html (Expo export omits +html head).
 * Inlines logo.webp as data URI so LCP does not wait on a second network request.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeSupabaseBuildEnv, runtimeEnvScriptContent } from './supabaseEnvBuild.mjs';
import {
  HOME_SEO,
  buildHeadMeta,
  buildHomeNoscript,
  escapeHtml,
} from './seoBuildMeta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');
const indexPath = path.join(distDir, 'index.html');
const logoPath = path.join(publicDir, 'logo.webp');

function readLogoDataUri() {
  if (!fs.existsSync(logoPath)) {
    console.error('patch-web-html: missing public/logo.webp — run optimize-brand-assets first');
    process.exit(1);
  }
  const b64 = fs.readFileSync(logoPath).toString('base64');
  const kb = (fs.statSync(logoPath).size / 1024).toFixed(1);
  console.log(`patch-web-html: inlined logo.webp (${kb} KB → data URI)`);
  return `data:image/webp;base64,${b64}`;
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = normalizeSupabaseBuildEnv();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'patch-web-html: Supabase env missing at build — runtime script skipped (may exist in exported HTML from +html.tsx)',
  );
}

const runtimeEnvInline = runtimeEnvScriptContent(supabaseUrl, supabaseAnonKey);
const RUNTIME_ENV_SCRIPT = runtimeEnvInline
  ? `<script id="keke-runtime-env">${runtimeEnvInline}</script>`
  : '';

const LOGO_DATA_URI = readLogoDataUri();

const SEO_HEAD = buildHeadMeta({
  title: HOME_SEO.title,
  description: HOME_SEO.description,
  keywords: HOME_SEO.keywords,
  canonical: 'https://kekemanager.com/',
  lang: HOME_SEO.lang,
});

const CRITICAL_LANDING_CSS = `
html,body{margin:0;background:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#keke-lcp-shell{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:88px 24px 32px;box-sizing:border-box;background:#fff;transition:opacity .2s ease}
#keke-lcp-shell.keke-lcp-done{opacity:0;pointer-events:none;visibility:hidden}
#keke-lcp-shell img{width:112px;height:112px;margin-bottom:8px;object-fit:contain}
#keke-lcp-shell .keke{font-size:42px;font-weight:900;color:#0a0a0a;letter-spacing:2px;margin:0}
#keke-lcp-shell .manager{font-size:28px;font-weight:700;color:#0a0a0a;letter-spacing:4px;margin:0 0 16px}
#keke-lcp-shell .hero{font-size:28px;font-weight:900;color:#0a0a0a;text-align:center;line-height:1.2;margin:0;max-width:24ch}
#keke-lcp-shell .hero-accent{font-size:22px;font-weight:700;color:#EF9F27;text-align:center;line-height:1.3;margin:8px 0 0;max-width:32ch}
#keke-lcp-shell .hero-sub{font-size:15px;font-weight:500;color:#555;text-align:center;line-height:1.4;margin:12px 0 0;max-width:36ch}
#root{position:relative;z-index:1;display:flex;flex:1;min-height:100vh}
body{overflow:auto}
`.trim();

const CRITICAL_LANDING_SHELL = `
<div id="keke-lcp-shell">
  <img src="${LOGO_DATA_URI}" width="112" height="112" alt="KEKE Manager — ტურ ოპერატორებისა და მძღოლების მართვის პლათფორმა" fetchpriority="high" loading="eager" decoding="sync" />
  <p class="keke">KEKE</p>
  <p class="manager">MANAGER</p>
  <p class="hero">ერთი პლატფორმა,</p>
  <p class="hero-accent">უსაზღვრო შესაძებლობები</p>
  <p class="hero-sub">B2B პლატფორმა ტურ ოპერატორებისა და მძღოლებისთვის · ჯავშნები · GPS · ვაუჩერი</p>
</div>
<script id="keke-lcp-route-dismiss">
(function () {
  var path = location.pathname || '/';
  if (path === '/' || path === '/index.html') return;
  function hide() {
    var shell = document.getElementById('keke-lcp-shell');
    if (!shell) return;
    shell.classList.add('keke-lcp-done');
    setTimeout(function () { shell.remove(); }, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hide);
  } else {
    hide();
  }
})();
</script>
`.trim();

const HEAD_INJECT = [
  RUNTIME_ENV_SCRIPT,
  SEO_HEAD,
  `<link rel="preload" href="/logo.webp" as="image" type="image/webp" fetchpriority="high" />`,
  `<style id="keke-critical-css">${CRITICAL_LANDING_CSS}</style>`,
]
  .filter(Boolean)
  .join('\n    ');

function applySeoToHtml(html) {
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(HOME_SEO.title)}</title>`);
  html = html.replace(/<html([^>]*)>/i, `<html lang="${HOME_SEO.lang}"$1>`);
  html = html.replace(/<html lang="[^"]*"/i, `<html lang="${HOME_SEO.lang}"`);

  html = html.replace(/<meta name="description"[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
  html = html.replace(/<meta property="og:[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<meta name="twitter:[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<link rel="canonical"[^>]*>\s*/gi, '');
  html = html.replace(/<link rel="alternate" hreflang="[^"]+"[^>]*>\s*/gi, '');
  html = html.replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, '');

  html = html.replace(/<link rel="preload" href="\/logo\.webp"[^>]*>\s*/g, '');
  html = html.replace(/<style id="keke-critical-css">[\s\S]*?<\/style>\s*/g, '');
  html = html.replace(/<div id="keke-lcp-shell">[\s\S]*?<\/div>\s*/g, '');
  html = html.replace(/<script id="keke-lcp-route-dismiss">[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/<script id="keke-runtime-env">[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/gi, '');

  if (!html.includes('</head>')) {
    console.error('patch-web-html: invalid dist/index.html');
    process.exit(1);
  }

  html = html.replace('</head>', `    ${HEAD_INJECT}\n  </head>`);
  html = html.replace(
    '<div id="root"></div>',
    `${CRITICAL_LANDING_SHELL}\n    <div id="root"></div>\n    ${buildHomeNoscript()}`,
  );

  html = html.replace(/body\s*\{\s*overflow:\s*hidden;\s*\}/, 'body { overflow: auto; }');

  return html;
}

if (!fs.existsSync(indexPath)) {
  console.error('patch-web-html: dist/index.html not found');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
html = applySeoToHtml(html);

if (!html.includes('keke-lcp-shell') || !html.includes('data:image/webp;base64,')) {
  console.error('patch-web-html: failed to inject LCP shell');
  process.exit(1);
}
if (!html.includes('application/ld+json') || !html.includes('meta name="description"')) {
  console.error('patch-web-html: failed to inject SEO meta');
  process.exit(1);
}

fs.writeFileSync(indexPath, html);
console.log('patch-web-html: OK — SEO meta + static hero in dist/index.html');
