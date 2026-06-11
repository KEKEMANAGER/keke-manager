/**
 * Checks live kekemanager.com: index.html script refs + assets return JS/CSS, not HTML.
 */
const ORIGIN = process.argv[2] || 'https://kekemanager.com';

async function head(path) {
  const res = await fetch(`${ORIGIN}${path}`, { method: 'HEAD', redirect: 'follow' });
  return {
    path,
    status: res.status,
    type: res.headers.get('content-type') || '',
  };
}

async function main() {
  const indexRes = await fetch(`${ORIGIN}/`);
  const indexHtml = await indexRes.text();
  const scripts = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  console.log(`Origin: ${ORIGIN}`);
  console.log(`Scripts in index.html: ${scripts.join(', ') || '(none)'}`);

  let failed = 0;
  for (const src of scripts) {
    const info = await head(src);
    const bad = !info.status.toString().startsWith('2') || info.type.includes('text/html');
    console.log(`${bad ? 'FAIL' : 'OK  '} ${src} -> ${info.status} ${info.type}`);
    if (bad) failed += 1;
  }

  const entry = scripts.find((s) => s.includes('entry-'));
  if (entry) {
    const bundleRes = await fetch(`${ORIGIN}${entry}`);
    const bundle = await bundleRes.text();
    const refs = [
      ...new Set([
        ...bundle.matchAll(/\/_expo\/static\/[^"'\\)\s]+/g),
        ...bundle.matchAll(/\/assets\/[^"'\\)\s]+\.(?:css|js|png|webp|woff2?)/g),
      ].map((m) => m[0])),
    ];
    console.log(`\nChecking ${Math.min(refs.length, 40)} refs from entry bundle…`);
    for (const ref of refs.slice(0, 40)) {
      const info = await head(ref);
      const bad =
        !info.status.toString().startsWith('2') ||
        (ref.endsWith('.js') && info.type.includes('text/html')) ||
        (ref.endsWith('.css') && info.type.includes('text/html'));
      if (bad) {
        console.log(`FAIL ${ref} -> ${info.status} ${info.type}`);
        failed += 1;
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
