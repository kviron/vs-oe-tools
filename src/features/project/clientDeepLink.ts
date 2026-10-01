/** Build the native client's class-independent route for one object. */
export function createClientObjectUri(database: string, id: number): string {
	if (!Number.isSafeInteger(id) || id <= 0) { throw new Error('ID объекта должен быть положительным целым числом.'); }
	const normalizedDatabase = database.trim().toLowerCase();
	if (!/^[a-z0-9_-]+$/u.test(normalizedDatabase)) { throw new Error('Имя базы не подходит для схемы ссылки клиента ВЭ.'); }
	return `oe-${normalizedDatabase}:/edit/${id}`;
}

export function isClientObjectUri(uri: string, database: string): boolean {
	const match = /^oe-([a-z0-9_-]+):\/edit\/([1-9]\d*)$/iu.exec(uri);
	return Boolean(match && match[1].toLowerCase() === database.trim().toLowerCase()
		&& Number.isSafeInteger(Number(match[2])));
}
