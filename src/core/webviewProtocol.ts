import type { ClassAttribute, ClassDetails, ClassTreeRow } from '../features/classes/models';

export type ExplorerWebviewMessage =
	| { command: 'loadClasses' }
	| { command: 'openClass'; id: number; pinned: boolean };

export type ExplorerHostMessage =
	| { command: 'classesLoaded'; classes: ClassTreeRow[] }
	| { command: 'classesLoadFailed'; message: string }
	| { command: 'resetClasses' };

export type ClassDetailsWebviewMessage =
	| { command: 'classDetailsReady' }
	| { command: 'loadClassAttributes' };
export type ClassDetailsHostMessage =
	| { command: 'classDetailsLoaded'; details: ClassDetails }
	| { command: 'classAttributesLoaded'; attributes: ClassAttribute[] }
	| { command: 'classAttributesLoadFailed'; message: string };
export type WebviewMessage = ExplorerWebviewMessage | ClassDetailsWebviewMessage;

export function isClassDetailsWebviewMessage(message: unknown): message is ClassDetailsWebviewMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& (message.command === 'classDetailsReady' || message.command === 'loadClassAttributes');
}

export function isExplorerWebviewMessage(message: unknown): message is ExplorerWebviewMessage {
	if (typeof message !== 'object' || message === null || !('command' in message)) {
		return false;
	}
	if (message.command === 'loadClasses') {
		return true;
	}
	return message.command === 'openClass' && 'id' in message && 'pinned' in message
		&& typeof message.id === 'number' && typeof message.pinned === 'boolean';
}
