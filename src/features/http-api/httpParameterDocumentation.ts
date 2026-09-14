export interface HttpParameterDocumentation {
	name: string;
	referenceType: string;
	description: string;
}

export interface HttpMethodDocumentation {
	description: string;
	parameters: ReadonlyMap<string, HttpParameterDocumentation>;
}

export function parseHttpMethodDocumentation(source: string): HttpMethodDocumentation {
	const parameters = new Map<string, HttpParameterDocumentation>();
	const descriptionLines: string[] = [];

	for (const line of source.split(/\r?\n/u)) {
		const match = line.match(/^\s*@param\s+\{([^{}]+)\}\s+(\S+)(?:\s+(.+?))?\s*$/iu);
		if (!match) {
			descriptionLines.push(line);
			continue;
		}
		const name = match[2].trim();
		parameters.set(name.toLocaleLowerCase('ru'), {
			name,
			referenceType: match[1].trim(),
			description: match[3]?.trim() ?? '',
		});
	}

	return {
		description: descriptionLines.join('\n').trim(),
		parameters,
	};
}
