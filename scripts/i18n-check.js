// Lists English text that has no Arabic translation yet.
//   npm run i18n               -> report
//   npm run i18n -- --write    -> also writes i18n/missing.json to fill in
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractKeys, loadDict, PAGES } from '../server/i18n.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = loadDict();
const files = [...PAGES.map(p => `${p}.html`), 'server/404.html'];

const missingPages = {};
for (const f of files) {
  for (const k of extractKeys(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
    if (!dict.pages?.[k]) (missingPages[k] ??= []).push(f);
  }
}

// t('...') calls in the shop scripts
const missingUi = {};
const T_CALL = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
for (const f of ['js/app.js', 'js/site.js', 'js/track.js']) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(T_CALL)) {
    const key = m[2].replace(/\\(.)/g, '$1');
    if (!dict.ui?.[key]) (missingUi[key] ??= []).push(f);
  }
}

const nP = Object.keys(missingPages).length;
const nU = Object.keys(missingUi).length;
console.log(`Page text missing Arabic: ${nP}`);
for (const [k, list] of Object.entries(missingPages)) console.log(`  [${[...new Set(list)].join(', ')}] ${k.slice(0, 100)}`);
console.log(`Script text missing Arabic: ${nU}`);
for (const [k, list] of Object.entries(missingUi)) console.log(`  [${[...new Set(list)].join(', ')}] ${k.slice(0, 100)}`);
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(ROOT, 'i18n', 'missing.json'), JSON.stringify({
    pages: Object.fromEntries(Object.keys(missingPages).map(k => [k, ''])),
    ui: Object.fromEntries(Object.keys(missingUi).map(k => [k, ''])),
  }, null, 2));
  console.log('Wrote i18n/missing.json');
}
process.exitCode = nP + nU ? 1 : 0;
