import { z } from 'zod';
import type { NavigationActions } from './navigationTools';

/** Input schema and invocation belong to the feature, independently of HTTP. */
export interface CommandConnection {
	expectedDatabase: string;
	expectedHost: string;
	expectedPort: number;
}
type CommandEntry = {
	schema: z.ZodTypeAny;
	execute: (input: unknown, actions: NavigationActions) => Promise<Record<string, unknown>>;
};
type Intersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;
export function composeCommands<const G extends readonly Record<string, CommandEntry>[]>(
	...groups: G
): Intersection<G[number]> {
	const result: Record<string, CommandEntry> = {};
	for (const group of groups) {
		for (const [name, entry] of Object.entries(group)) {
			if (Object.prototype.hasOwnProperty.call(result, name)) {
				throw new Error(`Duplicate command: ${name}`);
			}
			Object.defineProperty(result, name, { value: entry, enumerable: true });
		}
	}
	return result as Intersection<G[number]>;
}
export function defineCommand<S extends z.ZodTypeAny, P extends z.AnyZodObject = z.AnyZodObject>(
	schema: S,
	run: (input: z.output<S>, actions: NavigationActions) => Promise<Record<string, unknown>>,
	tool?: {
		input: P;
		description: string;
		annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
		timeoutMs?: number;
		prepare: (input: z.output<P>, connection: CommandConnection) => z.input<S>;
	},
) {
	return {
		schema,
		tool: tool
			? {
					input: tool.input,
					description: tool.description,
					annotations: tool.annotations,
					timeoutMs: tool.timeoutMs,
					prepare: (input: unknown, connection: CommandConnection) =>
						tool.prepare(tool.input.parse(input), connection),
				}
			: undefined,
		async execute(input: unknown, actions: NavigationActions) {
			const parsed = schema.safeParse(input);
			if (!parsed.success) {
				throw new Error(parsed.error.issues[0].message);
			}
			return run(parsed.data, actions);
		},
	};
}
export const positiveId = (message = 'Navigation ID must be a positive integer.') =>
	z.number({ required_error: message, invalid_type_error: message }).int(message).positive(message).safe(message);
export const text = (message: string) => z.string({ required_error: message, invalid_type_error: message });
export const nonempty = (message: string) => text(message).refine((value) => Boolean(value.trim()), message);
export const integer = (min: number, max: number, message: string) =>
	z.number({ required_error: message, invalid_type_error: message }).int(message).min(min, message).max(max, message);
export const role = (action: string) =>
	z.enum(['main', 'test'], { errorMap: () => ({ message: `Role must be main or test for ${action}.` }) });
export const expectedConnection = (action: string) => {
	const message = `expectedDatabase, expectedHost and expectedPort are required for ${action}.`;
	return {
		expectedDatabase: nonempty(message),
		expectedHost: nonempty(message),
		expectedPort: integer(1, 65535, message),
	};
};
export const nativeConnection = (action: string) => ({
	database: text(`database is invalid for ${action}.`).regex(
		/^[\p{L}\p{N}_.-]+$/u,
		`database is invalid for ${action}.`,
	),
	host: text(`host is invalid for ${action}.`).regex(/^[\p{L}\p{N}_.:-]+$/u, `host is invalid for ${action}.`),
});
