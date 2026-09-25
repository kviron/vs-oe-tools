import type * as vscode from 'vscode';
import { databaseProfileSetting, databaseRoleSetting } from '../core/constants';
import { closeClassDetailPanels, closeAttributeDetailPanels, closePropertyDetailPanels, closeEntityPropertiesPanels, closeClassObjectPanels, closeObjectViewPanels } from '../features/classes';
import { closePackageContentPanels } from '../features/packages';
import { closeSpuEditorPanels } from '../features/spu';
import type { ExplorerViewProvider } from '../features/explorer';
import type { PackageSyncPanelManager } from '../features/package-sync';
import type { createDatabaseSelection } from '../features/project';

interface Dependencies {
	selection: ReturnType<typeof createDatabaseSelection>;
	explorer: ExplorerViewProvider;
	packageSync: PackageSyncPanelManager;
}

export function createDatabaseChangeHandler({ selection, explorer, packageSync }: Dependencies) {
	return async (event: vscode.ConfigurationChangeEvent): Promise<void> => {
		if (!event.affectsConfiguration(`vcVeTools.${databaseRoleSetting}`)
			&& !event.affectsConfiguration(`vcVeTools.${databaseProfileSetting}`)) { return; }
		await selection.publishActive();
		await selection.publishWorkspace();
		closeClassDetailPanels();
		closeAttributeDetailPanels();
		closePropertyDetailPanels();
		closeEntityPropertiesPanels();
		closeClassObjectPanels();
		closeObjectViewPanels();
		closePackageContentPanels();
		closeSpuEditorPanels();
		explorer.refreshClasses();
		packageSync.refreshForDatabaseChange();
	};
}
