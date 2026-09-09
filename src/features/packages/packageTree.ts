import type { PackageExplorerNode } from './models';

export interface PackageGroupRow { id: string; groupname: string; path: string | null }
export interface PackageFileRow { id: string; filename: string; sysgroup: string; objectcount: string }

export function buildPackageTree(packageId: number, packageName: string, groups: PackageGroupRow[], files: PackageFileRow[]): PackageExplorerNode {
	const groupNodes = new Map<number, PackageExplorerNode>();
	const groupPaths = new Map<string, number>();
	for (const group of groups) {
		const id = Number(group.id);
		const path = normalizePath(group.path ?? group.groupname);
		groupPaths.set(path.toLocaleLowerCase('ru'), id);
		groupNodes.set(id, { key: `group:${id}`, id, name: group.groupname, kind: 'group', hasChildren: false, children: [] });
	}
	const roots: PackageExplorerNode[] = [];
	for (const group of groups) {
		const node = groupNodes.get(Number(group.id))!;
		const path = normalizePath(group.path ?? group.groupname);
		const parentPath = path.includes('\\') ? path.slice(0, path.lastIndexOf('\\')).toLocaleLowerCase('ru') : '';
		const parent = parentPath ? groupNodes.get(groupPaths.get(parentPath) ?? Number.NaN) : undefined;
		(parent?.children ?? roots).push(node);
	}
	for (const file of files) {
		const group = groupNodes.get(Number(file.sysgroup));
		const node: PackageExplorerNode = {
			key: `file:${file.id}`, id: Number(file.id), fileId: Number(file.id), name: file.filename, kind: 'file',
			hasChildren: Number(file.objectcount) > 0, children: [],
		};
		(group?.children ?? roots).push(node);
	}
	sortNodes(roots);
	for (const group of groupNodes.values()) { group.hasChildren = group.children.length > 0; sortNodes(group.children); }
	const filesNode: PackageExplorerNode = { key: `files:${packageId}`, name: 'Файлы', kind: 'files', hasChildren: roots.length > 0, children: roots };
	return { key: `package:${packageId}`, id: packageId, name: packageName, kind: 'package', hasChildren: true, children: [filesNode] };
}

function normalizePath(value: string): string { return value.replace(/\//g, '\\').replace(/^\\+|\\+$/g, ''); }
function sortNodes(nodes: PackageExplorerNode[]): void { nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name, 'ru', { numeric: true }) : a.kind === 'group' ? -1 : 1); }
