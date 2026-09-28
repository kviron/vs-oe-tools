"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const bootstrap_1 = require("#app/application/bootstrap");
const editors_1 = require("#app/application/editors");
const features_1 = require("#app/application/features");
const navigation_1 = require("#app/application/navigation");
const mcp_1 = require("#app/application/mcp");
const workbench_1 = require("#app/application/workbench");
const workspace_1 = require("#app/application/workspace");
/** Starts application stages in dependency order. Feature setup lives in each stage. */
async function activate(context) {
    const app = await (0, bootstrap_1.bootstrap)(context);
    const editors = (0, editors_1.registerEditors)(context, app);
    const features = (0, features_1.registerFeatures)(context, app, editors);
    const navigation = await (0, navigation_1.registerNavigation)(context, app, editors, features);
    const mcp = await (0, mcp_1.registerMcp)(context, app, navigation);
    const workbench = (0, workbench_1.registerWorkbench)(context, app, editors, features);
    await (0, workspace_1.registerWorkspace)(context, app, features, mcp, workbench);
}
//# sourceMappingURL=activate.js.map