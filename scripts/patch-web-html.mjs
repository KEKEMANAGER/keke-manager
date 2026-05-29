/**
 * Injects LCP-critical HTML into dist/index.html (Expo static export omits +html body).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LCP_LOGO_URL = '/logo.webp';

const CRITICAL_LANDING_CSS = `
html,body{margin:0;background:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#keke-lcp-shell{display:flex;flex-direction:column;align-items:center;padding:88px 24px 32px;min-height:100vh;box-sizing:border-box;background:#fff}
#keke-lcp-shell img{width:112px;height:112px;margin-bottom:8px;object-fit:contain}
#keke-lcp-shell .keke{font-size:42px;font-weight:900;color:#0a0a0a;letter-spacing:2px;margin:0}
#keke-lcp-shell .manager{font-size:28px;font-weight:700;color:#0a0a0a;letter-spacing:4px;margin:0 0 16px}
#keke-lcp-shell .hero{font-size:28px;font-weight:900;color:#0a0a0a;text-align:center;line-height:1.2;margin:0}
#keke-lcp-shell .hero-accent{font-size:28px;font-weight:900;color:#EF9F27;text-align:center;line-height:1.2;margin:4px 0 0}
#root{display:flex;flex:1;min-height:100vh;opacity:0}
#root.keke-hydrated{opacity:1}
body{overflow:auto}
`.trim();

const CRITICAL_LANDING_SHELL = `
<div id="keke-lcp-shell" aria-hidden="true">
  <img src="${LCP_LOGO_URL}" width="112" height="112" alt="" fetchpriority="high" decoding="async" />
  <p class="keke">KEKE</p>
  <p class="manager">MANAGER</p>
  <p class="hero">ერთი პლატფორმა,</p>
  <p class="hero-accent">უსაზღვრო შესაძებლობები</p>
</div>
`.trim();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'dist', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.warn('patch-web-html: dist/index.html not found, skip');
  process.exit(0);
}

let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes('keke-lcp-shell')) {
  const headInject = [
    `<link rel="preload" href="${LCP_LOGO_URL}" as="image" type="image/webp" fetchpriority="high" />`,
    `<style id="keke-critical-css">${CRITICAL_LANDING_CSS}</style>`,
  ].join('\n    ');

  html = html.replace('</head>', `    ${headInject}\n  </head>`);
  html = html.replace(
    '<div id="root"></div>',
    `${CRITICAL_LANDING_SHELL}\n    <div id="root"></div>`,
  );
}

html = html.replace(/body\s*\{\s*overflow:\s*hidden;\s*\}/, 'body { overflow: auto; }');

fs.writeFileSync(indexPath, html);
console.log('patch-web-html: injected LCP shell + preload into dist/index.html');
