export interface CopyEntityIdMessage {
	command: 'copyEntityId';
	id: number | string;
}

export interface OpenClientEntityMessage {
	command: 'openClientEntity';
	role: 'main' | 'test';
	entityType: string;
	id: number;
}

export interface TableSelectionDebugMessage {
	command: 'tableSelectionDebug';
	message: string;
}

export interface CopyTableCellsMessage {
	command: 'copyTableCells';
	text: string;
}

export function isCopyEntityIdMessage(message: unknown): message is CopyEntityIdMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& message.command === 'copyEntityId'
		&& 'id' in message
		&& (typeof message.id === 'number' || typeof message.id === 'string');
}

export function isOpenClientEntityMessage(message: unknown): message is OpenClientEntityMessage {
	return typeof message === 'object'
		&& message !== null
		&& 'command' in message
		&& message.command === 'openClientEntity'
		&& 'role' in message
		&& (message.role === 'main' || message.role === 'test')
		&& 'entityType' in message
		&& typeof message.entityType === 'string'
		&& message.entityType.trim().length > 0
		&& 'id' in message
		&& typeof message.id === 'number'
		&& Number.isSafeInteger(message.id);
}

export function isCopyTableCellsMessage(message: object): message is CopyTableCellsMessage {
	return 'command' in message && message.command === 'copyTableCells'
		&& 'text' in message && typeof message.text === 'string';
}

export function isTableSelectionDebugMessage(message: object): message is TableSelectionDebugMessage {
	return 'command' in message && message.command === 'tableSelectionDebug'
		&& 'message' in message && typeof message.message === 'string';
}
