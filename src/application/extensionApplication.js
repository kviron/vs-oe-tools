"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateExtension = activateExtension;
const activate_1 = require("./activate");
/** Composition root: creates and wires all extension features. */
async function activateExtension(context) {
    await (0, activate_1.activate)(context);
}
//# sourceMappingURL=extensionApplication.js.map