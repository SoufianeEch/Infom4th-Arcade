'use strict';
// Validates every games/<id>/manifest.json. Exit 1 on any problem.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../games');
let bad = 0;
const fail = m => { console.error('FAIL ' + m); bad++; };
const ids = new Set();
for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const mf = path.join(dir, d.name, 'manifest.json');
  let m;
  try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { fail(`${d.name}: manifest.json missing or invalid (${e.message})`); continue; }
  if (m.id !== d.name) fail(`${d.name}: id "${m.id}" must equal the folder name`);
  if (!/^[a-z0-9-]+$/.test(m.id || '')) fail(`${d.name}: id must match [a-z0-9-]+`);
  if (ids.has(m.id)) fail(`${d.name}: duplicate id`); ids.add(m.id);
  if (!m.title) fail(`${d.name}: title required`);
  if (!fs.existsSync(path.join(dir, d.name, m.entry || 'index.html'))) fail(`${d.name}: entry file missing`);
  if (m.scoring?.enabled && !(Number.isSafeInteger(m.scoring.max) && m.scoring.max > 0)) fail(`${d.name}: scoring.max must be a positive integer when scoring is enabled`);
  if (!bad) console.log('ok   ' + d.name);
}
process.exit(bad ? 1 : 0);
