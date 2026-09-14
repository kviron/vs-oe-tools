export interface PreviousEncoding {
	languageId: string;
	hadValue: boolean;
	value?: string;
}

export type { DatabaseConnectionOptions, DatabaseRole } from '../../core/database';

export interface ClassRow {
	id: number;
	name: string;
	seniorid: number | null;
	ord: number | null;
	hasDfm?: boolean;
	virtual?: number | null;
	dbtablename?: string | null;
}

export interface ClassObjectColumn {
	attributeId: string;
	key: string;
	title: string;
	attributeName: string;
	reference: boolean;
}

export interface ClassObjectsResult {
	classId: number;
	className: string;
	columns: ClassObjectColumn[];
	rows: Array<Record<string, unknown>>;
	totalCount: number;
	offset: number;
	limit: number;
	hasMore: boolean;
}

export interface ClassObjectColumnSettings {
	visible: string[];
	order: string[];
	compact: boolean;
}

export type ObjectFieldKind = 'attribute' | 'property';

export interface ObjectFieldRow {
	kind: ObjectFieldKind;
	attributeId: string | null;
	attributeName: string;
	value: unknown;
	tableField: string;
	distribution: string;
}

export interface ObjectViewResult {
	id: string;
	name: string;
	classId: string;
	className: string;
	fields: ObjectFieldRow[];
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
	attributeCount: number;
	inheritedAttributeCount: number;
	methodCount: number;
	inheritedMethodCount: number;
	propertyCount: number;
	inheritedPropertyCount: number;
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

export interface AttributeDetails {
	id: string;
	name: string;
	ownerClassId: string;
	ownerClassName: string;
	attributeTypeName: string;
	createdBy: string;
	data: Record<string, unknown>;
}

export interface ClassAttributeDraft {
	ownerClassId: number;
	name: string;
	aliases: string;
	dbFieldName: string;
	attributeTypeId: number;
	valueClasses: string;
	visibilityId: number;
	distributionModeId: number;
	isNotNull: boolean;
	virtual: boolean;
	refIntegrityCheck: boolean;
}

export interface AttributeEditorOption {
	id: number;
	name: string;
}

export interface AttributeEditorOptions {
	ownerClassId: number;
	ownerClassName: string;
	types: AttributeEditorOption[];
	visibilities: AttributeEditorOption[];
	distributionModes: AttributeEditorOption[];
	defaults: Pick<ClassAttributeDraft, 'visibilityId' | 'distributionModeId' | 'isNotNull' | 'virtual' | 'refIntegrityCheck'>;
}

export interface CreatedClassAttribute {
	id: number;
	ownerClassId: number;
	name: string;
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

export interface ClassMethodDraft {
	ownerClassId: number;
	name: string;
	visibilityId: number;
	methodType: 3;
	methodKind: 0 | 6;
	signature: string;
	code: string;
}

export interface CreatedClassMethod {
	id: number;
	ownerClassId: number;
	name: string;
}

export interface ClassProperty {
	id: string;
	name: string;
	aliases: string;
	owner: string;
	type: string;
	readOnly: boolean;
	visibility: string;
	package: string;
	inherited: boolean;
}

export interface PropertyDetails {
	id: string;
	name: string;
	aliases: string;
	visibility: string;
	readMemberId: string;
	readMemberName: string;
	writeMemberId: string;
	writeMemberName: string;
	ownerClassId: string;
	ownerClassName: string;
}
