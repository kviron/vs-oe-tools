import * as assert from 'node:assert/strict';
import { parseProductionDate, productionDeadlineInfo } from '../features/production-tasks/productionTaskPresentation';

suite('Production task presentation', () => {
	test('parses East Express dates strictly', () => {
		assert.equal(parseProductionDate('09.10.2025 09:56:20')?.getFullYear(), 2025);
		assert.equal(parseProductionDate('31.02.2025'), undefined);
		assert.equal(parseProductionDate(''), undefined);
	});

	test('describes overdue, today, and future deadlines', () => {
		const now = new Date(2026, 8, 8, 12);
		assert.deepEqual(productionDeadlineInfo('07.09.2026 12:00:00', now), { label: 'Просрочено на 1 день', tone: 'overdue', days: -1 });
		assert.deepEqual(productionDeadlineInfo('08.09.2026 18:00:00', now), { label: 'Сегодня', tone: 'today', days: 0 });
		assert.deepEqual(productionDeadlineInfo('10.09.2026 12:00:00', now), { label: 'Осталось 2 дня', tone: 'normal', days: 2 });
	});
});
