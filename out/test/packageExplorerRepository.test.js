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
const assert = __importStar(require("node:assert/strict"));
const packageTree_1 = require("../features/packages/packageTree");
suite('Package explorer repository', () => {
    test('builds nested package folders from SysGroups.Path and attaches files', () => {
        const tree = (0, packageTree_1.buildPackageTree)(10, 'Консультант', [
            { id: '20', groupname: 'Диалоги', path: 'Диалоги' },
            { id: '21', groupname: 'Старые диалоги', path: 'Диалоги\\Старые диалоги' },
            { id: '22', groupname: 'SPU', path: 'SPU' },
        ], [
            { id: '30', filename: 'Диалог_DGetRicAndSU', sysgroup: '21', objectcount: '3' },
            { id: '31', filename: '88440.sql', sysgroup: '22', objectcount: '0' },
        ]);
        assert.equal(tree.name, 'Консультант');
        const files = tree.children[0];
        assert.equal(files?.name, 'Файлы');
        const dialogs = files?.children.find(node => node.id === 20);
        const legacy = dialogs?.children.find(node => node.id === 21);
        assert.deepEqual(legacy?.children.map(node => [node.name, node.hasChildren]), [['Диалог_DGetRicAndSU', true]]);
        assert.equal(files?.children.find(node => node.id === 22)?.children[0]?.name, '88440.sql');
    });
});
//# sourceMappingURL=packageExplorerRepository.test.js.map