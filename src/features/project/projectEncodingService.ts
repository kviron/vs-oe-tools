import * as vscode from 'vscode';
import { previousEncodingsKey, sourceLanguageIds } from '../../core/constants';

interface PreviousEncoding {
	languageId: string;
	hadValue: boolean;
	value?: string;
}

export async function applyProjectEncoding(context: vscode.ExtensionContext, enabled: boolean): Promise<void> {
	let previousEncodings = context.workspaceState.get<PreviousEncoding[]>(previousEncodingsKey);

	if (enabled && !previousEncodings) {
		previousEncodings = sourceLanguageIds.map((languageId) => {
			const encoding = vscode.workspace
				.getConfiguration('files', { languageId })
				.inspect<string>('encoding')?.workspaceLanguageValue;

			return {
				languageId,
				hadValue: encoding !== undefined,
				value: encoding,
			};
		});
		await context.workspaceState.update(previousEncodingsKey, previousEncodings);
	}

	for (const languageId of sourceLanguageIds) {
		const configuration = vscode.workspace.getConfiguration('files', { languageId });
		const previousEncoding = previousEncodings?.find((item) => item.languageId === languageId);
		const encoding = enabled
			? 'windows1251'
			: previousEncoding?.hadValue
				? previousEncoding.value
				: undefined;

		await configuration.update(
			'encoding',
			encoding,
			vscode.ConfigurationTarget.Workspace,
			true,
		);
	}

	if (!enabled) {
		await context.workspaceState.update(previousEncodingsKey, undefined);
	}
}

// This method is called when your extension is activated

