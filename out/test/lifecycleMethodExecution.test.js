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
const lifecycleMethodExecution_1 = require("../features/lifecycle/lifecycleMethodExecution");
const oeStaticMethodExecutor_1 = require("../features/lifecycle/oeStaticMethodExecutor");
suite('Lifecycle method execution', () => {
    test('builds the native MethodParam value', () => {
        assert.equal((0, lifecycleMethodExecution_1.buildLifecycleMethodParameter)({
            name: 'СвязанныеОбъекты_Просмотр', displayName: 'Связанные объекты (просмотр)',
            kindId: 8927425, ownerClassId: 12857713,
        }), 'paramName=СвязанныеОбъекты_Просмотр,paramFName=Связанные объекты (просмотр),paramKind=8927425,paramLCSenior=12857713');
    });
    test('quotes complete parameter-list pairs that contain commas', () => {
        assert.match((0, lifecycleMethodExecution_1.buildLifecycleMethodParameter)({
            name: 'A', displayName: 'A', kindId: 8927425, ownerClassId: 12857713,
            roleIds: [12858357, 12858367],
        }), /,"paramRole=12858357,12858367"/u);
    });
    test('builds OEExecTask arguments without a shell', () => {
        assert.deepEqual((0, oeStaticMethodExecutor_1.buildOeExecTaskArguments)(3143815, 'paramName=A,paramKind=8927425', 'oetest', 'localhost', { username: 'dev', password: 'secret' }), [
            '-l', 'host=localhost,db=oetest,Username=dev,password=secret', '-MethodID=3143815',
            '-MethodParam=paramName=A,paramKind=8927425', '-ForceOutputOEM',
        ]);
    });
    test('builds aiMCP.http_Start arguments in configuration mode without an empty method parameter', () => {
        assert.deepEqual((0, oeStaticMethodExecutor_1.buildClientMcpStartArguments)('oetrunk', 'localhost', { username: 'dev', password: 'secret' }), [
            '-l', 'host=localhost,db=oetrunk,Username=dev,password=secret,Shell=Настройка',
            '-MethodID=12464780',
            '-MethodParam=1',
            '-ForceOutputOEM',
        ]);
    });
    test('rejects command delimiters in user text', () => {
        assert.throws(() => (0, lifecycleMethodExecution_1.buildLifecycleMethodParameter)({
            name: 'A; commit work', displayName: 'A', kindId: 8927425, ownerClassId: 12857713,
        }), /недопустимый символ/);
    });
    test('rejects non-allowlisted method IDs', () => {
        assert.throws(() => (0, oeStaticMethodExecutor_1.buildOeExecTaskArguments)(12958243, 'value', 'oetest', 'localhost', { username: 'dev', password: 'secret' }), /не разрешён/);
    });
});
//# sourceMappingURL=lifecycleMethodExecution.test.js.map