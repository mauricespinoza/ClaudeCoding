// build-artifact.mjs — genera la variante "solo cuerpo" que consume el publicador
// de Artifacts (que ya aporta <!doctype>, <head> y <body>), con el CSS incrustado.
//
//   node tools/build-artifact.mjs         -> dist/artifact.html
//   node tools/build-artifact.mjs --wrap  -> además preview.html en la raíz de la app
//                                            (página completa, para probarlo en local)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'styles.css'), 'utf8');

const pick = (tag) => {
  const open = html.indexOf(`<${tag}`);
  const close = html.indexOf(`</${tag}>`);
  return open < 0 ? '' : html.slice(open, close + tag.length + 3);
};

const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();
const importmap = pick('script');                  // el primero del documento es el importmap
const fonts = [...html.matchAll(/<link[^>]+fonts\.googleapis[^>]*>/g)].map((m) => m[0]).join('\n');

const out = `<title>Ajedrez de Batalla 3D</title>
${fonts}
<style>
${css}
</style>
${importmap}
${body}
`;

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/artifact.html'), out);
console.log('dist/artifact.html', (out.length / 1024).toFixed(1) + ' kB');

if (process.argv.includes('--wrap')) {
  writeFileSync(resolve(root, 'preview.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#fafaf8}
img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${out}
</body></html>`);
  console.log('preview.html (simula el envoltorio del publicador)');
}
