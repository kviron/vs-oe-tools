import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { publishWebviewManifest, publishWebviewSnapshot } from './webview/artifacts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(root, 'dist', 'webview');
const entries = JSON.parse(readFileSync(join(root, 'webview-ui', 'entries.json'), 'utf8'));
const selected = process.argv.find(arg => arg.startsWith('--entry='))?.slice('--entry='.length);
if (selected && !entries.includes(selected)) { throw new Error(`Unknown webview: ${selected}`); }
const watch = process.argv.includes('--watch');
const stagingRoot = join(outputRoot, '.staging', randomUUID());
mkdirSync(stagingRoot, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(readFileSync(join(outputRoot, 'manifest.json'), 'utf8')).entries; }
catch { /* First build has no published manifest. */ }
const pending = { ...manifest };
let publication = Promise.resolve();
const watchers = [];

function removeStaging() {
  const target = resolve(stagingRoot);
  if (!target.startsWith(resolve(outputRoot, '.staging') + sep)) { throw new Error('Unsafe staging path'); }
  rmSync(target, { recursive: true, force: true });
}
if (watch) {
  const stop = async () => {
    await Promise.all(watchers.map(watcher => watcher.close()));
    await publication;
    removeStaging();
  };
  process.once('SIGINT', () => { void stop().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); }); });
  process.once('SIGTERM', () => { void stop().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); }); });
}

try {
  for (const entry of selected ? [selected] : entries) {
    const staging = join(stagingRoot, entry);
    const result = await build({ configFile: join(root, 'vite.webview.config.mts'), mode: entry, logLevel: 'error',
      build: { outDir: staging, ...(watch ? { watch: {} } : {}) } });
    if (watch) {
      watchers.push(result);
      result.on('event', event => {
        if (event.code === 'ERROR') { console.error(event.error); }
        if (event.code !== 'END') { return; }
        publication = publication.then(async () => {
          pending[entry] = await publishWebviewSnapshot(outputRoot, entry, staging);
          if (entries.every(name => pending[name])) { publishWebviewManifest(outputRoot, pending); }
          console.log(`Webview ready: ${entry}`);
        }).catch(error => console.error(error));
      });
    } else {
      pending[entry] = await publishWebviewSnapshot(outputRoot, entry, staging);
      console.log(`Webview checked: ${entry}`);
    }
  }
  if (!watch) {
    if (!entries.every(entry => pending[entry])) { throw new Error('Build all webviews before publishing a single entry.'); }
    publishWebviewManifest(outputRoot, pending);
    console.log('Webview manifest published.');
  }
} finally {
  if (!watch) {
    // Published snapshots can still be in use by open webviews.
    removeStaging();
  }
}
