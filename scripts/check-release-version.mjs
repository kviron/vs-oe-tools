import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const version = packageJson.version;
const failures = [];

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  failures.push(`package.json version is not a stable SemVer: ${version}`);
}
if (packageLock.version !== version) {
  failures.push(`package-lock.json version is ${packageLock.version}, expected ${version}`);
}
if (packageLock.packages?.['']?.version !== version) {
  failures.push(`package-lock root package version is ${packageLock.packages?.['']?.version}, expected ${version}`);
}

const escapedVersion = version.replaceAll('.', '\\.');
const changelogHeading = new RegExp(`^## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
if (!changelogHeading.test(changelog)) {
  failures.push(`CHANGELOG.md has no dated heading for ${version}`);
}

if (failures.length > 0) {
  console.error('Release metadata check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release metadata is consistent for ${version}.`);
