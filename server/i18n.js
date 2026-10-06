// Arabic version of the site. Each English page stays the single source; /ar/... pages
// are produced from it by swapping text through i18n/ar.json and switching to RTL.
//
// Dictionary keys are the English text exactly as it appears in the HTML, with runs of
// whitespace collapsed. A paragraph that contains inline tags (<b>, <a>, <br>...) is one
// key including those tags, so the Arabic can reorder words around them.
// Run `npm run i18n` to list English text that has no Arabic yet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICT_FILE = path.join(ROOT, 'i18n', 'ar.json');

export const PAGES = ['index', 'about', 'faq', 'refund', 'terms', 'privacy', 'track'];
const INLINE = new Set(['b', 'strong', 'em', 'i', 'small', 'a', 'span', 'br', 's', 'sup', 'sub', 'u', 'abbr', 'time']);
const NO_UNIT = new Set(['svg', 'img', 'input', 'button', 'select', 'textarea', 'ul', 'ol', 'div', 'p', 'li', 'form']);
const SKIP = new Set(['script', 'style', 'noscript', 'template']);
const ATTRS = ['alt', 'aria-label', 'placeholder', 'title'];
const ARABIC_FONTS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap';

export const norm = s => s.replace(/\s+/g, ' ').trim();
// Skip strings with no letters, and contact details that read the same in both languages.
const translatable = s => /[A-Za-z]/.test(s) && !s.startsWith('<!') && !/^[\w.+-]+@[\w.-]+\.\w+$/.test(s) && !/^(https?:|www\.)/.test(s);
const tag = el => (el.rawTagName || '').toLowerCase();

let dictCache = { mtime: 0, data: { pages: {}, ui: {} } };
export function loadDict() {
  try {
    const { mtimeMs } = fs.statSync(DICT_FILE);
    if (mtimeMs !== dictCache.mtime) dictCache = { mtime: mtimeMs, data: JSON.parse(fs.readFileSync(DICT_FILE, 'utf8')) };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[i18n] could not read ar.json:', err.message);
  }
  return dictCache.data;
}

// An element is translated as one piece when it holds text directly and only inline children.
function isUnit(el) {
  const kids = el.childNodes;
  if (!kids.some(n => n.nodeType === 3 && n.rawText.trim())) return false;
  const ok = n => n.nodeType === 3 || n.nodeType === 8 || (INLINE.has(tag(n)) && !NO_UNIT.has(tag(n)) && n.childNodes.every(ok));
  return kids.every(ok);
}

// Visit every translatable string. cb(kind, key, apply) where apply(arabic) writes it back.
function walk(el, cb, inSvg = false) {
  const t = tag(el);
  if (SKIP.has(t) || el.getAttribute?.('translate') === 'no') return;
  if (el.nodeType === 1) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && translatable(v)) cb('attr', norm(v), ar => el.setAttribute(a, ar));
    }
    if (t === 'meta' && /description/i.test(el.getAttribute('name') || '')) {
      const v = el.getAttribute('content');
      if (v) cb('attr', norm(v), ar => el.setAttribute('content', ar));
    }
  }
  const svg = inSvg || t === 'svg';
  if (svg && t !== 'textpath') {
    el.childNodes.forEach(n => n.nodeType === 1 && walk(n, cb, true));
    return;
  }
  if (!svg && el.nodeType === 1 && t && t !== 'html' && t !== 'head' && t !== 'body' && isUnit(el)) {
    const key = norm(el.innerHTML);
    if (translatable(key)) cb('unit', key, ar => el.set_content(ar));
    return;
  }
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      const raw = n.rawText;
      const key = norm(raw);
      if (key && translatable(key)) {
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        cb('text', key, ar => { n.rawText = lead + ar + trail; });
      }
    } else if (n.nodeType === 1) {
      walk(n, cb, svg);
    }
  }
}

const parseHtml = html => parse(html, { comment: true, blockTextElements: { script: true, style: true, noscript: true } });

export function extractKeys(html) {
  const keys = new Set();
  walk(parseHtml(html), (kind, key) => keys.add(key));
  return [...keys];
}

// Rewrite links so the Arabic pages keep visitors in Arabic and assets still load.
const PAGE_LINK = new RegExp(`^(?:\\./)?(${PAGES.join('|')})\\.html(#.*)?$`);
function arUrl(url) {
  if (!url || /^(https?:|mailto:|tel:|data:|#|\/\/)/.test(url)) return url;
  if (url === '/api/catalog.js') return '/api/catalog.js?lang=ar';
  const m = url.match(PAGE_LINK);
  if (m) return `/ar/${m[1] === 'index' ? '' : m[1] + '.html'}${m[2] || ''}`;
  if (url === '/' || url.startsWith('/#')) return '/ar' + url;
  const abs = url.match(/^\/(index|about|faq|refund|terms|privacy|track)\.html(#.*)?$/);
  if (abs) return `/ar/${abs[1] === 'index' ? '' : abs[1] + '.html'}${abs[2] || ''}`;
  if (url.startsWith('/')) return url;
  return '/' + url.replace(/^\.\//, '');
}

export function toArabic(html, englishPath) {
  const dict = loadDict().pages || {};
  const root = parseHtml(html);
  const missing = [];
  walk(root, (kind, key, apply) => {
    if (dict[key]) apply(dict[key]);
    else missing.push(key);
  });

  const htmlEl = root.querySelector('html');
  htmlEl?.setAttribute('lang', 'ar');
  htmlEl?.setAttribute('dir', 'rtl');
  root.querySelector('head')?.insertAdjacentHTML('beforeend', `\n<link rel="stylesheet" href="${ARABIC_FONTS}">\n<link rel="alternate" hreflang="en" href="${englishPath}">\n`);

  for (const el of root.querySelectorAll('[href], [src]')) {
    for (const a of ['href', 'src']) {
      const v = el.getAttribute(a);
      if (v != null) el.setAttribute(a, arUrl(v));
    }
  }
  for (const el of root.querySelectorAll('.lang-switch')) {
    el.setAttribute('href', englishPath);
    el.setAttribute('lang', 'en');
    el.set_content('English');
  }
  return { html: root.toString(), missing };
}

// Cache translated pages until the English file or the dictionary changes.
const pageCache = new Map();
export function arabicPage(file, englishPath) {
  const full = path.join(ROOT, file);
  const stamp = `${fs.statSync(full).mtimeMs}:${loadDict() && dictCache.mtime}`;
  const hit = pageCache.get(file);
  if (hit && hit.stamp === stamp) return hit.html;
  const { html } = toArabic(fs.readFileSync(full, 'utf8'), englishPath);
  pageCache.set(file, { stamp, html });
  return html;
}

// UI strings used by the shop's JavaScript (window.EDEN.t).
export const uiStrings = lang => (lang === 'ar' ? loadDict().ui || {} : {});
