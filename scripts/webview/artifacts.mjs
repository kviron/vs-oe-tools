import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? files(join(directory, item.name)) : [join(directory, item.name)]).sort();
}

/** Validates a closed module graph and publishes an immutable, content-addressed snapshot. */
export async function publishWebviewSnapshot(outputRoot, entry, staging) {
  if (!/^[a-z][a-z0-9-]*$/.test(entry)) { throw new Error(`Invalid webview entry: ${entry}`); }
  const parent = join(outputRoot, entry);
  mkdirSync(parent, { recursive: true });
  const temporary = join(parent, `.publishing-${randomUUID()}`);
  // Copy before awaiting validation: a watch rebuild must not change the files being checked.
  cpSync(staging, temporary, { recursive: true });
  try {
    const script = join(temporary, `${entry}.js`);
    if (!existsSync(script) || !existsSync(join(temporary, 'webview.css'))) { throw new Error(`Incomplete webview build: ${entry}`); }
    const graph = await build({ entryPoints: [script], bundle: true, write: false, metafile: true,
      outdir: join(temporary, '.validation'), logLevel: 'silent' });
    if (Object.keys(graph.metafile.inputs).some(file => !resolve(file).startsWith(resolve(temporary) + sep))) {
      throw new Error(`Webview ${entry} imports files outside its snapshot`);
    }
    const digest = createHash('sha256');
    for (const file of files(temporary)) {
      digest.update(relative(temporary, file).replaceAll('\\', '/'));
      digest.update('\0'); digest.update(readFileSync(file)); digest.update('\0');
    }
    const directory = `${entry}/${digest.digest('hex')}`;
    const target = join(outputRoot, directory);
    if (!existsSync(target)) { renameSync(temporary, target); }
    return { directory };
  } finally {
    if (!resolve(temporary).startsWith(resolve(parent) + sep)) { throw new Error('Unsafe temporary snapshot path'); }
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Readers see an old or a complete new manifest, never intermediate build state. */
export function publishWebviewManifest(outputRoot, entries) {
  mkdirSync(outputRoot, { recursive: true });
  const temporary = join(outputRoot, `.manifest-${randomUUID()}.json`);
  writeFileSync(temporary, JSON.stringify({ version: 1, entries }, null, 2));
  renameSync(temporary, join(outputRoot, 'manifest.json'));
}
