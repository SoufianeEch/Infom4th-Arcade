'use strict';
/* Shared constants for the self-hosted pygbag runtime (used by the server and scripts/mirror-pygbag.cjs). */
const UPSTREAM = 'https://pygame-web.github.io';
const VERSION = '0.9.3';        // runtime version the installed pygbag emits; check: grep cdn games/*/web/index.html
const PY = 'cp312';
const WHEEL = 'pygame_ce-2.5.7-cp312-cp312-wasm32_bi_emscripten.whl';
const FILES = [
  `cdn/${VERSION}/pythons.js`,
  `cdn/${VERSION}/cpythonrc.py`,
  `cdn/${VERSION}/${'cpython312'}/main.js`,
  `cdn/${VERSION}/${'cpython312'}/main.data`,
  `cdn/${VERSION}/${'cpython312'}/main.wasm`,
  `cdn/${VERSION}/empty.html`,
  `cdn/${VERSION}/empty.ogg`,
  `cdn/${VERSION}/favicon.png`,
  'cdn/vt.js',
  'cdn/vtx.js',
  'cdn/vt/xterm.js',
  'cdn/vt/xterm.css',
  'cdn/vt/xterm-addon-image.js',
  `cdn/index-${VERSION}-${PY}.json`,
  `cdn/${PY}/${WHEEL}`,
];
/** The package index points at the public CDN; point it at our own mirror instead. */
function rewriteIndex(text) {
  return text.replace(/"-CDN-"\s*:\s*"[^"]*"/, '"-CDN-": "/pygbag/cdn/"');
}
module.exports = { UPSTREAM, VERSION, PY, FILES, rewriteIndex };
