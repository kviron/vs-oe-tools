# Repository instructions for AI agents

- Follow `CONTRIBUTING.md` for every version, release, and commit decision.
- Use Conventional Commits in the repository format: `type(scope): description`.
- Keep commit subjects in English, lowercase, without a trailing period, and at most 72 characters.
- Before creating a commit, inspect `git status` and `git diff --cached`. Preserve unrelated user changes.
- Never commit secrets, `.tmp-*` profiles, logs, captures, diagnostic databases, generated CSV files, `releases/`, or `*.vsix` files.
- Apply SemVer by user-visible impact. Before `1.0.0`, use `MINOR` for breaking changes.
- For a release, keep the versions in `package.json`, `package-lock.json`, and the root lockfile package identical; add the dated version section to `CHANGELOG.md`.
- Run `npm run check:release` before builds and release commits. Run tests and packaging in proportion to the change.
- Store release artifacts under ignored `releases/` and publish them through the repository release interface.
- Do not claim that a local VSIX build was published.
- For East Express metadata, verify the active database and prefer the live native client MCP for creation and changes. Use extension MCP tools only when the native client lacks the needed operation; `create_class_method_checked` itself uses native client methods, and `update_method_source` prefers native `class_method_change` before its extension fallback. After every method creation or change, inspect the compilation result and resolve errors before claiming completion. If calling native tools directly, call `compile_method` with the method ID. A saved method alone is not a completed check.
- Keep `src/application/activate.ts` as the extension startup conductor: it may call ordered application stages, pass their results, and await required readiness. Do not put feature behavior, command or view registration, event handlers, service construction, `Disposable` ownership, or business callbacks there. Put cross-feature wiring in a named application stage, and feature implementation behind its public `src/features/<feature>/index.ts` API. Keep the stage order visible in `activate.ts`.
- Before each refactor, define every proposed module's single responsibility and smallest useful contract. Keep it within one functional area; split a module when it owns unrelated behavior or needs to expose unrelated capabilities. Export only what its consumers actually need, and avoid adding layers that merely forward calls without owning a responsibility.
