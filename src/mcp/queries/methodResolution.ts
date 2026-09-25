export interface MethodResolutionCandidate {
	methodId: string;
	methodName: string;
	classId: string;
	className: string;
	signature: string;
}

export interface RankedMethodCandidate extends MethodResolutionCandidate {
	score: number;
	reasons: string[];
}

export interface MethodResolution {
	resolved: boolean;
	ambiguous: boolean;
	confidence: 'high' | 'medium' | 'low' | 'none';
	selected: RankedMethodCandidate | null;
	candidates: RankedMethodCandidate[];
}

export function resolveMethodCandidates(
	candidates: MethodResolutionCandidate[],
	currentClassDepths: ReadonlyMap<string, number>,
	qualifierClassDepths: ReadonlyMap<string, number>,
	hasQualifier: boolean,
	argumentCount?: number,
): MethodResolution {
	const ranked = candidates.map(candidate => rankCandidate(candidate, currentClassDepths, qualifierClassDepths, hasQualifier, argumentCount))
		.sort((left, right) => left.score - right.score || left.className.localeCompare(right.className, 'ru') || Number(left.methodId) - Number(right.methodId));
	if (ranked.length === 0) {
		return { resolved: false, ambiguous: false, confidence: 'none', selected: null, candidates: [] };
	}
	const best = ranked[0];
	const equallyBest = ranked.filter(candidate => candidate.score === best.score);
	const ambiguous = equallyBest.length > 1;
	return {
		resolved: !ambiguous,
		ambiguous,
		confidence: ambiguous ? 'low' : best.score < 20 ? 'high' : 'medium',
		selected: ambiguous ? null : best,
		candidates: ranked,
	};
}

export function signatureArgumentCount(signature: string): number | undefined {
	const open = signature.indexOf('(');
	if (open < 0) {
		return undefined;
	}
	let depth = 0;
	let count = 0;
	let hasContent = false;
	let quote = '';
	for (let index = open + 1; index < signature.length; index += 1) {
		const character = signature[index];
		if (quote) {
			if (character === quote && signature[index + 1] === quote) {
				index += 1;
			} else if (character === quote) {
				quote = '';
			}
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			hasContent = true;
			continue;
		}
		if (character === '(' || character === '[' || character === '<') {
			depth += 1;
			hasContent = true;
			continue;
		}
		if (character === ')' && depth === 0) {
			return hasContent ? count + 1 : 0;
		}
		if (character === ')' || character === ']' || character === '>') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if ((character === ',' || character === ';') && depth === 0) {
			count += 1;
		} else if (!/\s/.test(character)) {
			hasContent = true;
		}
	}
	return undefined;
}

function rankCandidate(
	candidate: MethodResolutionCandidate,
	currentClassDepths: ReadonlyMap<string, number>,
	qualifierClassDepths: ReadonlyMap<string, number>,
	hasQualifier: boolean,
	argumentCount?: number,
): RankedMethodCandidate {
	const reasons: string[] = [];
	const qualifierDepth = qualifierClassDepths.get(candidate.classId);
	const currentDepth = currentClassDepths.get(candidate.classId);
	let score: number;
	if (hasQualifier && qualifierDepth !== undefined) {
		score = qualifierDepth;
		reasons.push(qualifierDepth === 0 ? 'Метод принадлежит классу квалификатора.' : `Метод унаследован классом квалификатора, глубина ${qualifierDepth}.`);
	} else if (currentDepth !== undefined) {
		score = (hasQualifier ? 50 : 0) + currentDepth;
		reasons.push(currentDepth === 0 ? 'Метод принадлежит классу вызывающего метода.' : `Метод найден в предке вызывающего класса, глубина ${currentDepth}.`);
	} else {
		score = 100;
		reasons.push('Глобальный кандидат вне известной цепочки наследования.');
	}
	if (argumentCount !== undefined) {
		const actualCount = signatureArgumentCount(candidate.signature);
		if (actualCount === argumentCount) {
			reasons.push(`Совпало количество аргументов: ${argumentCount}.`);
		} else if (actualCount !== undefined) {
			score += 20;
			reasons.push(`Количество аргументов не совпало: ожидалось ${argumentCount}, в сигнатуре ${actualCount}.`);
		}
	}
	return { ...candidate, score, reasons };
}
