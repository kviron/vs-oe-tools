"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseObjectSearchSelect = void 0;
exports.mapDatabaseObject = mapDatabaseObject;
exports.databaseObjectSearchSelect = `SELECT
	object.id, object.classid, object.seniorid, object.name,
	meta_class.name AS metaclassname,
	owner.name AS ownername, owner.id AS ownerid,
	owner_class.name AS ownerclassname,
	package.packagename,
	(SELECT bmpid FROM getbitmap(object.id, object.classid, 500)) AS bmpid,
	(entity_class.id IS NOT NULL) AS isclass,
	(method.id IS NOT NULL) AS ismethod,
	(attribute.id IS NOT NULL) AS isattribute
FROM abstract AS object
LEFT JOIN classes AS meta_class ON meta_class.id = object.classid
LEFT JOIN abstract AS owner ON owner.id = object.seniorid
LEFT JOIN classes AS owner_class ON owner_class.id = owner.classid
LEFT JOIN classes AS entity_class ON entity_class.id = object.id
LEFT JOIN methods AS method ON method.id = object.id
LEFT JOIN attributes AS attribute ON attribute.id = object.id
LEFT JOIN sysfile AS file ON file.id = object.sysfile
LEFT JOIN sysgroups AS file_group ON file_group.id = file.sysgroup
LEFT JOIN syspackages AS package ON package.id = file_group.package`;
function mapDatabaseObject(row) {
    return {
        id: String(row.id),
        classId: String(row.classid),
        seniorId: row.seniorid === null ? null : String(row.seniorid),
        name: row.name,
        metaClassName: row.metaclassname ?? '',
        ownerName: row.ownername ?? '',
        ownerId: row.ownerid === null ? null : String(row.ownerid),
        ownerClassName: row.ownerclassname ?? '',
        packageName: row.packagename ?? '',
        bitmapId: row.bmpid === null ? null : String(row.bmpid),
        kind: row.ismethod ? 'method' : row.isattribute ? 'attribute' : row.isclass ? 'class' : 'object',
    };
}
//# sourceMappingURL=objectSearch.js.map