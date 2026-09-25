import * as vscode from 'vscode';
import * as path from 'node:path';
import type { CapturedAuthorization, ProductionConnectionOptions, ProductionTasksLogger } from './models';
import { findCaptureMetadata, parseStoredAuthorization } from './capture';
import { extractCapturedAuthorization, extractClientSessionKey, extractCurrentPersonId } from './oenpProtocol';

export interface ProductionSession {
	getOptions(): Promise<ProductionConnectionOptions>;
	importCapture(): Promise<boolean>;
	setPassword(): Promise<boolean>;
}

export function createProductionSession(
	context: vscode.ExtensionContext,
	workspacePath: string | undefined,
	getCredentials: () => Promise<{ username: string; password: string | undefined }>,
	logger: ProductionTasksLogger,
): ProductionSession {
	const authorizationKey = `vcVeTools.productionAuthorizationReference:${workspacePath?.toLowerCase() ?? 'default'}`;
	const passwordKey = `vcVeTools.productionPassword:${workspacePath?.toLowerCase() ?? 'default'}`;

	const getOptions = async (): Promise<ProductionConnectionOptions> => {
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		const credentials = await getCredentials();
		const captureMetadata = await findCaptureMetadata(
			[workspacePath, context.extensionUri.fsPath].filter((value): value is string => Boolean(value)),
		);
		const storedAuthorization = parseStoredAuthorization(await context.secrets.get(authorizationKey));
		if (captureMetadata.authorization && !storedAuthorization) {
			await context.secrets.store(authorizationKey, JSON.stringify(captureMetadata.authorization));
		}
		let personId = configuration.get<number>('productionPersonId', 0);
		if (!/^\d{9}$/.test(String(personId))) {
			const detectedPersonId = captureMetadata.personId;
			if (detectedPersonId) {
				personId = detectedPersonId;
				await configuration.update('productionPersonId', personId, vscode.ConfigurationTarget.Workspace);
				logger.info('Persons.ID автоматически найден в захвате рабочей области.');
			}
		}
		const authorizationReference = captureMetadata.authorization ?? storedAuthorization;
		const productionPassword = await context.secrets.get(passwordKey);
		const productionUsername = authorizationReference?.username ?? credentials.username;
		const effectivePassword = productionPassword ?? credentials.password;
		if (!productionUsername || !effectivePassword) { throw new Error('Укажите пароль для production-задач.'); }
		if (!/^\d{9}$/.test(String(personId))) { throw new Error('Укажите девятизначный vcVeTools.productionPersonId (Persons.ID) или импортируйте его из veworks.pcapng.'); }
		return {
			host: configuration.get<string>('productionHost', '172.20.0.23'),
			port: configuration.get<number>('productionPort', 3060),
			database: configuration.get<string>('productionDatabase', 'ric224'),
			clientSessionKey: configuration.get<string>('productionClientSessionKey', ''),
			username: productionUsername,
			password: effectivePassword,
			personId,
			authorizationReference,
		};
	};

	const importCapture = async (): Promise<boolean> => {
		const selected = await vscode.window.showOpenDialog({
			canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
			defaultUri: workspacePath ? vscode.Uri.file(workspacePath) : undefined,
			filters: { 'Wireshark capture': ['pcapng'] },
			openLabel: 'Импортировать настройки OENP',
		});
		if (!selected?.length) { return false; }
		const captures = new Map(selected.map(uri => [uri.fsPath.toLowerCase(), uri]));
		const captureDirectories = new Set(selected.map(uri => path.dirname(uri.fsPath)));
		if (workspacePath) { captureDirectories.add(workspacePath); }
		for (const directory of captureDirectories) {
			try {
				for (const [name, fileType] of await vscode.workspace.fs.readDirectory(vscode.Uri.file(directory))) {
					if (fileType === vscode.FileType.File && name.toLowerCase().endsWith('.pcapng')) {
						const uri = vscode.Uri.file(path.join(directory, name));
						captures.set(uri.fsPath.toLowerCase(), uri);
					}
				}
			} catch (error) {
				logger.warning('Не удалось проверить соседние файлы захвата.', { directory, error: String(error) });
			}
		}
		let key: string | undefined;
		let personId: number | undefined;
		let authorization: CapturedAuthorization | undefined;
		for (const uri of captures.values()) {
			const capture = Buffer.from(await vscode.workspace.fs.readFile(uri));
			key ??= extractClientSessionKey(capture);
			personId ??= extractCurrentPersonId(capture);
			authorization ??= extractCapturedAuthorization(capture);
			if (key && personId && authorization) { break; }
		}
		if (!key) {
			void vscode.window.showErrorMessage('В выбранном захвате не найден новый ключ клиентской сессии OENP. Начните захват до подключения клиента и импортируйте файл повторно.');
			return false;
		}
		const configuration = vscode.workspace.getConfiguration('vcVeTools');
		await configuration.update('productionClientSessionKey', key, vscode.ConfigurationTarget.Workspace);
		if (personId) { await configuration.update('productionPersonId', personId, vscode.ConfigurationTarget.Workspace); }
		if (authorization) { await context.secrets.store(authorizationKey, JSON.stringify(authorization)); }
		logger.info('Настройки из захвата импортированы.', { checkedCaptureFiles: captures.size, importedSessionKey: Boolean(key), importedPersonId: Boolean(personId), foundAuthorizationReference: Boolean(authorization) });
		void vscode.window.showInformationMessage(`Настройки OENP импортированы: ${[key && 'ключ сессии', personId && 'Persons.ID'].filter(Boolean).join(', ')}.`);
		return true;
	};

	const setPassword = async (): Promise<boolean> => {
		const password = await vscode.window.showInputBox({
			title: 'Доступ к задачам production',
			prompt: 'Введите пароль, с которым Восточный Экспресс подключается к production. Он сохранится только в SecretStorage VS Code.',
			password: true,
			ignoreFocusOut: true,
			validateInput: value => value.length > 0 ? undefined : 'Пароль не может быть пустым.',
		});
		if (password === undefined) { return false; }
		await context.secrets.store(passwordKey, password);
		logger.info('Отдельный пароль production сохранён в SecretStorage.');
		return true;
	};

	return { getOptions, importCapture, setPassword };
}
