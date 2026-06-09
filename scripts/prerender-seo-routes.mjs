/**
 * Writes static HTML for blog + programmatic SEO routes into dist/.
 * Crawlers get full text without executing React.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SITE_URL,
  OG_IMAGE_URL,
  buildStaticHtmlPage,
  escapeHtml,
} from './seoBuildMeta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const blogManifestPath = path.join(root, 'lib', 'generated', 'blogManifest.json');
const seoPagesPath = path.join(root, 'lib', 'seoLandingPages.json');

function writeHtml(relPath, html) {
  const out = path.join(distDir, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
}

function bulletsHtml(bullets) {
  if (!bullets?.length) return '';
  return `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function main() {
  if (!fs.existsSync(distDir)) {
    console.log('prerender-seo: dist/ missing, skipping');
    return;
  }

  let count = 0;

  // Blog index
  writeHtml(
    'blog/index.html',
    buildStaticHtmlPage({
      lang: 'ka',
      title: 'KEKE Manager Blog — ტურისტული ტრანსპორტის ინსაითები',
      description:
        'სტატიები ტურ ოპერატორებისთვის, მძღოლებისთვის და ფლოტის მფლობელებისთვის საქართველოში — ტრანსფერი, ფასები, B2B პლატფორმები.',
      keywords: 'ტურისტული ტრანსპორტი, tour transport Georgia, B2B platform',
      canonical: `${SITE_URL}/blog`,
      bodyHtml: `
        <h1>KEKE Manager ბლოგი</h1>
        <p>გზამკვლევები ტურ ოპერატორებისთვის, მძღოლებისთვის და ფლოტის მფლობელებისთვის საქართველოში.</p>
        <p><a href="/">მთავარი გვერდი</a></p>`,
    }),
  );
  count += 1;

  if (fs.existsSync(blogManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(blogManifestPath, 'utf8'));
    for (const post of manifest.posts ?? []) {
      const title = `${post.title} | KEKE Manager Blog`;
      const description = post.description || post.excerpt || '';
      const articleHtml = post.html || `<p>${escapeHtml(description)}</p>`;
      const canonical = `${SITE_URL}/blog/${post.slug}`;
      const ogImage = post.featuredImage?.startsWith('http')
        ? post.featuredImage
        : `${SITE_URL}${post.featuredImage || '/og-image.jpg'}`;

      writeHtml(
        `blog/${post.slug}/index.html`,
        buildStaticHtmlPage({
          lang: 'ka',
          title,
          description,
          keywords: (post.keywords ?? []).join(', '),
          canonical,
          ogType: 'article',
          ogImage,
          bodyHtml: `<h1>${escapeHtml(post.title)}</h1>${articleHtml}`,
        }),
      );
      count += 1;
    }
  }

  if (fs.existsSync(seoPagesPath)) {
    const data = JSON.parse(fs.readFileSync(seoPagesPath, 'utf8'));
    for (const page of data.locations ?? []) {
      writeHtml(
        `locations/${page.slug}/index.html`,
        buildStaticHtmlPage({
          lang: 'ka',
          title: page.title.ka,
          description: page.description.ka,
          canonical: `${SITE_URL}/locations/${page.slug}`,
          bodyHtml: `
            <h1>${escapeHtml(page.h1.ka)}</h1>
            <p>${escapeHtml(page.intro.ka)}</p>
            ${bulletsHtml(page.bullets?.ka)}`,
        }),
      );
      count += 1;
    }
    for (const page of data.services ?? []) {
      writeHtml(
        `services/${page.slug}/index.html`,
        buildStaticHtmlPage({
          lang: 'ka',
          title: page.title.ka,
          description: page.description.ka,
          canonical: `${SITE_URL}/services/${page.slug}`,
          bodyHtml: `
            <h1>${escapeHtml(page.h1.ka)}</h1>
            <p>${escapeHtml(page.intro.ka)}</p>
            ${bulletsHtml(page.bullets?.ka)}`,
        }),
      );
      count += 1;
    }
  }

  console.log(`prerender-seo: wrote ${count} static HTML pages`);
}

main();
