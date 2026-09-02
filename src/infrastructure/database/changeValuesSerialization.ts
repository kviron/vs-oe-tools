/**
 * Модуль для работы с сериализацией значений изменённых атрибутов
 * в логе LogCChangedObject
 */

/**
 * Сериализует значения атрибутов для LogCChangedObject
 *
 * Формат: 127,"<текст кода>",102,<SeniorID>
 * где:
 * - 127 = Methods.Code (атрибут)
 * - "<текст кода>" = значение кода
 * - 102 = Methods.SeniorID (атрибут)
 * - <SeniorID> = значение SeniorID
 *
 * @param code Текст кода метода
 * @param seniorId ID родительского класса (SeniorID)
 * @returns Сериализованная строка для NewValues или OldValues
 */
export function serializeChangeValues(code: string, seniorId: number): string {
	// Экранируем кавычки в коде
	const escapedCode = code.replace(/"/g, '""');

	// Формируем строку: 127,"<код>",102,<SeniorID>
	return `127,"${escapedCode}",102,${seniorId}`;
}

/**
 * Десериализует значения атрибутов из LogCChangedObject (для проверки)
 *
 * @param serialized Сериализованная строка
 * @returns Объект с распарсенными значениями code и seniorId
 * @throws Error если формат некорректен
 */
export function deserializeChangeValues(serialized: string): { code: string; seniorId: number } {
	// Ищем позицию первой кавычки после 127,
	const codeStartIndex = serialized.indexOf('"');
	if (codeStartIndex === -1) {
		throw new Error('Некорректный формат serialized значения: не найдена открывающая кавычка');
	}

	// Ищем закрывающую кавычку (может быть экранирована)
	let codeEndIndex = -1;
	for (let i = codeStartIndex + 1; i < serialized.length; i++) {
		if (serialized[i] === '"') {
			// Проверяем, экранирована ли она (двойная кавычка)
			if (i + 1 < serialized.length && serialized[i + 1] === '"') {
				i++; // Пропускаем вторую кавычку
			} else {
				codeEndIndex = i;
				break;
			}
		}
	}

	if (codeEndIndex === -1) {
		throw new Error('Некорректный формат serialized значения: не найдена закрывающая кавычка');
	}

	// Извлекаем код и дискапируем двойные кавычки
	const code = serialized.substring(codeStartIndex + 1, codeEndIndex).replace(/""/g, '"');

	// Ищем SeniorID после последней запятой
	const lastCommaIndex = serialized.lastIndexOf(',');
	if (lastCommaIndex === -1) {
		throw new Error('Некорректный формат serialized значения: не найдена запятая перед SeniorID');
	}

	const seniorIdStr = serialized.substring(lastCommaIndex + 1).trim();
	const seniorId = Number.parseInt(seniorIdStr, 10);

	if (!Number.isInteger(seniorId)) {
		throw new Error(`Некорректный SeniorID в serialized значении: ${seniorIdStr}`);
	}

	return { code, seniorId };
}
