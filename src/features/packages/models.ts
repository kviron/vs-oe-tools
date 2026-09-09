import type { DatabaseObjectKind } from '../../core/objectSearch';

export interface PackageSummary {
	id: number;
	name: string;
}

export type PackageExplorerNodeKind = 'package' | 'files' | 'group' | 'file' | 'object';

export interface PackageExplorerNode {
	key: string;
	id?: number;
	name: string;
	kind: PackageExplorerNodeKind;
	fileId?: number;
	objectId?: number;
	objectKind?: DatabaseObjectKind;
	className?: string;
	hasChildren: boolean;
	children: PackageExplorerNode[];
}

export interface PackageContentNode {
	id: number;
	name: string;
	classId: number;
	className: string;
	parentId?: number;
	kind: DatabaseObjectKind;
	children: PackageContentNode[];
}

export interface PackageFileContent {
	fileId: number;
	fileName: string;
	packageName: string;
	groupPath: string;
	objects: PackageContentNode[];
}
