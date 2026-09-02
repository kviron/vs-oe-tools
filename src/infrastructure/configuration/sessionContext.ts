import { hostname } from 'node:os';
import * as vscode from 'vscode';
import type { Client } from 'pg';
import { executeMonitoredQuery } from '../database/databaseQueryExecutor';

/**
 * Контекст текущей сессии для логирования изменений в LogCChangedObject
 */
export interface SessionContext {
	/**
	 * ID пользователя в системе Восточный Экспресс
	 */
	userId: number;

	/**
	 * Имя компьютера для логирования
	 */
	computerName: string;

	/**
	 * Текущее время на сервере БД
	 */
	changeDate: Date;
}

/**
 * Получает контекст текущей сессии из настроек расширения и сервера БД
 * @param client PostgreSQL клиент
 * @param databaseName Название БД для логирования
 * @returns Контекст сессии с UserID, ComputerName и текущей датой
 */
export async function getSessionContext(client: Client, databaseName: string): Promise<SessionContext> {
	// Получаем текущее время от сервера БД
	const timeResult = await executeMonitoredQuery<{ now: Date }>(client, {
		text: 'SELECT NOW() AS now',
		values: [],
		source: 'Получение времени сервера БД',
		database: databaseName,
	});

	const changeDate = timeResult.rows[0]?.now ?? new Date();

	// Получаем имя компьютера из ОС
	const computerName = hostname();

	// Получаем UserID из настроек расширения
	const userId = await getUserId();

	return {
		userId,
		computerName,
		changeDate,
	};
}

async function getUserId(): Promise<number> {
	const configuration = vscode.workspace.getConfiguration('vcVeTools');
	const configured = configuration.get<number>('userId', 0);
	if (Number.isSafeInteger(configured) && configured > 0) {
		return configured;
	}

	// Поддерживаем старый способ настройки, но переменная окружения больше не обязательна.
	const legacy = Number.parseInt(process.env.VC_VE_USER_ID ?? '', 10);
	if (Number.isSafeInteger(legacy) && legacy > 0) {
		await configuration.update('userId', legacy, vscode.ConfigurationTarget.Workspace);
		return legacy;
	}

	const input = await vscode.window.showInputBox({
		title: 'Сохранение метода',
		prompt: 'Введите ID пользователя из таблицы Users. Он сохранится в настройках проекта.',
		placeHolder: 'ID пользователя',
		ignoreFocusOut: true,
		validateInput: validateUserId,
	});
	if (input === undefined) {
		throw new Error('Сохранение отменено: не указан ID пользователя для журнала изменений.');
	}
	const userId = Number.parseInt(input, 10);
	await configuration.update('userId', userId, vscode.ConfigurationTarget.Workspace);
	return userId;
}

function validateUserId(value: string): string | undefined {
	return /^[1-9]\d*$/.test(value.trim()) && Number.isSafeInteger(Number(value))
		? undefined
		: 'Введите положительный целочисленный ID пользователя.';
}
