import type { z } from 'zod';
import { commandRegistry } from './commandRegistry';
export type NavigationAction = keyof typeof commandRegistry;
export type NavigationRequest = {
	[K in NavigationAction]: { action: K } & z.output<(typeof commandRegistry)[K]['schema']>;
}[NavigationAction];
export function validateRequest(value: unknown): NavigationRequest {
	if (!value || typeof value !== 'object') {
		throw new Error('Invalid navigation request.');
	}
	const action = (value as { action?: unknown }).action;
	if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(commandRegistry, action)) {
		throw new Error('Unknown navigation action.');
	}
	const result = commandRegistry[action as NavigationAction].schema.safeParse(value);
	if (!result.success) {
		throw new Error(result.error.issues[0].message);
	}
	// The selected schema and discriminant share the same registry key.
	return { ...result.data, action } as NavigationRequest;
}
