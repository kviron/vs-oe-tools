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
exports.getClassDetailsHtml = getClassDetailsHtml;
const vscode = __importStar(require("vscode"));
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function isEnabled(value) {
    return value ? 'checked' : '';
}
function classDetailField(label, value) {
    return `<label class="field"><span>${escapeHtml(label)}:</span><input readonly value="${escapeHtml(value)}"></label>`;
}
function getClassDetailsHtml(webview, extensionUri, classDetails) {
    const classIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'class.svg'));
    const property = (label, value) => `<label class="property"><input type="checkbox" disabled ${isEnabled(value)}><span>${escapeHtml(label)}</span></label>`;
    return /* html */ `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource};">
<style>
	:root { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
	body { margin: 0; padding: 0 14px 16px; }
	.tabs { border-bottom: 1px solid var(--vscode-panel-border); display: flex; margin-bottom: 16px; }
	.tab { align-items: center; border-bottom: 2px solid var(--vscode-focusBorder); display: flex; gap: 6px; padding: 8px 10px 6px; }
	.class-icon { background-color: var(--vscode-symbolIcon-classForeground); height: 16px; mask: url('${classIconUri}') center / contain no-repeat; -webkit-mask: url('${classIconUri}') center / contain no-repeat; width: 16px; }
	.details { display: grid; gap: 12px 36px; grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr); max-width: 1060px; }
	.field { align-items: center; display: grid; gap: 10px; grid-template-columns: 130px minmax(0, 1fr); min-height: 28px; }
	.field input { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); color: var(--vscode-input-foreground); font: inherit; min-width: 0; padding: 4px 6px; }
	.properties { border: 1px solid var(--vscode-panel-border); margin-top: 16px; max-width: 620px; padding: 8px 10px 10px; }
	.properties legend { padding: 0 4px; }
	.properties-grid { display: grid; gap: 5px 20px; grid-template-columns: repeat(3, minmax(145px, 1fr)); }
	.property { align-items: center; display: flex; gap: 5px; }
	.property input { accent-color: var(--vscode-checkbox-selectBorder); margin: 0; }
	.description { border: 1px solid var(--vscode-panel-border); margin-top: 16px; padding: 8px 10px 10px; }
	.description textarea { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); box-sizing: border-box; color: var(--vscode-input-foreground); font: inherit; margin-top: 6px; min-height: 105px; resize: vertical; width: 100%; }
	@media (max-width: 760px) { .details { grid-template-columns: 1fr; } .properties-grid { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
	<nav class="tabs"><span class="tab"><span class="class-icon"></span>Класс</span></nav>
	<section class="details">
		<div>
			${classDetailField('Имя', classDetails.name)}
			${classDetailField('Псевдонимы', classDetails.aliases)}
			${classDetailField('Полное имя', classDetails.title)}
			${classDetailField('Имя объекта', classDetails.dbtablename)}
			${classDetailField('Вывод', classDetails.dispexpression)}
			${classDetailField('Доп. вывод', classDetails.adddispexpression)}
		</div>
		<div>
			${classDetailField('Ид', classDetails.id)}
			${classDetailField('Таблица', classDetails.dbtablename)}
			${classDetailField('Класс детей', classDetails.childclassname)}
			${classDetailField('Класс владельца', classDetails.parentclassname)}
			${classDetailField('Кэш-объекты', classDetails.cacheobjclass)}
			${classDetailField('Пров. ссылочн. цел.', classDetails.refintegritycheck)}
			${classDetailField('Алиас по умолчанию', classDetails.defaultdbalias)}
		</div>
	</section>
	<fieldset class="properties">
		<legend>Свойства</legend>
		<div class="properties-grid">
			${property('Абстрактный', classDetails.isabstract)}
			${property('Виртуальный', classDetails.virtual)}
			${property('Наследуемый', classDetails.isinheritable)}
			${property('Кэшируемый', classDetails.cached)}
			${property('Одна таблица', classDetails.onedbtable)}
			${property('Общая таблица', classDetails.tableshared)}
			${property('Упорядочиваемый', classDetails.ordered)}
			${property('Класс-представление', classDetails.isview)}
			${property('Неиспользуемый', classDetails.unreferenced)}
		</div>
	</fieldset>
	<fieldset class="description"><legend>Описание</legend><textarea readonly></textarea></fieldset>
</body>
</html>`;
}
//# sourceMappingURL=classDetailsTemplate.js.map