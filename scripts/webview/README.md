# WebView build tools

`npm run build:webview` type-checks the frontend, builds each registered screen
independently, validates its generated module graph, and atomically publishes
`dist/webview/manifest.json` after all builds succeed.

`node scripts/build-webviews.mjs --entry=production-task-details` rebuilds only
that screen and preserves all other published entries. An initial complete
build is required first.

`npm run watch:webview` watches the independent screen graphs. Only successful
builds update the manifest; a build error leaves the prior snapshot available.
Existing view instances keep their original resource root and lazy chunks.

Run `node --test scripts/webview/artifacts.test.mjs` for the publisher regression
tests. They also run before the Extension Host suite via `npm test`.

The registry, publication invariants and runtime contract are documented in
`docs/WEBVIEW_BUILD_CONTRACT.md`.
