"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDatabaseConnection = testDatabaseConnection;
exports.loadClasses = loadClasses;
exports.getClassDetails = getClassDetails;
const pg_1 = require("pg");
const projectDatabaseOptions_1 = require("../configuration/projectDatabaseOptions");
async function testDatabaseConnection() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({
        ...options,
        application_name: 'vc-ve-tools',
        connectionTimeoutMillis: 5000,
    });
    try {
        await client.connect();
        const result = await client.query('SELECT current_database() AS database, current_user AS user');
        const row = result.rows[0];
        if (!row) {
            throw new Error('База не вернула результат проверки.');
        }
        return row;
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function loadClasses() {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({
        ...options,
        application_name: 'vc-ve-tools',
        connectionTimeoutMillis: 5000,
    });
    try {
        await client.connect();
        const classesResult = await client.query(`SELECT id, name, seniorid, ord
			 FROM classes
			 ORDER BY ord NULLS LAST, name`);
        const commentsResult = await client.query(`SELECT comments.id, comments.name, comments.seniorid, comments.ord
			 FROM objcomments AS comments
			 INNER JOIN classes ON classes.id = comments.seniorid
			 ORDER BY comments.ord NULLS LAST, comments.name`);
        const metaDataCountsResult = await client.query(`SELECT map.seniorid, COUNT(map.id) AS count
			 FROM objectmetadatamap AS map
			 INNER JOIN classes ON classes.id = map.seniorid
			 WHERE map.metaobjectclassid = 5
			 GROUP BY map.seniorid`);
        const commentsBySeniorId = new Map();
        for (const comment of commentsResult.rows) {
            const comments = commentsBySeniorId.get(comment.seniorid) ?? [];
            comments.push(comment);
            commentsBySeniorId.set(comment.seniorid, comments);
        }
        const metaDataCountBySeniorId = new Map(metaDataCountsResult.rows.map((item) => [item.seniorid, Number(item.count)]));
        return classesResult.rows.map((classRow) => ({
            ...classRow,
            comments: commentsBySeniorId.get(classRow.id) ?? [],
            objectMetaDataCount: metaDataCountBySeniorId.get(classRow.id) ?? 0,
        }));
    }
    finally {
        await client.end().catch(() => undefined);
    }
}
async function getClassDetails(id) {
    const options = await (0, projectDatabaseOptions_1.getProjectDatabaseOptions)();
    const client = new pg_1.Client({ ...options, application_name: 'vc-ve-tools', connectionTimeoutMillis: 5000 });
    let classDetails;
    try {
        await client.connect();
        const result = await client.query(`SELECT class.*, child.name AS childclassname, parent.name AS parentclassname
			 FROM classes AS class
			 LEFT JOIN classes AS child ON child.id = class.childclassid
			 LEFT JOIN classes AS parent ON parent.id = class.parentclassid
			 WHERE class.id = $1`, [id]);
        classDetails = result.rows[0];
    }
    finally {
        await client.end().catch(() => undefined);
    }
    if (!classDetails) {
        throw new Error('Класс не найден в базе.');
    }
    return classDetails;
}
//# sourceMappingURL=classRepository.js.map