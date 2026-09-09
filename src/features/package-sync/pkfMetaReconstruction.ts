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
