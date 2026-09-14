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
