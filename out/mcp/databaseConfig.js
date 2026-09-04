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
exports.loadMcpDatabaseOptions = loadMcpDatabaseOptions;
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
const rdboadmIni_1 = require("../infrastructure/configuration/rdboadmIni");
async function loadMcpDatabaseOptions(workspacePath, role, profile) {
    try {
        const { databases } = await (0, rdboadmIni_1.loadRdboadmDatabases)(workspacePath);
        const selected = databases.find(database => database.id.toLowerCase() === profile?.toLowerCase()) ?? databases[0];
        if (selected) {
            return (0, rdboadmIni_1.rdboadmDatabaseOptions)(selected);
        }
    }
    catch (error) {
        if (profile) {
            throw error;
        }
    }
    const varsContent = iconv.decode(await (0, promises_1.readFile)(path.join(workspacePath, 'Vars.bat')), 'win1251');
    const variables = parseVarsFile(varsContent);
    const password = roleVariable(variables, 'oedbmspassword', role);
    const database = variables.get(`devdbname_${role}`);
    const port = Number(roleVariable(variables, 'oedbmsport', role) ?? '5432');
    if (!database || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Vars.bat does not contain valid connection settings for the ${role} database.`);
    }
    return {
        host: roleVariable(variables, 'oedbmshost', role) ?? 'localhost',
        port,
        database,
        user: roleVariable(variables, 'oedbmsusername', role) ?? 'postgres',
        password,
    };
}
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
        if (separator > 0) {
            variables.set(assignment.slice(0, separator).trim().toLowerCase(), assignment.slice(separator + 1).trim());
        }
    }
    return variables;
}
function roleVariable(variables, name, role) {
    return variables.get(`${name}_${role}`) ?? variables.get(name);
}
//# sourceMappingURL=databaseConfig.js.map