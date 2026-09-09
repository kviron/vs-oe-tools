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
exports.parseRdboadmIni = parseRdboadmIni;
exports.updateRdboadmSection = updateRdboadmSection;
exports.resolveRdboadmPath = resolveRdboadmPath;
exports.loadRdboadmDatabases = loadRdboadmDatabases;
exports.saveRdboadmDatabase = saveRdboadmDatabase;
exports.rdboadmDatabaseOptions = rdboadmDatabaseOptions;
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
function parseRdboadmIni(content) {
    const databases = [];
    let current;
    for (const line of content.split(/\r?\n/)) {
        const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (section) {
            current = { id: section[1].trim(), name: section[1].trim(), fields: [] };
            databases.push(current);
            continue;
        }
        const assignment = line.match(/^\s*([^;#][^=]*?)\s*=\s*(.*?)\s*$/);
        if (current && assignment) {
            current.fields.push({ key: assignment[1].trim(), value: assignment[2] });
            if (assignment[1].trim().toLowerCase() === 'dispname' && assignment[2]) {
                current.name = assignment[2];
            }
        }
    }
    return databases;
}
function updateRdboadmSection(content, sectionId, fields) {
    const values = new Map(fields.map(field => [field.key.toLowerCase(), field.value]));
    const lines = content.split(/(\r?\n)/);
    let inSection = false;
    let found = false;
    for (let index = 0; index < lines.length; index += 2) {
        const section = lines[index].match(/^\s*\[([^\]]+)\]\s*$/);
        if (section) {
            if (inSection) {
                break;
            }
            inSection = section[1].trim().toLowerCase() === sectionId.toLowerCase();
            found ||= inSection;
            continue;
        }
        if (!inSection) {
            continue;
        }
        const assignment = lines[index].match(/^(\s*)([^;#][^=]*?)(\s*=\s*)(.*?)(\s*)$/);
        if (!assignment) {
            continue;
        }
        const key = assignment[2].trim().toLowerCase();
        if (values.has(key)) {
            lines[index] = `${assignment[1]}${assignment[2]}${assignment[3]}${values.get(key)}${assignment[5]}`;
        }
    }
    if (!found) {
        throw new Error(`В rdboadm.ini не найдена секция [${sectionId}].`);
    }
    return lines.join('');
}
function resolveRdboadmPath(workspacePath) {
    return path.basename(workspacePath).toLowerCase() === 'trunk'
        ? path.join(workspacePath, 'bin', 'rdboadm.ini')
        : path.join(workspacePath, 'trunk', 'bin', 'rdboadm.ini');
}
async function loadRdboadmDatabases(workspacePath) {
    const iniPath = resolveRdboadmPath(workspacePath);
    const content = iconv.decode(await (0, promises_1.readFile)(iniPath), 'win1251');
    return { path: iniPath, databases: parseRdboadmIni(content) };
}
async function saveRdboadmDatabase(workspacePath, database) {
    const iniPath = resolveRdboadmPath(workspacePath);
    const content = iconv.decode(await (0, promises_1.readFile)(iniPath), 'win1251');
    await (0, promises_1.writeFile)(iniPath, iconv.encode(updateRdboadmSection(content, database.id, database.fields), 'win1251'));
}
function rdboadmDatabaseOptions(database) {
    const fields = new Map(database.fields.map(field => [field.key.toLowerCase(), field.value]));
    const dbPath = fields.get('dbpath')?.trim();
    const match = dbPath?.match(/^(.+?)(?::(\d+))?\/([^/]+)$/);
    const user = fields.get('dbusername');
    const password = fields.get('dbpassword');
    if (!match || !user || password === undefined) {
        throw new Error(`В секции [${database.id}] некорректны dbpath, dbusername или dbpassword.`);
    }
    const port = Number(match[2] ?? '5432');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`В секции [${database.id}] указан некорректный порт.`);
    }
    return { host: match[1], port, database: match[3], user, password };
}
//# sourceMappingURL=rdboadmIni.js.map