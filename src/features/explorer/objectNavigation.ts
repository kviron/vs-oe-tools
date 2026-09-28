import * as vscode from 'vscode';
import type { DatabaseObjectKind } from '../../core/objectSearch';
import type { ExplorerDependencies } from './explorerViewProvider';

type NavigationDependencies = Pick<ExplorerDependencies, 'openClass' | 'openMethod' | 'openModule' | 'openAttribute'>;
type ObjectOpener = (id: number, pinned: boolean) => Promise<void>;
type ObjectNavigator = (id: number, kind: DatabaseObjectKind, pinned: boolean) => Promise<void>;

/** Routes search results to their supported editors and preserves the generic fallback. */
export function createObjectNavigator(dependencies: NavigationDependencies): ObjectNavigator {
	const openers: Partial<Record<DatabaseObjectKind, ObjectOpener>> = {
		class: (id, pinned) => dependencies.openClass(id, pinned),
		method: id => dependencies.openMethod(id),
		module: id => dependencies.openModule(id),
		attribute: id => dependencies.openAttribute(id),
	};
	return async (id, kind, pinned) => {
		try {
			const open = openers[kind];
			if (open) {
				await open(id, pinned);
			} else {
				void vscode.window.showInformationMessage(`Для объекта ID=${id} пока нет специализированного редактора.`);
			}
		} catch (error) {
			void vscode.window.showErrorMessage(`Не удалось открыть объект ${id}: ${error instanceof Error ? error.message : String(error)}`);
		}
	};
}
