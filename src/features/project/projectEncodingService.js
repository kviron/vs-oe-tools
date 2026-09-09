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
exports.applyProjectEncoding = applyProjectEncoding;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../../core/constants");
async function applyProjectEncoding(context, enabled) {
    let previousEncodings = context.workspaceState.get(constants_1.previousEncodingsKey);
    if (enabled && !previousEncodings) {
        previousEncodings = constants_1.sourceLanguageIds.map((languageId) => {
            const encoding = vscode.workspace
                .getConfiguration('files', { languageId })
                .inspect('encoding')?.workspaceLanguageValue;
            return {
                languageId,
                hadValue: encoding !== undefined,
                value: encoding,
            };
        });
        await context.workspaceState.update(constants_1.previousEncodingsKey, previousEncodings);
    }
    for (const languageId of constants_1.sourceLanguageIds) {
        const configuration = vscode.workspace.getConfiguration('files', { languageId });
        const previousEncoding = previousEncodings?.find((item) => item.languageId === languageId);
        const encoding = enabled
            ? 'windows1251'
            : previousEncoding?.hadValue
                ? previousEncoding.value
                : undefined;
        await configuration.update('encoding', encoding, vscode.ConfigurationTarget.Workspace, true);
    }
    if (!enabled) {
        await context.workspaceState.update(constants_1.previousEncodingsKey, undefined);
    }
}
// This method is called when your extension is activated
//# sourceMappingURL=projectEncodingService.js.map