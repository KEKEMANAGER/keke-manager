export const BLOG_WEB_CSS = `
a.blog-article-card-link {
  text-decoration: none;
  display: block;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
a.blog-article-card-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(239, 159, 39, 0.12);
}
.blog-progress-track {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 3px;
  background: #e8e8e8;
}
.blog-progress-fill {
  height: 3px;
  background: #ef9f27;
}
.blog-article-body {
  max-width: 700px;
  margin: 0 auto;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 18px;
  line-height: 1.7;
  color: #0a0a0a;
}
.blog-article-body h1 { font-size: 36px; font-weight: 800; margin: 0 0 1rem; line-height: 1.2; }
.blog-article-body h2 { font-size: 28px; font-weight: 800; margin: 2rem 0 0.75rem; line-height: 1.25; }
.blog-article-body h3 { font-size: 22px; font-weight: 700; margin: 1.5rem 0 0.5rem; }
.blog-article-body h4 { font-size: 18px; font-weight: 700; margin: 1rem 0 0.5rem; }
.blog-article-body p { margin: 0 0 1rem; }
.blog-article-body ul, .blog-article-body ol { margin: 0 0 1rem 1.25rem; padding: 0; }
.blog-article-body li { margin-bottom: 0.35rem; }
.blog-article-body blockquote {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 4px solid #EF9F27;
  background: #FAEEDA;
  color: #0a0a0a;
}
.blog-article-body a { color: #c47a10; font-weight: 600; text-decoration: underline; }
.blog-article-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  display: block;
  overflow-x: auto;
}
.blog-article-body th, .blog-article-body td {
  border: 1px solid #e8e8e8;
  padding: 8px 12px;
  text-align: left;
  font-size: 15px;
}
.blog-article-body th { background: #fafafa; font-weight: 700; }
.blog-article-body code {
  background: #f4f4f4;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.blog-article-body hr { border: none; border-top: 1px solid #e8e8e8; margin: 2rem 0; }
.blog-article-body img { max-width: 100%; height: auto; border-radius: 12px; }
`;
