# WebView build and runtime contract

## Failure investigation

The reported browser error was a missing named export `i` from
`useForwardExpose-DFRYs6ks.js`. The current on-disk module exported `i`, and its
import graph passed validation. An isolated before/after build of the task
description did not reproduce a same-filename/different-content collision.
Therefore the exact cached response responsible for that incident remains
unverified; it must not be described as a proven bundler hashing defect.

The old publication boundary was demonstrably unsafe: all screens belonged to
one multi-entry bundle, loaded fixed entry URLs, shared generated chunks and a
stylesheet, and `emptyOutDir` deleted their common directory on every build.
An open screen had no identity for the build it was consuming. Rebuilding an
unrelated screen could invalidate files still referenced by open screens.
The earlier UUID chunk prefix and Explorer-specific query parameter only
worked around that boundary and have been removed.

## Responsibilities and contracts

| Module | Responsibility | Consumer contract |
| --- | --- | --- |
| `webview-ui/entries.json` | Registered screen identities | Array of entry names |
| `vite.webview.config.mts` | Compile one screen and its dependency graph | Mode selects a registered entry; coordinator supplies staging output |
| `scripts/build-webviews.mjs` | Coordinate build/watch and publish successful results | All entries by default; `--entry=name` rebuilds one registered entry |
| `scripts/webview/artifacts.mjs` | Validate and publish immutable artifacts | Snapshot directory; atomic manifest publication |
| `src/core/webview/assetManifest.ts` | Validate the runtime manifest contract | Select a directory confined to the requested entry |
| `src/infrastructure/webview/assets.ts` | Resolve a ready build for a view | `getWebviewAssetsRoot(extensionUri, entry)` returns its local resource root |
| Feature providers | Own their view lifecycle, HTML policy and typed messages | Consume the selected resource root; no cache/build-generation policy |

Manifest format:

```json
{
  "version": 1,
  "entries": {
    "explorer": { "directory": "explorer/<64-character SHA-256>" }
  }
}
```

Each directory contains `<entry>.js`, `webview.css`, and any local dependencies.
There are no generated JavaScript imports between screen snapshots. Shared
source components are reused at source level and compiled independently.
Shared design-system source styles still affect screens when those styles change.

## Publication invariants

1. Vite writes only into private staging. Runtime never reads staging.
2. The publisher copies staging before asynchronous validation, then checks
   named imports and verifies that the module graph stays inside the snapshot.
3. A content hash identifies the complete artifact set, including CSS.
   Identical bytes reuse an existing snapshot; changed bytes get another URL.
4. The publisher installs the complete directory before switching the manifest
   with a same-directory rename. A failed build cannot replace the working manifest.
5. A view resolves the manifest once when it is created and keeps its resource root.
   Existing snapshots are retained for already-open views, including lazy imports.

Independent graphs increase build time and duplicate bundled dependencies.
Development snapshots are retained deliberately; staging and incomplete publication
directories are excluded from VSIX packaging. Legacy shared-bundle files are also excluded.

## Verification

`node --test scripts/webview/artifacts.test.mjs` covers immutable generations,
independent screen updates, missing-export rejection and unchanged publication on
failure. Extension Host tests cover manifest selection and invalid paths.
Browser smoke checks must additionally verify boot and lazy UI controls with a
warm cache after a targeted rebuild; static checks alone do not prove rendering.
