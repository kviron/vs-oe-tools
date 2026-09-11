import { z } from '../schemas';
import { databaseToolResult } from '../toolResult';
import { queryDatabaseRaw } from '../databaseSession';
import { evaluatePackageBinding, type ObjectPackageBinding } from '../../features/package-sync/objectPackageBinding';
import type { McpToolServer } from '../toolTypes';

interface PackageBindingRow extends Record<string, unknown> {
	objectid: number;
	objectclassid: number;
	objectseniorid: number | null;
	objectname: string | null;
	classname: string | null;
	sysfileid: number | null;
	filename: string | null;
	sysgroupid: number | null;
	groupname: string | null;
	packageid: number | null;
	packagename: string | null;
	objectchangestate: string | number | null;
	objectpath: string | null;
	depth: number;
}

function mapBinding(row: PackageBindingRow): ObjectPackageBinding {
	return {
		objectId: Number(row.objectid),
		objectClassId: Number(row.objectclassid),
		objectSeniorId: row.objectseniorid === null ? null : Number(row.objectseniorid),
		objectName: row.objectname ?? `#${row.objectid}`,
		className: row.classname ?? '',
		sysFileId: row.sysfileid === null ? null : Number(row.sysfileid),
		fileName: row.filename ?? '',
		sysGroupId: row.sysgroupid === null ? null : Number(row.sysgroupid),
		groupName: row.groupname ?? '',
		packageId: row.packageid === null ? null : Number(row.packageid),
		packageName: row.packagename ?? '',
		changeState: row.objectchangestate === null ? '' : String(row.objectchangestate),
		objectPath: row.objectpath ?? '',
		depth: Number(row.depth),
	};
}

const bindingQuery = `WITH RECURSIVE object_tree AS (
	 SELECT A.ID, A.ClassID, A.SeniorID, A.Name, A.SysFile, 0 AS Depth
	 FROM Abstract A WHERE A.ID = $1
	 UNION ALL
	 SELECT Child.ID, Child.ClassID, Child.SeniorID, Child.Name, Child.SysFile, Parent.Depth + 1
	 FROM Abstract Child
	 JOIN object_tree Parent ON Child.SeniorID = Parent.ID
	 WHERE Parent.Depth < 20
	)
	SELECT Object.ID AS ObjectID, Object.ClassID AS ObjectClassID,
	 Object.SeniorID AS ObjectSeniorID, Object.Name AS ObjectName,
	 MetaClass.Name AS ClassName, File.ID AS SysFileID, File.FileName,
	 File.SysGroup AS SysGroupID, FileGroup.GroupName, Package.ID AS PackageID,
	 Package.PackageName, Changed.ObjectChangeState, Changed.ObjectPath, Object.Depth
	FROM object_tree Object
	LEFT JOIN Abstract MetaClass ON MetaClass.ID = Object.ClassID
	LEFT JOIN SysFile File ON File.ID = Object.SysFile
	LEFT JOIN SysGroups FileGroup ON FileGroup.ID = File.SysGroup
	LEFT JOIN SysPackages Package ON Package.ID = FileGroup.Package
	LEFT JOIN SysPackageBase Changed ON Changed.ObjectID = File.ID
	ORDER BY Object.Depth, Object.ID`;

async function loadBindings(objectId: number): Promise<ObjectPackageBinding[]> {
	return (await queryDatabaseRaw<PackageBindingRow>(bindingQuery, [objectId])).map(mapBinding);
}

export function registerTool(server: McpToolServer): void {
	server.registerTool('check_object_package_binding', {
		description: 'Verify the real package ownership of a newly created or saved East Express object and all descendants. Call immediately after metadata creation. Reports Abstract.SysFile = NULL, #package$, missing SysPackageBase state, and differences from an optional template object.',
		inputSchema: {
			objectId: z.number().int().positive().describe('Newly created East Express object ID'),
			templateObjectId: z.number().int().positive().optional().describe('Optional source/template object whose concrete package file is expected'),
		},
		annotations: { readOnlyHint: true },
	}, async ({ objectId, templateObjectId }: { objectId: number; templateObjectId?: number }) => databaseToolResult(async () => {
		const objects = await loadBindings(objectId);
		const templateObjects = templateObjectId === undefined ? [] : await loadBindings(templateObjectId);
		const expected = templateObjects[0];
		const problems = evaluatePackageBinding(objects, expected);
		return {
			found: objects.length > 0,
			ok: objects.length > 0 && problems.length === 0,
			objectId,
			templateObjectId: templateObjectId ?? null,
			expectedFile: expected ? {
				sysFileId: expected.sysFileId,
				fileName: expected.fileName,
				groupName: expected.groupName,
				packageName: expected.packageName,
			} : null,
			objects,
			problems,
		};
	}));
}
