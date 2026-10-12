import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { publishWebviewManifest, publishWebviewSnapshot } from './artifacts.mjs';

test('publishes immutable view snapshots and leaves another view unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vc-ve-webviews-'));
  try {
    const stage = join(root, 'stage'); mkdirSync(stage);
    writeFileSync(join(stage, 'webview.css'), 'body{}');
    writeFileSync(join(stage, 'explorer.js'), 'import { i } from "./shared.js"; console.log(i);');
    writeFileSync(join(stage, 'shared.js'), 'export const i = 1;');
    const out = join(root, 'out');
    const explorer = await publishWebviewSnapshot(out, 'explorer', stage);
    assert.deepEqual(await publishWebviewSnapshot(out, 'explorer', stage), explorer);
    writeFileSync(join(stage, 'tasks.js'), 'export const task = 1;');
    const tasks = await publishWebviewSnapshot(out, 'tasks', stage);
    publishWebviewManifest(out, { explorer, tasks });
    const oldScript = readFileSync(join(out, explorer.directory, 'explorer.js'), 'utf8');
    writeFileSync(join(stage, 'tasks.js'), 'export const task = 2;');
    const changedTasks = await publishWebviewSnapshot(out, 'tasks', stage);
    assert.notEqual(changedTasks.directory, tasks.directory);
    publishWebviewManifest(out, { explorer, tasks: changedTasks });
    assert.equal(readFileSync(join(out, explorer.directory, 'explorer.js'), 'utf8'), oldScript);
    assert.equal(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')).entries.explorer.directory, explorer.directory);
    assert.equal(readFileSync(join(out, tasks.directory, 'tasks.js'), 'utf8'), 'export const task = 1;');
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a missing named export before publication and preserves the manifest', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vc-ve-webviews-'));
  try {
    const stage = join(root, 'stage'); mkdirSync(stage);
    writeFileSync(join(stage, 'webview.css'), '');
    writeFileSync(join(stage, 'explorer.js'), 'import { i } from "./shared.js"; console.log(i);');
    writeFileSync(join(stage, 'shared.js'), 'export const i = 1;');
    const out = join(root, 'out');
    const explorer = await publishWebviewSnapshot(out, 'explorer', stage);
    publishWebviewManifest(out, { explorer });
    const previous = readFileSync(join(out, 'manifest.json'), 'utf8');
    writeFileSync(join(stage, 'shared.js'), 'export const different = 1;');
    await assert.rejects(publishWebviewSnapshot(out, 'explorer', stage), /No matching export/);
    assert.equal(readFileSync(join(out, 'manifest.json'), 'utf8'), previous);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); rmSync(root, { recursive: true, force: true });
  }
});
