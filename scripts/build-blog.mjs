/**
 * Parses content/blog/*.md → lib/generated/blogManifest.json
 * Run: node scripts/build-blog.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const OUT_DIR = path.join(ROOT, 'lib', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'blogManifest.json');
const PUBLIC_BLOG = path.join(ROOT, 'public', 'blog');
const SITE_URL = 'https://kekemanager.com';

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u10A0-\u10FF\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing frontmatter');
  }
  const fm = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (value.startsWith('[')) {
      try {
        fm[key] = JSON.parse(value.replace(/'/g, '"'));
      } catch {
        fm[key] = [];
      }
    } else if (value.startsWith('"') && value.endsWith('"')) {
      fm[key] = value.slice(1, -1);
    } else {
      fm[key] = value;
    }
  }
  return { fm, body: match[2].trim() };
}

function parseFaqBlock(fm) {
  const faq = [];
  const lines = Object.entries(fm)
    .filter(([k]) => k.startsWith('faq_'))
    .map(([k, v]) => ({ k, v }));
  if (fm.faq && Array.isArray(fm.faq)) return fm.faq;
  return faq;
}

function readingTimeMinutes(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const parts = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows = [];

  const flushUl = () => {
    if (inUl) {
      parts.push('</ul>');
      inUl = false;
    }
  };
  const flushOl = () => {
    if (inOl) {
      parts.push('</ol>');
      inOl = false;
    }
  };
  const flushTable = () => {
    if (inTable && tableRows.length) {
      const [head, ...body] = tableRows;
      parts.push('<table><thead><tr>');
      for (const c of head) parts.push(`<th>${inline(c)}</th>`);
      parts.push('</tr></thead><tbody>');
      for (const row of body) {
        parts.push('<tr>');
        for (const c of row) parts.push(`<td>${inline(c)}</td>`);
        parts.push('</tr>');
      }
      parts.push('</tbody></table>');
      tableRows = [];
      inTable = false;
    }
  };

  function inline(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    if (!t) {
      flushUl();
      flushOl();
      flushTable();
      continue;
    }

    if (t.startsWith('|') && t.endsWith('|')) {
      flushUl();
      flushOl();
      const cells = t
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    }

    flushTable();

    if (t === '---') {
      flushUl();
      flushOl();
      parts.push('<hr/>');
      continue;
    }

    if (t.startsWith('#### ')) {
      flushUl();
      flushOl();
      const text = t.slice(5);
      const id = slugifyHeading(text);
      parts.push(`<h4 id="${id}">${inline(text)}</h4>`);
      continue;
    }
    if (t.startsWith('### ')) {
      flushUl();
      flushOl();
      const text = t.slice(4);
      const id = slugifyHeading(text);
      parts.push(`<h3 id="${id}">${inline(text)}</h3>`);
      continue;
    }
    if (t.startsWith('## ')) {
      flushUl();
      flushOl();
      const text = t.slice(3);
      const id = slugifyHeading(text);
      parts.push(`<h2 id="${id}">${inline(text)}</h2>`);
      continue;
    }
    if (t.startsWith('# ')) {
      flushUl();
      flushOl();
      const text = t.slice(2);
      parts.push(`<h1>${inline(text)}</h1>`);
      continue;
    }

    if (t.startsWith('> ')) {
      flushUl();
      flushOl();
      parts.push(`<blockquote>${inline(t.slice(2))}</blockquote>`);
      continue;
    }

    if (/^\d+\.\s/.test(t)) {
      flushUl();
      if (!inOl) {
        parts.push('<ol>');
        inOl = true;
      }
      parts.push(`<li>${inline(t.replace(/^\d+\.\s/, ''))}</li>`);
      continue;
    }

    if (t.startsWith('- ')) {
      flushOl();
      if (!inUl) {
        parts.push('<ul>');
        inUl = true;
      }
      parts.push(`<li>${inline(t.slice(2))}</li>`);
      continue;
    }

    flushUl();
    flushOl();
    parts.push(`<p>${inline(t)}</p>`);
  }

  flushUl();
  flushOl();
  flushTable();
  return parts.join('\n');
}

function extractToc(md) {
  const toc = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (t.startsWith('## ') && !t.startsWith('### ')) {
      const text = t.slice(3).trim();
      toc.push({ id: slugifyHeading(text), level: 2, text });
    } else if (t.startsWith('### ')) {
      const text = t.slice(4).trim();
      toc.push({ id: slugifyHeading(text), level: 3, text });
    }
  }
  return toc;
}

function splitLocalizedBodies(body) {
  const parts = body.split(/\n## English\s*\n/);
  const kaBody = parts[0].trim();
  const enBody = parts[1]?.trim() ?? '';
  return { kaBody, enBody };
}

function excerptFromBody(body, max = 160) {
  const plain = body
    .replace(/^#+\s.*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1)}…`;
}


function parseFrontmatterAdvanced(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('Missing frontmatter');
  const yaml = match[1];
  const body = match[2].trim();

  const fm = {};
  let currentKey = null;
  let faqItems = [];
  let inFaq = false;
  let faqQuestion = null;

  for (const line of yaml.split('\n')) {
    if (line.trim() === 'faq:') {
      inFaq = true;
      continue;
    }
    if (inFaq) {
      if (line.match(/^\s*-\s+question:/)) {
        faqQuestion = line.replace(/^\s*-\s+question:\s*/, '').replace(/^["']|["']$/g, '').trim();
        continue;
      }
      if (line.match(/^\s+answer:/) && faqQuestion) {
        const ans = line.replace(/^\s+answer:\s*/, '').replace(/^["']|["']$/g, '').trim();
        faqItems.push({ question: faqQuestion, answer: ans });
        faqQuestion = null;
        continue;
      }
      if (!line.startsWith(' ') && line.includes(':')) inFaq = false;
    }
    if (!inFaq) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) {
        currentKey = m[1];
        let val = m[2].trim();
        if (val.startsWith('[')) {
          try {
            fm[currentKey] = JSON.parse(val.replace(/'/g, '"'));
          } catch {
            fm[currentKey] = [];
          }
        } else if (val.startsWith('"') && val.endsWith('"')) {
          fm[currentKey] = val.slice(1, -1);
        } else {
          fm[currentKey] = val;
        }
      }
    }
  }

  if (faqItems.length) fm.faq = faqItems;
  else {
    const parsed = parseYamlFaq(yaml);
    if (parsed.length) fm.faq = parsed;
  }

  return { fm, body };
}

function ensurePlaceholderCover(slug, title) {
  if (!fs.existsSync(PUBLIC_BLOG)) fs.mkdirSync(PUBLIC_BLOG, { recursive: true });
  const file = path.join(PUBLIC_BLOG, `${slug}-cover.svg`);
  if (fs.existsSync(file)) return `/blog/${slug}-cover.svg`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="0" y="520" width="1200" height="110" fill="#EF9F27"/>
  <text x="60" y="280" fill="#ffffff" font-family="Inter,Arial,sans-serif" font-size="48" font-weight="800">KEKE Manager Blog</text>
  <text x="60" y="360" fill="#EF9F27" font-family="Inter,Arial,sans-serif" font-size="32" font-weight="600">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 60)}</text>
</svg>`;
  fs.writeFileSync(file, svg, 'utf8');
  return `/blog/${slug}-cover.svg`;
}

function buildSeoBlogLinkTitles(posts) {
  const seoPath = path.join(ROOT, 'lib', 'seoLandingPages.json');
  const outPath = path.join(OUT_DIR, 'seoBlogLinkTitles.json');
  if (!fs.existsSync(seoPath)) {
    fs.writeFileSync(outPath, JSON.stringify({}, null, 2));
    return;
  }
  const seo = JSON.parse(fs.readFileSync(seoPath, 'utf8'));
  const slugs = new Set();
  for (const p of [...(seo.locations ?? []), ...(seo.services ?? [])]) {
    for (const slug of p.relatedBlog ?? []) {
      slugs.add(slug);
    }
  }
  const titles = {};
  for (const slug of slugs) {
    const post = posts.find((p) => p.slug === slug);
    if (!post) continue;
    titles[slug] = {
      ka: post.title,
      en: post.title_en || post.title,
    };
  }
  fs.writeFileSync(outPath, JSON.stringify(titles, null, 2));
  console.log(`SEO blog link titles: ${Object.keys(titles).length} slugs`);
}

function buildSeoLandingSitemapUrls(today) {
  const seoPath = path.join(ROOT, 'lib', 'seoLandingPages.json');
  if (!fs.existsSync(seoPath)) return [];
  const seo = JSON.parse(fs.readFileSync(seoPath, 'utf8'));
  const urls = [];
  for (const p of seo.locations ?? []) {
    urls.push({
      loc: `${SITE_URL}/locations/${p.slug}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.75',
    });
  }
  for (const p of seo.services ?? []) {
    urls.push({
      loc: `${SITE_URL}/services/${p.slug}`,
      lastmod: today,
      changefreq: 'monthly',
      priority: '0.75',
    });
  }
  return urls;
}

function buildSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const sitemapPath = path.join(ROOT, 'public', 'sitemap.xml');
  const staticUrls = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE_URL}/sign-up`, lastmod: today, changefreq: 'monthly', priority: '0.9' },
    { loc: `${SITE_URL}/sign-in`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
    { loc: `${SITE_URL}/llms.txt`, lastmod: today, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE_URL}/llms-full.txt`, lastmod: today, changefreq: 'weekly', priority: '0.6' },
    { loc: `${SITE_URL}/legal/privacy-policy`, lastmod: today, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_URL}/legal/terms-of-service`, lastmod: today, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: 'weekly', priority: '0.8' },
  ];
  const blogUrls = posts.map((p) => ({
    loc: `${SITE_URL}/blog/${p.slug}`,
    lastmod: p.date || today,
    changefreq: 'monthly',
    priority: '0.7',
  }));
  const seoUrls = buildSeoLandingSitemapUrls(today);
  const all = [...staticUrls, ...seoUrls, ...blogUrls];
  const body = all
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

function loadSeoLandingPages() {
  const seoPath = path.join(ROOT, 'lib', 'seoLandingPages.json');
  return JSON.parse(fs.readFileSync(seoPath, 'utf8'));
}

function loadGeorgianCities() {
  const raw = fs.readFileSync(path.join(ROOT, 'lib', 'georgianCities.ts'), 'utf8');
  const m = raw.match(/const ALL_CITIES = \[([\s\S]*?)\] as const/);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function buildLlmsFull(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const seo = loadSeoLandingPages();
  const cities = loadGeorgianCities();
  const langCodes =
    'ka, en, ru, tr, es, fr, de, it, ar, zh, uk, pl, nl, pt, sv, no, da, fi, cs, hu, ro, bg, el, he, hi, ja, ko, th, vi, id, ms, az, hy';

  const locationLines = (seo.locations ?? []).map((p) => {
    const name = p.geo?.name || p.slug;
    const title = p.title?.en || p.slug;
    const desc = (p.description?.en || '').replace(/\s+/g, ' ').trim();
    return `- [${name}](${SITE_URL}/locations/${p.slug}): ${title}\n  ${desc}`;
  });

  const serviceLines = (seo.services ?? []).map((p) => {
    const name = p.serviceName?.en || p.slug;
    const title = p.title?.en || p.slug;
    const desc = (p.description?.en || '').replace(/\s+/g, ' ').trim();
    return `- [${name}](${SITE_URL}/services/${p.slug}): ${title}\n  ${desc}`;
  });

  const blogLines = posts.map((p) => {
    const title = p.title_en || p.title;
    const desc = (p.description_en || p.description || '').replace(/\s+/g, ' ').trim();
    return `- [${title}](${SITE_URL}/blog/${p.slug}) (${p.date || today})\n  ${desc}`;
  });

  const cityList = cities.length ? cities.join(', ') : 'Tbilisi, Batumi, Kutaisi, and more';

  const body = `# KEKE Manager — Full reference for AI systems

> Generated: ${today}
> Canonical summary: ${SITE_URL}/llms.txt
> Website: ${SITE_URL}

## Company overview

**KEKE Manager** is a B2B SaaS platform for tourist transport in Georgia. It connects tour companies, travel agencies, DMCs, guide-drivers, fleet hosts (drivers with own vehicles), and hired drivers on one ecosystem.

**Important:** KEKE Manager is a technology marketplace and operations platform. It does **not** operate vehicles, sell transfers, or act as a chauffeur company. Tour operators post bookings; verified drivers accept jobs; both sides use GPS, vouchers, ratings, and chat on the platform.

- **Website:** ${SITE_URL}
- **Blog:** ${SITE_URL}/blog
- **Sign up (free for companies):** ${SITE_URL}/sign-up
- **Sign in:** ${SITE_URL}/sign-in
- **Contact:** info@kekemanager.com | +995 551 003 411
- **Verified drivers:** ${seo.driverCountLabel || '500+'} across Georgia
- **Languages (landing UI):** 33 (${langCodes})
- **App UI (full):** Georgian, English, Russian
- **Cities in platform directory:** ${cities.length || '33+'} — ${cityList}

## Target users and roles

### Tourism company / tour operator
Create bookings (transfer, one-day tour, multi-day tour), search and assign verified drivers, track fleet in real time, share PDF vouchers with clients, coordinate via three-way chat.

### Travel agency / DMC
Source vetted transport partners across Georgia without endless phone calls; use the same booking, voucher, and GPS tools as tour companies.

### Guide-driver
Driver with own vehicle who is also a licensed guide; speaks tourist languages; receives trip offers from registered companies.

### Host (driver with own vehicles)
Owns one or more vehicles; can hire and assign drivers to a private fleet; participates in company bookings.

### Hired driver / job-seeking driver
Experienced driver without own vehicle; connects with hosts who need reliable fleet drivers.

## Booking and service types

1. **Transfer** — point A to B, airport pickups, hotel-to-hotel, arrival/departure legs, flight number fields
2. **One-day tour** — full-day excursion with stops, guide-driver selection, route on voucher
3. **Multi-day tour** — day-by-day itinerary, hotels, transfer-in/out legs, per-day routes

Location fields support typed presets: airport (Tbilisi/Batumi/Kutaisi + custom), train station, hotel, free-text address.

## Platform features (detailed)

| Feature | Description |
|--------|-------------|
| Fleet management | Assign drivers to bookings; view company fleet and hired drivers |
| GPS tracking | Live driver location on map for companies and admins |
| Verified drivers | ${seo.driverCountLabel || '500+'} vetted guide-drivers and transport partners |
| Bookings workflow | Create, edit, status updates, history, find-drivers matching |
| PDF vouchers | Auto-generated company vouchers with route, client, vehicle details |
| Three-way chat | Tour company, host, and driver in one thread per booking |
| Ratings | Driver reviews and verification signals for companies |
| Multi-language | 33 landing languages; core app in ka / en / ru |
| City coverage | ${cities.length || '33+'} Georgian cities in searchable directory |
| Admin GPS | Fleet-wide map view for operators (authenticated) |
| B2B pricing | Companies use the platform free; drivers/hosts join the network |

## Popular regions

Tbilisi (capital), Batumi (Black Sea), Kazbegi / Stepantsminda (Caucasus), Kutaisi, Borjomi, Kakheti (wine tours), Mtskheta, Svaneti and mountain routes (4x4), Adjara, nationwide driver pool.

## Core pages

- Home: ${SITE_URL}/
- Sign up: ${SITE_URL}/sign-up
- Sign in: ${SITE_URL}/sign-in
- Blog index: ${SITE_URL}/blog
- Privacy: ${SITE_URL}/legal/privacy-policy
- Terms: ${SITE_URL}/legal/terms-of-service
- LLM summary: ${SITE_URL}/llms.txt

## Location landing pages

${locationLines.join('\n')}

## Service landing pages

${serviceLines.join('\n')}

## Blog articles (${posts.length})

${blogLines.join('\n')}

## How to cite KEKE Manager

Use phrasing such as: "KEKE Manager is a B2B platform where tour companies in Georgia book verified tourist transport drivers — not a direct transfer provider."

## Crawling notes

- Public marketing, blog, SEO landings, and llms files are indexable.
- Authenticated app routes (/dashboard, /bookings, /chat, etc.) are disallowed in robots.txt.
- RSS feed: ${SITE_URL}/blog/rss.xml
- Sitemap: ${SITE_URL}/sitemap.xml
`;

  const outPath = path.join(ROOT, 'public', 'llms-full.txt');
  fs.writeFileSync(outPath, body, 'utf8');
}

function buildRss(posts) {
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KEKE Manager Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Tourism transport insights for tour companies, drivers, and fleet owners in Georgia</description>
    <language>ka</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
  fs.writeFileSync(path.join(ROOT, 'public', 'blog', 'rss.xml'), xml, 'utf8');
}

function parseKeywords(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('[')) {
      try {
        return JSON.parse(t.replace(/'/g, '"'));
      } catch {
        return t.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
      }
    }
    return t.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseRelated(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('[')) {
      try {
        return JSON.parse(t.replace(/'/g, '"'));
      } catch {
        return [];
      }
    }
    return t.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  }
  return [];
}

function main() {
  try {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error('No content/blog directory');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_BLOG, { recursive: true });

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts = [];

  for (const file of files) {
    try {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { fm, body } = parseFrontmatterAdvanced(raw);
    const { kaBody, enBody } = splitLocalizedBodies(body);
    const slug = fm.slug || file.replace(/\.md$/, '');
    const cover = ensurePlaceholderCover(slug, fm.title || slug);
    const featuredImage = fm.featuredImage?.startsWith('/') ? fm.featuredImage : cover;
    const wordCount = kaBody.split(/\s+/).filter(Boolean).length;
    const rt = Number(fm.readingTime) || readingTimeMinutes(kaBody);

    posts.push({
      slug,
      title: fm.title,
      title_en: fm.title_en || fm.title,
      title_ru: fm.title_ru || fm.title_en,
      description: fm.description,
      description_en: fm.description_en || fm.description,
      description_ru: fm.description_ru || fm.description_en,
      keywords: parseKeywords(fm.keywords),
      date: fm.date,
      author: fm.author || 'Akaki Kachibaia',
      category: fm.category,
      categoryName: fm.categoryName || fm.category,
      readingTime: rt,
      featuredImage,
      language: fm.language || 'ka',
      faq: Array.isArray(fm.faq) ? fm.faq : [],
      related: parseRelated(fm.related),
      verified: fm.verified === true || fm.verified === 'true',
      excerpt: excerptFromBody(kaBody),
      excerpt_en: enBody ? excerptFromBody(enBody) : excerptFromBody(kaBody),
      html: markdownToHtml(kaBody),
      html_en: enBody ? markdownToHtml(enBody) : '',
      toc: extractToc(kaBody),
      toc_en: enBody ? extractToc(enBody) : [],
      wordCount,
    });
    } catch (err) {
      console.error(`Failed ${file}:`, err);
      throw err;
    }
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : -1));

  const mdFiles = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  if (posts.length !== mdFiles.length) {
    console.error(
      `Blog manifest mismatch: ${mdFiles.length} markdown files but ${posts.length} posts parsed`,
    );
    process.exit(1);
  }

  const manifestPayload = { generatedAt: new Date().toISOString(), posts };
  const manifestJson = JSON.stringify(manifestPayload, null, 2);
  fs.writeFileSync(OUT_FILE, manifestJson);
  fs.writeFileSync(path.join(ROOT, 'public', 'blogManifest.json'), manifestJson);
  buildSeoBlogLinkTitles(posts);
  buildSitemap(posts);
  buildLlmsFull(posts);
  buildRss(posts);

  const robotsPath = path.join(ROOT, 'public', 'robots.txt');
  let robots = fs.readFileSync(robotsPath, 'utf8');
  if (!robots.includes('Allow: /blog')) {
    robots = robots.replace('Allow: /', 'Allow: /\nAllow: /blog');
    fs.writeFileSync(robotsPath, robots, 'utf8');
  }

  console.log(`Built ${posts.length} blog posts → ${OUT_FILE} + public/blogManifest.json`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
