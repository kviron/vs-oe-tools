export interface MethodCompilationDiagnostic {
	line: number;
	message: string;
	severity: 'error' | 'warning';
}

const diagnosticPattern = /^\s*(ОШИБКА\s+)?стр\.\s*(\d+)\s*:\s*(.+?)\s*$/iu;

export function parseMethodCompilationOutput(output: string): MethodCompilationDiagnostic[] {
	const diagnostics: MethodCompilationDiagnostic[] = [];
	for (const line of output.split(/\r?\n/u)) {
		const match = line.match(diagnosticPattern);
		if (!match) { continue; }
		diagnostics.push({
			line: Math.max(1, Number(match[2])),
			message: match[3],
			severity: match[1] ? 'error' : 'warning',
		});
	}
	return diagnostics;
}

export function hasMethodCompilationResult(output: string): boolean {
	return /(?:^|\r?\n)VCVE_COMPILE_OK(?:\r?\n|$)/u.test(output)
		|| parseMethodCompilationOutput(output).length > 0;
}
