// Renders public/icon.svg into the PNG icons a PWA needs, with headless Firefox (no image library needed).
//   node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire('C:/Users/c/projects/hearth/server/package.json');
const WebSocket = require('ws');
const svg = readFileSync('public/icon.svg', 'utf8');
// scale: how much of the square the artwork fills. Maskable icons keep the picture inside the safe circle (80%).
const sizes = [['favicon-32', 32, 1], ['icon-192', 192, 1], ['icon-512', 512, 1], ['maskable-512', 512, 1], ['apple-touch-icon', 180, 1.1]];
const profile = mkdtempSync(join(tmpdir(), 'ficons-'));
writeFileSync(join(profile, 'user.js'), 'user_pref("browser.shell.checkDefaultBrowser", false);\n');
const ff = spawn('C:/Program Files/Mozilla Firefox/firefox.exe', ['--headless', '--remote-debugging-port=9337', '--profile', profile, 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4500));
const ws = new WebSocket('ws://127.0.0.1:9337/session');
await new Promise((r) => ws.on('open', r));
let id = 0; const waiting = new Map();
ws.on('message', (m) => { const j = JSON.parse(m); if (j.id && waiting.has(j.id)) { waiting.get(j.id)(j); waiting.delete(j.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, (j) => (j.type === 'error' ? rej(new Error(j.message)) : res(j.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await send('session.new', { capabilities: {} });
const ctx = (await send('browsingContext.getTree')).contexts[0].context;
for (const [name, size, fill] of sizes) {
  await send('browsingContext.setViewport', { context: ctx, viewport: { width: size, height: size }, devicePixelRatio: 1 });
  const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  const page = `<html><body style="margin:0;background:#1E1410"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108"><rect width="108" height="108" fill="#1E1410"/><g transform="translate(54 54) scale(${fill}) translate(-54 -54)">${inner.replace('<rect width="108" height="108" fill="#1E1410"/>', '')}</g></svg></body></html>`;
  await send('browsingContext.navigate', { context: ctx, url: 'data:text/html;base64,' + Buffer.from(page).toString('base64'), wait: 'complete' });
  const shot = await send('browsingContext.captureScreenshot', { context: ctx });
  writeFileSync(`public/icons/${name}.png`, Buffer.from(shot.data, 'base64'));
  console.log('icon', name, size);
}
ws.close(); ff.kill(); process.exit(0);
