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
const productionTaskPresentation_1 = require("../features/production-tasks/productionTaskPresentation");
suite('Production task presentation', () => {
    test('parses East Express dates strictly', () => {
        assert.equal((0, productionTaskPresentation_1.parseProductionDate)('09.10.2025 09:56:20')?.getFullYear(), 2025);
        assert.equal((0, productionTaskPresentation_1.parseProductionDate)('31.02.2025'), undefined);
        assert.equal((0, productionTaskPresentation_1.parseProductionDate)(''), undefined);
    });
    test('describes overdue, today, and future deadlines', () => {
        const now = new Date(2026, 8, 8, 12);
        assert.deepEqual((0, productionTaskPresentation_1.productionDeadlineInfo)('07.09.2026 12:00:00', now), { label: 'Просрочено на 1 день', tone: 'overdue', days: -1 });
        assert.deepEqual((0, productionTaskPresentation_1.productionDeadlineInfo)('08.09.2026 18:00:00', now), { label: 'Сегодня', tone: 'today', days: 0 });
        assert.deepEqual((0, productionTaskPresentation_1.productionDeadlineInfo)('10.09.2026 12:00:00', now), { label: 'Осталось 2 дня', tone: 'normal', days: 2 });
    });
    test('builds the public task link and copyable Markdown title', () => {
        assert.equal((0, productionTaskPresentation_1.productionTaskPublicUrl)(88605), 'https://r.oe-it.ru/88605');
        assert.equal((0, productionTaskPresentation_1.productionTaskMarkdown)('88605', 'Массовое подтверждение переноса флага Бесплатный при замене', 1), '88605 - Массовое подтверждение переноса флага Бесплатный при замене\n[https://r.oe-it.ru/88605](https://r.oe-it.ru/88605)');
    });
});
//# sourceMappingURL=productionTaskPresentation.test.js.map