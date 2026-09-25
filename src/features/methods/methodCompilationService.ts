import { compileOeMethod, type OeMethodCredentials } from '../lifecycle/oeStaticMethodExecutor';
import { hasMethodCompilationResult, parseMethodCompilationOutput } from './methodCompilation';
import { MethodCompilationHistory, type MethodCompilationRecord } from './methodCompilationHistory';

export class MethodCompilationService {
	constructor(
		private readonly workspacePath: string | undefined,
		private readonly getCredentials: () => Promise<OeMethodCredentials>,
		readonly history: MethodCompilationHistory,
	) {}

	async check(methodId: number, database: string, host: string, source: 'editor' | 'agent'): Promise<MethodCompilationRecord> {
		const record: MethodCompilationRecord = {
			timestamp: new Date().toISOString(), methodId, database, host, source,
			status: 'failed', passed: false, errorCount: 0, warningCount: 0, diagnostics: [],
		};
		try {
			if (!this.workspacePath) { throw new Error('Откройте папку проекта Восточного Экспресса.'); }
			const output = await compileOeMethod(this.workspacePath, methodId, database, host, await this.getCredentials());
			if (!hasMethodCompilationResult(output)) {
				throw new Error('OEExecTask не вернул результат компиляции из метода СообщенияКомпиляцииДляРедактора (ID 3200240). Проверьте его код и доступность в выбранной базе.');
			}
			record.diagnostics = parseMethodCompilationOutput(output);
			record.errorCount = record.diagnostics.filter(item => item.severity === 'error').length;
			record.warningCount = record.diagnostics.length - record.errorCount;
			record.passed = record.errorCount === 0;
			record.status = record.diagnostics.length ? 'diagnostics' : 'ok';
		} catch (error) {
			record.error = error instanceof Error ? error.message : String(error);
		}
		await this.history.append(record);
		return record;
	}
}
