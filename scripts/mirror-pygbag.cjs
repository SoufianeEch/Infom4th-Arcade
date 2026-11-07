'use strict';
/* Downloads the pygbag browser runtime (Python-in-WebAssembly + pygame wheel) into vendor/pygbag/
 * so the Python games load without internet. Run once with internet, commit vendor/pygbag/.
 *   node scripts/mirror-pygbag.cjs [--force]
 * The server serves vendor/pygbag/ at /pygbag/ (and fetches+caches any file missing from it while online).
 * Version must match the pygbag that builds the games (see PYGBAG_VERSION in server/pygbag.cjs). */
const fs = require('node:fs');
const path = require('node:path');
const { UPSTREAM, VERSION, PY, FILES, rewriteIndex } = require('../server/pygbag.cjs');

const out = path.resolve(__dirname, '../vendor/pygbag');
const force = process.argv.includes('--force');

async function get(rel) {
  const dest = path.join(out, rel);
  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'cached';
  const res = await fetch(`${UPSTREAM}/${rel}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  let body = Buffer.from(await res.arrayBuffer());
  if (/^cdn\/index-.*\.json$/.test(rel)) body = Buffer.from(rewriteIndex(body.toString('utf8')));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.part', body);
  fs.renameSync(dest + '.part', dest);
  return `${(body.length / 1024).toFixed(0)} KB`;
}

(async () => {
  console.log(`Mirroring pygbag ${VERSION} (python ${PY}) from ${UPSTREAM} into ${path.relative(process.cwd(), out) || out}`);
  let bad = 0;
  for (const rel of FILES) {
    try { console.log('  ok  ', rel, '-', await get(rel)); }
    catch (e) { bad++; console.error('  FAIL', e.message); }
  }
  if (bad) { console.error(`${bad} file(s) failed. Re-run when online.`); process.exit(1); }
  console.log('Done. Commit vendor/pygbag/ so the Python games work offline.');
})();
