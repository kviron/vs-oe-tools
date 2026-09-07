export interface SpuPackageOption {
	id: number;
	name: string;
	groupId: number;
	version: number;
}

export interface SpuTypeOption {
	id: number;
	name: string;
}

export interface SpuEditorOptions {
	packages: SpuPackageOption[];
	types: SpuTypeOption[];
	preferredPackageId?: number;
	executionOrder: string;
	existing?: SpuEditorRecord;
}

export interface SpuDraft {
	name: string;
	packageId: number;
	typeId: number;
	executionOrder: string;
	versionControl: boolean;
	beginVersion: number;
	isAfterUpdate: boolean;
	executeAlways: boolean;
	sqlScript: string;
	comment: string;
}

export interface CreatedSpu {
	id: number;
	fileId: number;
	name: string;
	packageId: number;
}

export interface SpuEditorRecord extends CreatedSpu {
	draft: SpuDraft;
}
