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
