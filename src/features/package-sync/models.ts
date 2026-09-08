export interface PackageSyncItem {
	objectId: number;
	objectClassId: number;
	objectSeniorId: number | null;
	objectName: string;
	contentMd5: string;
	contentRevision: number | null;
	changeState: string;
	changedAt: string;
	changedBy: string;
	objectPath: string;
	packagePath: string;
	localPath?: string;
}

export interface PackageBoundaryIssue {
	objectId: number;
	objectName: string;
	classId: number;
	className: string;
	attributeId: number;
	attributeName: string;
	referenceId: number;
	referenceName: string;
	sourcePackage: string;
	targetPackage: string;
	sourceFile: string;
	recommendedFile: string;
	changedBy: string;
	message: string;
	type: 'package-boundary';
}

export interface PackagePlaceholderIssue {
	objectId: number;
	objectName: string;
	classId: number;
	className: string;
	packagePath: string;
	objectPath: string;
	changedBy: string;
	message: string;
	type: 'package-placeholder';
}

export type PackageSyncIssue = PackageBoundaryIssue | PackagePlaceholderIssue;

export interface PackageSyncSnapshot {
	items: PackageSyncItem[];
	issues: PackageSyncIssue[];
}
