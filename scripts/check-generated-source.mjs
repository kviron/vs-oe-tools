import { readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const sourceRoot = join(process.cwd(), 'src');
const generatedFiles = [];

async function visit(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			await visit(absolutePath);
		} else if (extname(entry.name) === '.js' || entry.name.endsWith('.js.map')) {
			generatedFiles.push(relative(process.cwd(), absolutePath));
		}
	}
}

await visit(sourceRoot);
if (generatedFiles.length > 0) {
	console.error('Generated JavaScript must be written to out/ or dist/, not src/:');
	for (const file of generatedFiles) { console.error(`- ${file}`); }
	process.exitCode = 1;
}
