/** Marks static SQL for editor highlighting without changing the pg query contract. */
export function sql(strings: TemplateStringsArray, ...values: never[]): string {
	if (values.length) {
		throw new Error('SQL values must be passed as query parameters.');
	}
	return strings[0];
}
