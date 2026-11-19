// Vice Panel Studio — the gta6-cover-art-01 entry program (Node 22, standard
// library only, no network, deterministic).
//
// What is being handed in is the app/ folder beside this file: a plain,
// offline web app (index.html plus its ES modules, fonts and sample photos)
// that composes multi-panel, GTA-style poster covers from a visitor's own
// photos and exports them as PNGs. This program's job is the hand-in itself:
//
//   1. pre-flight — walk app/ and screenshots/ and refuse, with the reason
//      printed, anything the scorer's caps would refuse anyway;
//   2. copy app/ and screenshots/ into the output directory
//      (MAKEFUN_OUTPUT_DIR, or /output inside the grader's container);
//   3. write dossier.json there with the vendored make.fun library and
//      print a short summary of what was handed in.
//
// Try the app locally with `node serve.ts`, then open the page it prints.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The caps, mirrored from the scorer's gate so a bad entry fails here first
// with a readable message instead of failing silently at scoring time.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const appDir = join(here, 'app');
const shotsDir = join(here, 'screenshots');

/** Every file under `dir`, as paths relative to `dir` itself. */
function listFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(relative(dir, full));
    }
  };
  walk(dir);
  return found.sort();
}

function fail(reason) {
  console.error(`vice-panel-studio: refusing to hand in — ${reason}`);
  process.exit(1);
}

// ---- pre-flight -----------------------------------------------------------

const appFiles = listFiles(appDir);
if (appFiles.length > CAPS.app_max_files) {
  fail(`app/ holds ${appFiles.length} files, over the ${CAPS.app_max_files} cap`);
}
let appBytes = 0;
for (const rel of appFiles) {
  if (Buffer.byteLength(rel.split(sep).join('/')) > CAPS.app_path_max_bytes) {
    fail(`app/${rel} has a path over ${CAPS.app_path_max_bytes} bytes`);
  }
  appBytes += statSync(join(appDir, rel)).size;
}
if (appBytes > CAPS.app_max_bytes) {
  fail(`app/ totals ${appBytes} bytes, over the ${CAPS.app_max_bytes} cap`);
}
if (!appFiles.includes('index.html')) fail('app/index.html is missing');

const shotFiles = existsSync(shotsDir) ? listFiles(shotsDir) : [];
if (shotFiles.length > CAPS.screenshots.max) {
  fail(`${shotFiles.length} screenshots, over the ${CAPS.screenshots.max} cap`);
}
for (const rel of shotFiles) {
  const size = statSync(join(shotsDir, rel)).size;
  if (size > CAPS.screenshots.max_bytes) {
    fail(`screenshots/${rel} is ${size} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
  }
}

// ---- hand-in ---------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
cpSync(appDir, join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (shotFiles.length > 0) cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));

console.log(
  `vice-panel-studio: handed in ${appFiles.length} app files (${appBytes} bytes) ` +
    `and ${shotFiles.length} screenshot(s); dossier.json written to ${outDir}`,
);
