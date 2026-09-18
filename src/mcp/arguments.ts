import type { DatabaseRole } from '../core/database';

export function readArgument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index >= 0 ? process.argv[index + 1] : undefined;
	if (!value) {
		throw new Error(`Missing required argument ${name}.`);
	}
	return value;
}

export function readOptionalArgument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

export function readRoleArgument(): DatabaseRole {
	const value = readOptionalArgument('--database-role') ?? 'main';
	if (value !== 'main' && value !== 'test') {
		throw new Error('--database-role must be main or test.');
	}
	return value;
}
