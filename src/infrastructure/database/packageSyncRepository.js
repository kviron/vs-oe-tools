"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPackageSyncSnapshot = loadPackageSyncSnapshot;
exports.loadPackageBoundaryIssues = loadPackageBoundaryIssues;
exports.loadPackageSyncItems = loadPackageSyncItems;
const path = __importStar(require("node:path"));
const node_os_1 = require("node:os");
const promises_1 = require("node:fs/promises");
const vscode = __importStar(require("vscode"));
const iconv = __importStar(require("iconv-lite"));
const pg_1 = require("pg");
const packageSyncIssues_1 = require("../../features/package-sync/packageSyncIssues");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
const databaseQueryExecutor_1 = require("./databaseQueryExecutor");
async function loadPackageSyncSnapshot() {
    const boundaryIssuesPromise = loadPackageBoundaryIssues();
    const items = await loadPackageSyncItems();
    const [placeholderIssues, boundaryIssues] = await Promise.all([loadPackagePlaceholderIssues(items), boundaryIssuesPromise]);
    return { items, issues: [...placeholderIssues, ...boundaryIssues] };
}
async function loadPackagePlaceholderIssues(items) {
    const groups = await Promise.all(items.filter(packageSyncIssues_1.isPackagePlaceholderItem).map(async (item) => {
        const filePath = await resolvePlaceholderFile(item.localPath);
        if (!filePath) {
            return [];
        }
        const content = iconv.decode(await (0, promises_1.readFile)(filePath), 'win1251');
        return (0, packageSyncIssues_1.createPackagePlaceholderIssues)(item, filePath, (0, packageSyncIssues_1.parsePackagePlaceholderObjects)(content));
    }));
    return groups.flat();
}
async function resolvePlaceholderFile(localPath) {
    if (!localPath) {
        return undefined;
    }
    for (const candidate of path.extname(localPath) ? [localPath] : [localPath, `${localPath}.pkf`]) {
        try {
            await (0, promises_1.readFile)(candidate, { flag: 'r' });
            return candidate;
        }
        catch {
            // Try the physical PKF extension used by the package editor.
        }
    }
    return undefined;
}
async function loadPackageBoundaryIssues() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const result = await (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
            text: `WITH RECURSIVE package_edges AS (
			 SELECT P.PackageName AS SourcePackage, trim(Dependency) AS TargetPackage
			 FROM SysPackages P
			 CROSS JOIN LATERAL regexp_split_to_table(COALESCE(P.Packages::text, ''), ';') Dependency
			 WHERE trim(Dependency) <> ''
			), package_dependencies(SourcePackage, TargetPackage) AS (
			 SELECT SourcePackage, TargetPackage FROM package_edges
			 UNION
			 SELECT D.SourcePackage, E.TargetPackage
			 FROM package_dependencies D
			 JOIN package_edges E ON E.SourcePackage = D.TargetPackage
			)
			SELECT DISTINCT
			 R.ID AS ObjectID,
			 COALESCE(OwnerObject.Name, '#' || R.SeniorID::text) || ' --> ' || COALESCE(TargetObject.Name, '#' || R.ObjID::text) AS ObjectName,
			 10 AS ClassID,
			 'РефОбъект' AS ClassName,
			 1320 AS AttributeID,
			 'ObjID' AS AttributeName,
			 R.ObjID AS ReferenceID,
			 TargetObject.Name AS ReferenceName,
			 SourcePackage.PackageName AS SourcePackage,
			 TargetPackage.PackageName AS TargetPackage,
			 SourceFile.FileName AS SourceFile,
			 TargetFile.FileName AS RecommendedFile,
			 COALESCE(ChangedUser.Name, Changed.ObjectChangeLastUser::text, '') AS ChangedBy
			FROM Refs R
			JOIN Abstract RelationObject ON RelationObject.ID = R.ID
			LEFT JOIN Abstract OwnerObject ON OwnerObject.ID = R.SeniorID
			JOIN Abstract TargetObject ON TargetObject.ID = R.ObjID
			JOIN SysFile SourceFile ON SourceFile.ID = RelationObject.SysFile
			JOIN SysGroups SourceGroup ON SourceGroup.ID = SourceFile.SysGroup
			JOIN SysPackages SourcePackage ON SourcePackage.ID = SourceGroup.Package
			JOIN SysFile TargetFile ON TargetFile.ID = TargetObject.SysFile
			JOIN SysGroups TargetGroup ON TargetGroup.ID = TargetFile.SysGroup
			JOIN SysPackages TargetPackage ON TargetPackage.ID = TargetGroup.Package
			JOIN SysPackageBase Changed ON Changed.ObjectID = RelationObject.SysFile
			LEFT JOIN Abstract ChangedUser ON ChangedUser.ID = Changed.ObjectChangeLastUser
			WHERE Changed.ObjectChangeState IN (1, 2)
			 AND SourcePackage.ID <> TargetPackage.ID
			 AND NOT EXISTS (
			  SELECT 1 FROM package_dependencies Allowed
			  WHERE Allowed.SourcePackage = SourcePackage.PackageName
			    AND Allowed.TargetPackage = TargetPackage.PackageName
			 )
			ORDER BY R.ID`,
            source: 'Синхронизация пакетов: проверка пакетных границ',
            database: options.database,
        });
        return result.rows.map(row => ({
            objectId: Number(row.objectid),
            objectName: row.objectname ?? `#${row.objectid}`,
            classId: Number(row.classid),
            className: row.classname ?? '',
            attributeId: Number(row.attributeid),
            attributeName: row.attributename ?? '',
            referenceId: Number(row.referenceid),
            referenceName: row.referencename ?? `#${row.referenceid}`,
            sourcePackage: row.sourcepackage ?? '',
            targetPackage: row.targetpackage ?? '',
            sourceFile: row.sourcefile ?? '',
            recommendedFile: row.recommendedfile ?? '',
            changedBy: row.changedby === null ? '' : String(row.changedby),
            message: `ID ${Number(row.objectid)} нарушает границу пакетов`,
            type: 'package-boundary',
        }));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function loadPackageSyncItems() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        const [itemsResult, tuneResult] = await Promise.all([
            (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: `SELECT
				 ObjectID AS objectid,
				 ObjectClassID AS objectclassid,
				 ObjectSeniorID AS objectseniorid,
				 ObjectName AS objectname,
				 ObjectContentMD5 AS objectcontentmd5,
				 ObjectContentRevision AS objectcontentrevision,
				 ObjectChangeState AS objectchangestate,
				 ObjectChangeLastDate AS objectchangelastdate,
				 ObjectChangeLastUser AS objectchangelastuser,
				 SPB.ObjectPath AS objectpath,
				 COALESCE(SP.PackageName, CAST(SPB.ObjectPathPackage AS text)) AS packagepath,
				 SF.FileName AS physicalfilename
				 FROM SysPackageBase SPB
				 LEFT JOIN SysPackages SP ON SP.ID = SPB.ObjectPathPackage
				 LEFT JOIN SysFile SF ON SF.ID = SPB.ObjectID
				 ORDER BY packagepath, SPB.ObjectPath, SPB.ObjectName`,
                source: 'Синхронизация пакетов: загрузка объектов',
                database: options.database,
            }),
            (0, databaseQueryExecutor_1.executeMonitoredQuery)(client, {
                text: `SELECT pathtopackages FROM packagestune
				 WHERE upper(computername) = upper($1)
				   AND NULLIF(trim(pathtopackages), '') IS NOT NULL
				 LIMIT 1`,
                values: [(0, node_os_1.hostname)()],
                source: 'Синхронизация пакетов: путь к пакетам',
                database: options.database,
            }).catch(() => undefined),
        ]);
        const packagesRoot = tuneResult?.rows[0]?.pathtopackages ?? workspacePackagesRoot();
        return itemsResult.rows.map(row => {
            const objectPath = row.objectpath ?? '';
            const packagePath = row.packagepath ?? '';
            return {
                objectId: Number(row.objectid),
                objectClassId: Number(row.objectclassid),
                objectSeniorId: row.objectseniorid === null ? null : Number(row.objectseniorid),
                objectName: row.objectname ?? '',
                contentMd5: row.objectcontentmd5 ?? '',
                contentRevision: row.objectcontentrevision === null ? null : Number(row.objectcontentrevision),
                changeState: row.objectchangestate === null ? '' : String(row.objectchangestate),
                changedAt: row.objectchangelastdate instanceof Date ? row.objectchangelastdate.toISOString() : String(row.objectchangelastdate ?? ''),
                changedBy: row.objectchangelastuser === null ? '' : String(row.objectchangelastuser),
                objectPath,
                packagePath,
                localPath: packagesRoot ? resolveLocalPath(packagesRoot, packagePath, objectPath, row.physicalfilename ?? row.objectname ?? '') : undefined,
            };
        });
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
function resolveLocalPath(root, packagePath, objectPath, name) {
    if (/^[a-z]:[\\/]/i.test(objectPath) || /^\\\\/.test(objectPath)) {
        return path.normalize(objectPath);
    }
    const cleanPackage = packagePath.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
    const cleanObject = objectPath.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
    const cleanName = name.replace(/\//g, '\\').replace(/^\\+/, '');
    const normalizedName = cleanName.toLocaleLowerCase('en-US');
    const normalizedPackage = cleanPackage.toLocaleLowerCase('en-US');
    const extension = path.extname(cleanName);
    const nameWithoutExtension = extension ? cleanName.slice(0, -extension.length) : cleanName;
    if (extension && cleanObject.toLocaleLowerCase('en-US').endsWith(nameWithoutExtension.toLocaleLowerCase('en-US'))) {
        const qualifiedObject = cleanObject.toLocaleLowerCase('en-US').startsWith(`${normalizedPackage}\\`)
            ? cleanObject
            : [cleanPackage, cleanObject].filter(Boolean).join('\\');
        return path.join(root, `${qualifiedObject}${extension}`);
    }
    if (cleanName.includes('\\')) {
        const qualifiedName = normalizedName.startsWith(`${normalizedPackage}\\`)
            ? cleanName
            : [cleanPackage, cleanName].filter(Boolean).join('\\');
        return path.join(root, qualifiedName);
    }
    const objectHasName = cleanObject.toLocaleLowerCase('en-US').endsWith(normalizedName);
    const objectHasPackage = cleanObject.toLocaleLowerCase('en-US').startsWith(`${cleanPackage.toLocaleLowerCase('en-US')}\\`);
    const nameIsPackage = normalizedName === normalizedPackage;
    const relative = [objectHasPackage ? '' : cleanPackage, cleanObject, objectHasName || nameIsPackage ? '' : cleanName].filter(Boolean).join('\\');
    return path.join(root, relative);
}
function workspacePackagesRoot() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return undefined;
    }
    return path.basename(workspaceRoot).toLocaleLowerCase('en-US') === 'packages'
        ? workspaceRoot
        : path.join(workspaceRoot, 'packages');
}
//# sourceMappingURL=packageSyncRepository.js.map