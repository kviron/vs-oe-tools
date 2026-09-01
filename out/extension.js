"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const extensionApplication_1 = require("./application/extensionApplication");
function activate(context) {
    return (0, extensionApplication_1.activateExtension)(context);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map