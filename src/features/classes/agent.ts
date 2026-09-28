import type * as vscode from 'vscode';
import { createClassAttribute } from '../../infrastructure/database/attributeRepository';
import type { MethodEditorProvider } from '../methods/methodEditorProvider';
import { openAttributeDetails } from './views/attributeDetailsPanelManager';
import { openClassDetails, revealClassMethod } from './views/classDetailsPanelManager';
import { createLocalToolClass } from '../../infrastructure/database/localToolClassRepository';

export function createClassAgentActions(
	context: vscode.ExtensionContext,
	methodEditor: MethodEditorProvider,
	revealClass: (id: number) => Promise<void>,
) {
	return {
		revealClass,
		openClass: (id: number) => openClassDetails(context, methodEditor, id, true),
		createLocalToolClass: async (name: string, expectedDatabase: string, expectedHost: string, expectedPort: number) =>
			({ ...await createLocalToolClass(name, expectedDatabase, expectedHost, expectedPort) }),
		revealMethod: (classId: number, methodId: number) => revealClassMethod(context, methodEditor, classId, methodId),
		createClassAttribute: async (draft: Parameters<typeof createClassAttribute>[0]) => {
			const created = await createClassAttribute(draft);
			await revealClass(created.ownerClassId);
			await openAttributeDetails(context, created.id);
			return { attributeId: created.id, ownerClassId: created.ownerClassId, name: created.name };
		},
	};
}
