import type * as vscode from 'vscode';
import { databaseProfileSetting, databaseRoleSetting } from '../core/constants';

interface Dependencies {
	selection: {
		publishActive(): Promise<void>;
		publishWorkspace(): Promise<void>;
	};
	onDatabaseChanged: ReadonlyArray<() => void | Promise<void>>;
}

/** Publishes the selection before invalidating feature state in the supplied order. */
export function createDatabaseChangeHandler({ selection, onDatabaseChanged }: Dependencies) {
	return async (event: vscode.ConfigurationChangeEvent): Promise<void> => {
		if (!event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)
			&& !event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)) { return; }
		await selection.publishActive();
		await selection.publishWorkspace();
		for (const handler of onDatabaseChanged) { await handler(); }
	};
}
