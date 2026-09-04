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
exports.registerDatabaseMcpServer = registerDatabaseMcpServer;
const vscode = __importStar(require("vscode"));
const projectDatabaseOptions_1 = require("../infrastructure/configuration/projectDatabaseOptions");
const constants_1 = require("../core/constants");
function registerDatabaseMcpServer(context, logsPath, navigation) {
    const changeEmitter = new vscode.EventEmitter();
    const registration = vscode.lm.registerMcpServerDefinitionProvider('vc-ve-tools.database', {
        onDidChangeMcpServerDefinitions: changeEmitter.event,
        provideMcpServerDefinitions: () => {
            if (!vscode.workspace.getConfiguration('vcVeTools').get(constants_1.mcpEnabledSetting, true)) {
                return [];
            }
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return [];
            }
            const server = new vscode.McpStdioServerDefinition('East Express Database and Tools', process.execPath, [
                vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.js').fsPath,
                '--workspace', workspaceFolder.uri.fsPath,
                '--database-role', (0, projectDatabaseOptions_1.getDatabaseRole)(),
                '--logs', logsPath,
                '--navigation-info', navigation.infoPath,
            ], {}, '0.15.0');
            server.cwd = workspaceFolder.uri;
            return [server];
        },
    });
    const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('vcVeTools.databaseRole') || event.affectsConfiguration(`vcVeTools.${constants_1.mcpEnabledSetting}`)) {
            changeEmitter.fire();
        }
    });
    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(() => changeEmitter.fire());
    return vscode.Disposable.from(registration, configurationListener, workspaceListener, changeEmitter);
}
//# sourceMappingURL=registerMcpServer.js.map