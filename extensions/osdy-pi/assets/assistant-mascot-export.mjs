/* global document */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import console from 'node:console';
// Run: node extensions/osdy-pi/assets/assistant-mascot-export.mjs /path/to/osdy-pi-landing
// Uses existing landing dependencies only; writes only the adjacent SVG and PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';

const landing = resolve(process.argv[2]);
const require = createRequire(`${landing}/package.json`);
const { chromium } = require('@playwright/test');
const source = readFileSync(`${landing}/src/data/mascot.ts`, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mascot, toneMap, mascotColors } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
// Default landing theme: themes[0], Osdy Pi New. Resolve CSS variables explicitly.
const colors = { ...mascotColors, p: '#22d3ee', c: '#a78bfa', v: '#67e8f9' };
const font = readFileSync(`${landing}/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2`).toString('base64');
const rows = mascot.map((row, y) => {
 const edges = [...row].map((ch, x) => ch === ' ' ? -1 : x).filter(x => x >= 0).reverse().slice(0, 3);
 const spans = [...row].map((ch, x) => {
  const edge = edges.indexOf(x);
  const tone = edge >= 0 ? ['p', 'c', 'v'][edge] : toneMap[y]?.[x];
  return `<tspan x="${x * 6}" fill="${colors[tone] ?? colors.m}">${ch}</tspan>`;
 }).join('');
 return `<text y="${y * 10 + 9}" font-family="JetBrains Mono, monospace" font-size="10" xml:space="preserve">${spans}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="350" viewBox="0 0 360 350">\n${rows.join('\n')}\n</svg>\n`;
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 360, height: 350 }, deviceScaleFactor: 1 });
 await page.setContent(`<style>html,body{margin:0;background:transparent}@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400}</style>${svg}`);
 await page.evaluate(async () => { await document.fonts.load('10px "JetBrains Mono"'); await document.fonts.ready; });
 if (!await page.evaluate(() => document.fonts.check('10px "JetBrains Mono"'))) throw new Error('Font failed to load');
 writeFileSync(new URL('./assistant-mascot.svg', import.meta.url), svg);
 await page.locator('svg').screenshot({ path: new URL('./assistant-mascot.png', import.meta.url).pathname, omitBackground: true });
 console.log('Exported transparent 360×350 PNG with loaded JetBrains Mono 400 and default landing edge colors.');
} finally {
 await browser.close();
}
