export interface PreviousEncoding {
	languageId: string;
	hadValue: boolean;
	value?: string;
}

export type DatabaseRole = 'main' | 'test';

export interface DatabaseConnectionOptions {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
}

export interface ClassRow {
	id: number;
	name: string;
	seniorid: number | null;
	ord: number | null;
	hasDfm?: boolean;
}

export interface ClassCommentRow {
	id: number;
	name: string | null;
	seniorid: number;
	ord: number | null;
}

export interface ObjectMetaDataCountRow {
	seniorid: number;
	count: string;
}

export interface ClassTreeRow extends ClassRow {
	comments: ClassCommentRow[];
	objectMetaDataCount: number;
}

export interface ClassDetails extends ClassRow {
	aliases: string | null;
	title: string | null;
	dbtablename: string | null;
	dispexpression: string | null;
	adddispexpression: string | null;
	childclassid: number | null;
	parentclassid: number | null;
	cacheobjclass: number | null;
	refintegritycheck: number | null;
	defaultdbalias: string | null;
	isabstract: number | null;
	virtual: number | null;
	isinheritable: number | null;
	cached: number | null;
	onedbtable: number | null;
	tableshared: number | null;
	ordered: number | null;
	isview: number | null;
	unreferenced: number | null;
	childclassname: string | null;
	parentclassname: string | null;
}

export interface ClassAttribute {
	id: string;
	name: string;
	owner: string;
	signature: string;
	type: string;
	visibility: string;
	package: string;
	line: string;
	updatedAt: string;
	createdBy: string;
	inherited: boolean;
}

export interface ClassMethod {
	id: string;
	name: string;
	owner: string;
	signature: string;
	type: string;
	visibility: string;
	package: string;
	line: string;
	updatedAt: string;
	createdBy: string;
	inherited: boolean;
}
