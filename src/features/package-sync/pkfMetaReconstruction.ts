export type MetaVisibility = 'private' | 'protected' | 'public' | 'published';

export interface PkfMetaClass {
	id: number;
	name: string;
	aliases: string;
	parentName: string;
	isVirtual: boolean;
	cacheObjectClass: number | null;
	referenceIntegrityCheck: number | null;
}

export interface PkfMetaAttribute {
	kind: 'attribute';
	id: number;
	name: string;
	aliases: string;
	visibility: MetaVisibility;
	valueClassName: string;
	databaseFieldName: string;
	readRole: number | null;
	writeRole: number | null;
	referenceIntegrityCheck: number | null;
}

export interface PkfMetaDefaultValue {
	kind: 'default';
	id: number;
	name: string;
	visibility: MetaVisibility;
	value: string;
	block: boolean;
}

export interface PkfMetaMethod {
	kind: 'method';
	id: number;
	name: string;
	aliases: string;
	visibility: MetaVisibility;
	methodKind: number;
	signature: string;
	code: string;
}

export type PkfMetaMember = PkfMetaAttribute | PkfMetaDefaultValue | PkfMetaMethod;

const visibilityOrder: MetaVisibility[] = ['private', 'protected', 'public', 'published'];

export const metaPkfOwnerQuery = `SELECT DISTINCT OwnerID AS id FROM (
	 SELECT C.ID AS OwnerID FROM Abstract A JOIN Classes C ON C.ID = A.ID WHERE A.SysFile = $1
	 UNION ALL SELECT Attr.SeniorID AS OwnerID FROM Abstract A JOIN Attributes Attr ON Attr.ID = A.ID WHERE A.SysFile = $1
	 UNION ALL SELECT M.SeniorID AS OwnerID FROM Abstract A JOIN Methods M ON M.ID = A.ID WHERE A.SysFile = $1
	 UNION ALL SELECT D.SeniorID AS OwnerID FROM Abstract A JOIN DfltValues D ON D.ID = A.ID WHERE A.SysFile = $1
) Owners WHERE OwnerID IS NOT NULL ORDER BY OwnerID`;

export function requireSingleMetaOwner(ownerIds: readonly number[], fileId: number): number {
	const unique = [...new Set(ownerIds.filter(Number.isSafeInteger))];
	if (unique.length === 1) {return unique[0]!;}
	if (!unique.length) {throw new Error(`Не удалось определить класс-владелец meta-PKF SysFile ${fileId}.`);}
	throw new Error(`Meta-PKF SysFile ${fileId} содержит члены разных классов: ${unique.join(', ')}.`);
}

export function serializePkfMetaFile(metaClass: PkfMetaClass, members: readonly PkfMetaMember[], newline = '\r\n'): string {
	const modifiers = metaClass.isVirtual ? 'virtual ' : '';
	const classMetadata = [
		`_Ид='${metaClass.id}'`,
		...(metaClass.cacheObjectClass === null ? [] : [`КэшОбъектКласс='${metaClass.cacheObjectClass}'`]),
		...(metaClass.referenceIntegrityCheck === null ? [] : [`ПровСсылЦел='${metaClass.referenceIntegrityCheck}'`]),
	].join(',');
	const lines = [
		'file',
		'meta',
		`  ${withAlias(metaClass.name, metaClass.aliases)} = ${modifiers}class(${metaClass.parentName}) [${classMetadata}]`,
	];
	for (const visibility of visibilityOrder) {
		const sectionMembers = members.filter(member => member.visibility === visibility).sort((left, right) => left.id - right.id);
		if (!sectionMembers.length) {continue;}
		lines.push(`  ${visibility}`);
		let previousKind: PkfMetaMember['kind'] | undefined;
		for (const member of sectionMembers) {
			if (member.kind === 'method' && previousKind && previousKind !== 'method') {lines.push('');}
			if (member.kind === 'method' && previousKind === 'method') {lines.push('');}
			lines.push(...serializeMember(member, newline));
			previousKind = member.kind;
		}
	}
	lines.push('  end;', 'end.', '');
	return lines.join(newline);
}

/** Replaces only the meta section of a mixed Meta/Data PKF. */
export function replacePkfMetaSection(source: string, serializedMetaFile: string): string {
	const sourceMeta = findSectionMarker(source, 'meta');
	const sourceData = findSectionMarker(source, 'data', sourceMeta.end);
	const generatedMeta = findSectionMarker(serializedMetaFile, 'meta');
	const generatedEnd = findSectionMarker(serializedMetaFile, 'end.', generatedMeta.end);
	if (findSectionMarkerOptional(serializedMetaFile, 'data', generatedMeta.end)) {
		throw new Error('Сериализованная meta-секция неожиданно содержит секцию data.');
	}
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const generatedSection = serializedMetaFile
		.slice(generatedMeta.start, generatedEnd.start)
		.replace(/\r\n|\r|\n/g, newline);
	return `${source.slice(0, sourceMeta.start)}${generatedSection}${source.slice(sourceData.start)}`;
}

/** Adds members to one existing class without rebuilding other classes in the same meta section. */
export function appendPkfMetaMembers(source: string, ownerId: number, members: readonly PkfMetaMember[]): string {
	if (!members.length) {return source;}
	const ownerPattern = new RegExp(`^  .*\\bclass\\([^\\r\\n]*\\)[^\\r\\n]*\\[_Ид\\s*=\\s*'${ownerId}'(?:,|\\])`, 'gmu');
	const owners = [...source.matchAll(ownerPattern)];
	if (owners.length !== 1 || owners[0]?.index === undefined) {
		throw new Error(`В смешанном Meta/Data-PKF ожидался один блок класса-владельца ${ownerId}, найдено: ${owners.length}.`);
	}
	const classEnd = findMetaClassEnd(source, owners[0].index + owners[0][0].length);
	const existingIds = extractMetaIds(source);
	const duplicates = members.filter(member => existingIds.has(member.id));
	if (duplicates.length) {throw new Error(`Meta-объекты уже присутствуют в PKF: ${duplicates.map(member => member.id).join(', ')}.`);}
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	const lines: string[] = [];
	for (const visibility of visibilityOrder) {
		const sectionMembers = members.filter(member => member.visibility === visibility).sort((left, right) => left.id - right.id);
		if (!sectionMembers.length) {continue;}
		lines.push(`  ${visibility}`);
		for (const member of sectionMembers) {
			if (lines.length > 1) {lines.push('');}
			lines.push(...serializeMember(member, newline));
		}
	}
	const insertion = `${lines.join(newline)}${newline}`;
	return `${source.slice(0, classEnd)}${insertion}${source.slice(classEnd)}`;
}

function findMetaClassEnd(source: string, from: number): number {
	let blockDepth = 0;
	for (const match of source.slice(from).matchAll(/\{\{|\}\}|^  end;[ \t]*$/gmu)) {
		if (match[0] === '{{') {blockDepth++; continue;}
		if (match[0] === '}}') {blockDepth = Math.max(0, blockDepth - 1); continue;}
		if (blockDepth === 0 && match.index !== undefined) {return from + match.index;}
	}
	throw new Error('Не найдена граница класса в смешанном Meta/Data-PKF.');
}

function extractMetaIds(source: string): Set<number> {
	return new Set([...source.matchAll(/(?:^|[.\[\s])_Ид\s*=\s*'(\d+)'/gmu)].map(match => Number(match[1])));
}

interface SectionMarker { start: number; end: number }

function findSectionMarker(source: string, marker: string, from = 0): SectionMarker {
	const found = findSectionMarkerOptional(source, marker, from);
	if (!found) {throw new Error(`В PKF не найдена секция ${marker}.`);}
	return found;
}

function findSectionMarkerOptional(source: string, marker: string, from = 0): SectionMarker | undefined {
	const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^${escapedMarker}[ \\t]*$`, 'gmu');
	pattern.lastIndex = from;
	const match = pattern.exec(source);
	return match?.index === undefined ? undefined : { start: match.index, end: pattern.lastIndex };
}

function serializeMember(member: PkfMetaMember, newline: string): string[] {
	if (member.kind === 'attribute') {
		const metadata = [
			`_Ид='${member.id}'`,
			...(member.databaseFieldName ? [`ИмяПоляБД='${escapePkfString(member.databaseFieldName)}'`] : []),
			...(member.readRole === null ? [] : [`РольДляЧтения='${member.readRole}'`]),
			...(member.writeRole === null ? [] : [`РольДляЗаписи='${member.writeRole}'`]),
			...(member.referenceIntegrityCheck === null ? [] : [`ПровСсылЦел='${member.referenceIntegrityCheck}'`]),
		].join(',');
		return [`    var ${withAlias(member.name, member.aliases)}: embedded ${member.valueClassName} notstored [${metadata}];`];
	}
	if (member.kind === 'default') {
		const suffix = ` [ЗначАтрПоУмолчанию._Ид='${member.id}'];`;
		if (!member.block) {return [`    class var ${member.name} = '${escapePkfString(member.value)}'${suffix}`];}
		return [`    class var ${member.name} = {{${newline}${indentBlock(member.value, newline)}}}${suffix}`];
	}
	const keyword = member.methodKind === 5 ? 'constructor' : methodKeyword(member.code);
	const header = `    ${keyword} ${withAlias(member.name, member.aliases)} '${escapePkfString(member.signature)}' [_Ид='${member.id}']`;
	return [header, `    {{${newline}${indentBlock(member.code, newline)}}};`];
}

function indentBlock(value: string, newline: string): string {
	return value.replace(/\r\n|\r|\n/g, newline).split(newline).map(line => `    ${line}`).join(newline);
}

function methodKeyword(code: string): string {
	const keyword = code.trimStart().match(/^(constructor|destructor|function|procedure|proc)\b/iu)?.[1]?.toLocaleLowerCase('en-US');
	return keyword === 'constructor' || keyword === 'destructor' || keyword === 'function' ? keyword : 'procedure';
}

function withAlias(name: string, aliases: string): string {return aliases ? `${name}/${aliases}` : name;}
function escapePkfString(value: string): string {return value.replace(/'/g, "''");}
