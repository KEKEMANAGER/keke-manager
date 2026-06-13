/**
 * Writes static HTML for blog + programmatic SEO routes into dist/.
 * Crawlers get full text without executing React.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SITE_URL,
  SCHEMA_ORGANIZATION,
  buildBlogBreadcrumbSchema,
  buildBlogPostingSchema,
  buildFaqSchema,
  buildHeadMeta,
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

/** Auth routes: copy SPA index.html with route-specific meta (not static-only SEO stub). */
function writeSpaRouteHtml(relPath, meta) {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn(`prerender-seo: skip ${relPath} — dist/index.html missing`);
    return false;
  }

  let html = fs.readFileSync(indexPath, 'utf8');
  const lang = meta.lang || 'ka';
  const headMeta = buildHeadMeta({
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    canonical: meta.canonical,
    lang,
    includeDefaultSchemas: meta.includeDefaultSchemas ?? false,
    extraJsonLd: meta.extraJsonLd ?? [],
  });

  html = html.replace(/<html[^>]*>/i, `<html lang="${escapeHtml(lang)}">`);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/i, '');
  html = html.replace(/<meta name="keywords"[^>]*>/i, '');
  html = html.replace(/<meta property="og:title"[^>]*>/gi, '');
  html = html.replace(/<meta property="og:description"[^>]*>/gi, '');
  html = html.replace(/<meta property="og:url"[^>]*>/gi, '');
  html = html.replace(/<meta name="twitter:title"[^>]*>/gi, '');
  html = html.replace(/<meta name="twitter:description"[^>]*>/gi, '');
  html = html.replace(/<link rel="canonical"[^>]*>/i, '');
  html = html.replace('</head>', `    ${headMeta}\n  </head>`);

  writeHtml(relPath, html);
  return true;
}

function bulletsHtml(bullets) {
  if (!bullets?.length) return '';
  return `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function relatedBlogHtml(slugs, postsBySlug) {
  if (!slugs?.length) return '';
  const items = slugs
    .map((slug) => postsBySlug.get(slug))
    .filter(Boolean)
    .map((p) => `<li><a href="/blog/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></li>`)
    .join('');
  if (!items) return '';
  return `<h2>სასარგებლო სტატიები</h2><ul>${items}</ul>`;
}

function main() {
  if (!fs.existsSync(distDir)) {
    console.log('prerender-seo: dist/ missing, skipping');
    return;
  }

  let count = 0;
  const postsBySlug = new Map();

  if (fs.existsSync(blogManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(blogManifestPath, 'utf8'));
    for (const post of manifest.posts ?? []) {
      postsBySlug.set(post.slug, post);
    }
  }

  const blogListHtml =
    postsBySlug.size > 0
      ? `<ul class="keke-post-list">${[...postsBySlug.values()]
          .map(
            (post) =>
              `<li><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a><br /><span style="color:#666;font-size:14px">${escapeHtml(post.description || post.excerpt || '')}</span></li>`,
          )
          .join('')}</ul>`
      : '';

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
        ${blogListHtml}
        <p><a href="/">მთავარი გვერდი</a></p>`,
    }),
  );
  count += 1;

  for (const post of postsBySlug.values()) {
    const title = `${post.title} | KEKE Manager Blog`;
    const description = post.description || post.excerpt || '';
    const articleHtml = post.html || `<p>${escapeHtml(description)}</p>`;
    const canonical = `${SITE_URL}/blog/${post.slug}`;
    const ogImage = post.featuredImage?.startsWith('http')
      ? post.featuredImage
      : `${SITE_URL}${post.featuredImage || '/og-image.jpg'}`;

    const faqHtml =
      post.faq?.length > 0
        ? `<h2>ხშირი კითხვები</h2><dl>${post.faq
            .map(
              (item) =>
                `<dt>${escapeHtml(item.question)}</dt><dd>${escapeHtml(item.answer)}</dd>`,
            )
            .join('')}</dl>`
        : '';

    const extraJsonLd = [
      buildBlogPostingSchema(post),
      buildBlogBreadcrumbSchema(post),
      buildFaqSchema(post.faq),
    ].filter(Boolean);

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
        articlePublished: post.date,
        articleModified: post.date,
        extraJsonLd,
        bodyHtml: `<h1>${escapeHtml(post.title)}</h1>${articleHtml}${faqHtml}`,
      }),
    );
    count += 1;
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
            ${bulletsHtml(page.bullets?.ka)}
            ${relatedBlogHtml(page.relatedBlog, postsBySlug)}`,
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
            ${bulletsHtml(page.bullets?.ka)}
            ${relatedBlogHtml(page.relatedBlog, postsBySlug)}`,
        }),
      );
      count += 1;
    }
  }

  if (
    writeSpaRouteHtml('sign-up/index.html', {
      lang: 'ka',
      title: 'რეგისტრაცია | KEKE Manager',
      description:
        'დარეგისტრირდით KEKE Manager-ზე — B2B პლატფორმა ტურ ოპერატორებისა და მძღოლებისთვის საქართველოში. ტურ კომპანიებისთვის უფასო.',
      keywords: 'KEKE Manager რეგისტრაცია, tour operator sign up Georgia',
      canonical: `${SITE_URL}/sign-up`,
      extraJsonLd: [SCHEMA_ORGANIZATION],
    })
  ) {
    count += 1;
  }

  if (
    writeSpaRouteHtml('sign-in/index.html', {
      lang: 'ka',
      title: 'შესვლა | KEKE Manager',
      description: 'შედით თქვენს KEKE Manager ანგარიშში — ჯავშნები, GPS, ვაუჩერი, ფლოტი.',
      keywords: 'KEKE Manager შესვლა, tour operator login',
      canonical: `${SITE_URL}/sign-in`,
    })
  ) {
    count += 1;
  }

  console.log(`prerender-seo: wrote ${count} static HTML pages`);
}

main();
