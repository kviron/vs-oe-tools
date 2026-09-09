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
exports.registerNavigationTools = registerNavigationTools;
const vscode = __importStar(require("vscode"));
function registerNavigationTools(context, actions) {
    context.subscriptions.push(vscode.lm.registerTool('vcVeTools_reveal_class', createClassTool('Показываю класс в проводнике Восточного Экспресса…', actions.revealClass, classId => `Класс ID=${classId} показан в проводнике Восточного Экспресса.`)), vscode.lm.registerTool('vcVeTools_open_class', createClassTool('Открываю карточку класса Восточного Экспресса…', async (classId) => {
        await actions.revealClass(classId);
        await actions.openClass(classId);
    }, classId => `Класс ID=${classId} показан в проводнике и открыт в окне Восточного Экспресса.`)), vscode.lm.registerTool('vcVeTools_open_method', {
        prepareInvocation: () => ({ invocationMessage: 'Открываю метод Восточного Экспресса в редакторе…' }),
        invoke: async (options) => {
            const methodId = requirePositiveId(options.input.methodId, 'methodId');
            await actions.openMethod(methodId);
            return textResult(`Метод ID=${methodId} открыт в редакторе.`);
        },
    }), vscode.lm.registerTool('vcVeTools_reveal_method', {
        prepareInvocation: () => ({ invocationMessage: 'Открываю вкладку методов класса и выделяю метод…' }),
        invoke: async (options) => {
            const methodId = requirePositiveId(options.input.methodId, 'methodId');
            const classId = requirePositiveId(options.input.classId, 'classId');
            await actions.revealMethod(classId, methodId);
            return textResult(`Метод ID=${methodId} выделен на вкладке методов класса ID=${classId}.`);
        },
    }));
}
function createClassTool(invocationMessage, action, result) {
    return {
        prepareInvocation: () => ({ invocationMessage }),
        invoke: async (options) => {
            const classId = requirePositiveId(options.input.classId, 'classId');
            await action(classId);
            return textResult(result(classId));
        },
    };
}
function requirePositiveId(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} должен быть положительным целым числом.`);
    }
    return value;
}
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
//# sourceMappingURL=navigationTools.js.map