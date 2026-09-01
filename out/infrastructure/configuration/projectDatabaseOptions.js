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
exports.parseVarsFile = parseVarsFile;
exports.getDatabaseRole = getDatabaseRole;
exports.getProjectDatabaseOptions = getProjectDatabaseOptions;
const promises_1 = require("node:fs/promises");
const vscode = __importStar(require("vscode"));
const iconv = __importStar(require("iconv-lite"));
const constants_1 = require("../../core/constants");
function parseVarsFile(content) {
    const variables = new Map();
    for (const sourceLine of content.split(/\r?\n/)) {
        const match = sourceLine.match(/^\s*@?set\s+(.+?)\s*$/i);
        if (!match) {
            continue;
        }
        let assignment = match[1];
        if (assignment.startsWith('"') && assignment.endsWith('"')) {
            assignment = assignment.slice(1, -1);
        }
        const separator = assignment.indexOf('=');
        if (separator < 1) {
            continue;
        }
        const name = assignment.slice(0, separator).trim().toLowerCase();
        const value = assignment.slice(separator + 1).trim();
        variables.set(name, value);
    }
    return variables;
}
function getDatabaseRole() {
    return vscode.workspace.getConfiguration('vcVeTools').get(constants_1.databaseRoleSetting) === 'test'
        ? 'test'
        : 'main';
}
function getRoleVariable(variables, name, role) {
    return variables.get(`${name}_${role}`) ?? variables.get(name);
}
async function getProjectDatabaseOptions() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('Сначала откройте папку проекта.');
    }
    const varsPath = vscode.Uri.joinPath(workspaceFolder.uri, 'Vars.bat');
    let varsContent;
    try {
        varsContent = iconv.decode(await (0, promises_1.readFile)(varsPath.fsPath), 'win1251');
    }
    catch {
        throw new Error('В корне проекта не найден или недоступен файл Vars.bat.');
    }
    const variables = parseVarsFile(varsContent);
    const databaseRole = getDatabaseRole();
    const password = getRoleVariable(variables, 'oedbmspassword', databaseRole);
    const database = variables.get(`devdbname_${databaseRole}`);
    const port = Number(getRoleVariable(variables, 'oedbmsport', databaseRole) ?? '5432');
    if (!database) {
        throw new Error('В Vars.bat не указано devDBName_main.');
    }
    if (!password) {
        throw new Error('В Vars.bat не указан oeDBMSPassword.');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('В Vars.bat указан некорректный oeDBMSPort.');
    }
    return {
        host: getRoleVariable(variables, 'oedbmshost', databaseRole) ?? 'localhost',
        port,
        database,
        user: getRoleVariable(variables, 'oedbmsusername', databaseRole) ?? 'postgres',
        password,
    };
}
//# sourceMappingURL=projectDatabaseOptions.js.map