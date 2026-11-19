// Drives the four entry screenshots with headless Chrome.
// Starts the dev server, opens each ?shot= scene, waits for the app's
// window.__shotReady flag, and saves JPEGs into screenshots/.
// Also fails loudly on any page console error, and probes that the cover
// canvas can produce a real PNG (the export path).

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from '/home/hatch/workspace/makefun/.shottools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/home/hatch/workspace/makefun/.browsers/chrome-headless-shell/linux-158.0.8127.36/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://127.0.0.1:8123';

const SHOTS = [
  {
    file: '1-cover.jpg',
    w: 1280,
    h: 720,
    query: '?shot=cover&layout=hero3&grade=sunset&size=landscape&title=NEON%20SHORES&subtitle=Vice%20Panel%20Nights&photos=pier,boulevard',
  },
  {
    file: '2-editor.jpg',
    w: 1280,
    h: 800,
    query: '?shot=editor&layout=grid9&grade=sunset&size=landscape&title=NEON%20SHORES&subtitle=Vice%20Panel%20Nights&photos=pier,boulevard',
  },
  {
    file: '3-cover.jpg',
    w: 1024,
    h: 1280,
    query: '?shot=cover&layout=grid9&grade=neon&size=portrait&title=NEON%20SHORES&subtitle=Midnight%20Run&photos=boulevard,pier',
  },
  {
    file: '4-cover.jpg',
    w: 1080,
    h: 1080,
    query: '?shot=cover&layout=grid6&grade=golden&size=square&title=GOLDEN%20MILE&subtitle=Vice%20Panel%20Nights&photos=pier,boulevard',
  },
];

const server = spawn('node', ['serve.ts', '--port', '8123'], { cwd: here, stdio: 'pipe' });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not start: ${serverLog}`);
}

const errors = [];
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
  });
  for (const shot of SHOTS) {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`${shot.file}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`${shot.file}: pageerror ${err.message}`));
    await page.setViewport({ width: shot.w, height: shot.h });
    await page.goto(`${BASE}/${shot.query}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
    const path = join(here, 'screenshots', shot.file);
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    console.log(`${shot.file}: ${shot.w}x${shot.h} ${statSync(path).size} bytes`);
    if (shot.file === '2-editor.jpg') {
      const pngLength = await page.evaluate(() => document.getElementById('cover').toDataURL('image/png').length);
      console.log(`editor canvas PNG data URL length: ${pngLength}`);
      if (pngLength < 10000) errors.push('editor canvas PNG probe too small');
    }
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (errors.length > 0) {
  console.error(`CONSOLE/PAGE ERRORS:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('all shots taken, zero console errors');
