/** Load Leaflet from CDN on web — avoids Metro bundling the `leaflet` npm package on export. */

const LEAFLET_VERSION = '1.9.4';
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

function ensureLeafletCss(): void {
  if (typeof document === 'undefined') return;
  const id = 'leaflet-cdn-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = CSS_URL;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet is only available in the browser'));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as Window & { L?: any };
  if (w.L) return Promise.resolve(w.L);
  if (loadPromise) return loadPromise;

  ensureLeafletCss();
  loadPromise = new Promise((resolve, reject) => {
    const id = 'leaflet-cdn-js';
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => (w.L ? resolve(w.L) : reject(new Error('Leaflet failed'))));
      existing.addEventListener('error', () => reject(new Error('Leaflet script error')));
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = JS_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (w.L) resolve(w.L);
      else reject(new Error('Leaflet global missing'));
    };
    script.onerror = () => reject(new Error('Leaflet script failed to load'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
