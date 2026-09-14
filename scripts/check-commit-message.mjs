import { existsSync, readFileSync } from 'node:fs';

const types = new Set([
  'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'build', 'ci', 'chore', 'revert',
]);
const scopes = new Set([
  'settings', 'logs', 'http-api', 'mcp', 'package-sync', 'database', 'explorer',
  'production-tasks', 'webview', 'extension', 'release', 'repo', 'deps', 'tests',
  'build', 'ci',
]);

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/check-commit-message.mjs <message-file-or-subject>');
  process.exit(1);
}

const rawMessage = existsSync(input) ? readFileSync(input, 'utf8') : input;
const subject = rawMessage
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line && !line.startsWith('#'));

if (!subject) {
  console.error('Commit message is empty.');
  process.exit(1);
}

if (subject.startsWith('Merge ') || /^Revert ".+"$/.test(subject)) {
  process.exit(0);
}

if (subject.length > 72) {
  console.error(`Commit subject is ${subject.length} characters; maximum is 72.`);
  process.exit(1);
}

const match = /^(?<type>[a-z]+)\((?<scope>[a-z0-9][a-z0-9-]*)\)(?<breaking>!)?: (?<description>.+)$/.exec(subject);
if (!match?.groups) {
  console.error('Expected: type(scope): lowercase imperative description');
  console.error('Example: feat(http-api): add request history');
  process.exit(1);
}

const { type, scope, description } = match.groups;
if (!types.has(type)) {
  console.error(`Unsupported commit type: ${type}`);
  process.exit(1);
}
if (!scopes.has(scope)) {
  console.error(`Unsupported commit scope: ${scope}`);
  console.error(`Allowed scopes: ${[...scopes].join(', ')}`);
  process.exit(1);
}
if (!/^[a-z0-9]/.test(description) || description.endsWith('.')) {
  console.error('Description must start with a lowercase English letter or digit and have no trailing period.');
  process.exit(1);
}

console.log(`Valid commit message: ${subject}`);
