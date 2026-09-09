export interface ProductionDeadlineInfo {
	label: string;
	tone: 'none' | 'normal' | 'today' | 'overdue';
	days: number;
}

export function parseProductionDate(value: string): Date | undefined {
	const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
	if (!match) { return undefined; }
	const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0));
	return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : undefined;
}

export function productionDeadlineInfo(value: string, now = new Date()): ProductionDeadlineInfo {
	const deadline = parseProductionDate(value);
	if (!deadline) { return { label: value || 'Без срока', tone: 'none', days: 0 }; }
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
	const days = Math.round((deadlineDay.getTime() - today.getTime()) / 86_400_000);
	if (days < 0 || deadline.getTime() < now.getTime() && days === 0) {
		const overdueDays = Math.max(1, Math.ceil((now.getTime() - deadline.getTime()) / 86_400_000));
		return { label: `Просрочено на ${overdueDays} ${pluralDays(overdueDays)}`, tone: 'overdue', days: -overdueDays };
	}
	if (days === 0) { return { label: 'Сегодня', tone: 'today', days: 0 }; }
	return { label: `Осталось ${days} ${pluralDays(days)}`, tone: 'normal', days };
}

export function productionTaskPublicUrl(reference: string | number): string {
	return `https://r.oe-it.ru/${String(reference).trim()}`;
}

export function productionTaskMarkdown(number: string, title: string, fallbackId: number): string {
	const reference = number.trim() || String(fallbackId);
	const label = title.trim() ? `${reference} - ${title.trim()}` : reference;
	const url = productionTaskPublicUrl(reference);
	return `${label}\n[${url}](${url})`;
}

function pluralDays(value: number): string {
	const mod100 = value % 100;
	const mod10 = value % 10;
	if (mod10 === 1 && mod100 !== 11) { return 'день'; }
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) { return 'дня'; }
	return 'дней';
}
