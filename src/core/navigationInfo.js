"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNavigationInfoPath = getNavigationInfoPath;
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_path_2 = require("node:path");
function getNavigationInfoPath(workspacePath) {
    const normalized = process.platform === 'win32'
        ? (0, node_path_1.resolve)(workspacePath).toLocaleLowerCase('en-US')
        : (0, node_path_1.resolve)(workspacePath);
    const workspaceHash = (0, node_crypto_1.createHash)('sha256').update(normalized).digest('hex').slice(0, 24);
    return (0, node_path_2.join)((0, node_os_1.tmpdir)(), 'vc-ve-tools', `navigation-${workspaceHash}.json`);
}
//# sourceMappingURL=navigationInfo.js.map