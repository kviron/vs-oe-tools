import * as vscode from 'vscode';

interface ClassInput {
	classId: number;
}

interface MethodInput {
	methodId: number;
}

interface MethodInClassInput extends MethodInput {
	classId: number;
}

export interface NavigationActions {
	revealClass(classId: number): Promise<void>;
	openClass(classId: number): Promise<void>;
	openMethod(methodId: number): Promise<void>;
	revealMethod(classId: number, methodId: number): Promise<void>;
	updateMethodSource(methodId: number, code: string): Promise<Record<string, unknown>>;
	getSvnFileHistory(filePath: string, limit: number): Promise<Record<string, unknown>>;
	getPackageSyncChanges(query: string | undefined, offset: number, limit: number): Promise<Record<string, unknown>>;
	updateDatabase(role: 'main' | 'test'): Promise<void>;
	startClient(role: 'main' | 'test'): Promise<void>;
}

export function registerNavigationTools(context: vscode.ExtensionContext, actions: NavigationActions): void {
	context.subscriptions.push(
		vscode.lm.registerTool('vcVeTools_reveal_class', createClassTool(
			'Показываю класс в проводнике Восточного Экспресса…',
			actions.revealClass,
			classId => `Класс ID=${classId} показан в проводнике Восточного Экспресса.`,
		)),
		vscode.lm.registerTool('vcVeTools_open_class', createClassTool(
			'Открываю карточку класса Восточного Экспресса…',
			async classId => {
				await actions.revealClass(classId);
				await actions.openClass(classId);
			},
			classId => `Класс ID=${classId} показан в проводнике и открыт в окне Восточного Экспресса.`,
		)),
		vscode.lm.registerTool('vcVeTools_open_method', {
			prepareInvocation: () => ({ invocationMessage: 'Открываю метод Восточного Экспресса в редакторе…' }),
			invoke: async (options: vscode.LanguageModelToolInvocationOptions<MethodInput>) => {
				const methodId = requirePositiveId(options.input.methodId, 'methodId');
				await actions.openMethod(methodId);
				return textResult(`Метод ID=${methodId} открыт в редакторе.`);
			},
		}),
		vscode.lm.registerTool('vcVeTools_reveal_method', {
			prepareInvocation: () => ({ invocationMessage: 'Открываю вкладку методов класса и выделяю метод…' }),
			invoke: async (options: vscode.LanguageModelToolInvocationOptions<MethodInClassInput>) => {
				const methodId = requirePositiveId(options.input.methodId, 'methodId');
				const classId = requirePositiveId(options.input.classId, 'classId');
				await actions.revealMethod(classId, methodId);
				return textResult(`Метод ID=${methodId} выделен на вкладке методов класса ID=${classId}.`);
			},
		}),
	);
}

function createClassTool(
	invocationMessage: string,
	action: (classId: number) => Promise<void>,
	result: (classId: number) => string,
): vscode.LanguageModelTool<ClassInput> {
	return {
		prepareInvocation: () => ({ invocationMessage }),
		invoke: async (options) => {
			const classId = requirePositiveId(options.input.classId, 'classId');
			await action(classId);
			return textResult(result(classId));
		},
	};
}

function requirePositiveId(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} должен быть положительным целым числом.`);
	}
	return value;
}

function textResult(text: string): vscode.LanguageModelToolResult {
	return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
