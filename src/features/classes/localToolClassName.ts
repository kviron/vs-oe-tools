import * as iconv from 'iconv-lite';

export function validateLocalToolClassName(name: string): string {
	const normalized = name.trim();
	if (normalized.length > 100 || !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(normalized)) {
		throw new Error('Имя класса должно быть идентификатором длиной до 100 символов.');
	}
	if (iconv.decode(iconv.encode(normalized, 'win1251'), 'win1251') !== normalized) {
		throw new Error('Имя класса содержит символы вне Windows-1251.');
	}
	return normalized;
}
