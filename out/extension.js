"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const activate_1 = require("./application/activate");
function activate(context) {
    return (0, activate_1.activate)(context);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map