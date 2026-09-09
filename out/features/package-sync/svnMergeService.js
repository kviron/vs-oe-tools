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
exports.mergePackageRevision = mergePackageRevision;
exports.loadConflictContent = loadConflictContent;
exports.saveConflictResult = saveConflictResult;
exports.resolveMergeSource = resolveMergeSource;
exports.parseSvnMergeOutput = parseSvnMergeOutput;
exports.parseSvnConflictInfo = parseSvnConflictInfo;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const node_util_1 = require("node:util");
const iconv = __importStar(require("iconv-lite"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function mergePackageRevision(workspacePath, branch, revision) {
    if (!Number.isSafeInteger(revision) || revision <= 0) {
        throw new Error('Ревизия должна быть положительным целым числом.');
    }
    const workingCopy = path.join(workspacePath, 'packages');
    if (!(await (0, promises_1.stat)(workingCopy).catch(() => undefined))?.isDirectory()) {
        throw new Error(`Не найдена рабочая копия пакетов: ${workingCopy}`);
    }
    const source = await resolveMergeSource(workingCopy, branch);
    const { stdout, stderr } = await runSvn(['merge', '-c', String(revision), source, workingCopy], workingCopy);
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    const touched = parseSvnMergeOutput(output, workingCopy);
    const conflicts = await loadSvnConflicts(workingCopy);
    const files = mergeFileLists(touched, conflicts);
    return { source, revision, workingCopy, files, output };
}
async function loadConflictContent(workingCopy, relativePath) {
    const filePath = safeWorkingCopyPath(workingCopy, relativePath);
    const { stdout } = await runSvn(['info', '--xml', filePath], workingCopy);
    const conflict = parseSvnConflictInfo(stdout);
    if (!conflict) {
        throw new Error('SVN не вернул текстовые версии конфликта. Возможно, это конфликт дерева.');
    }
    const [local, result, incoming] = await Promise.all([
        readText(resolveConflictArtifact(filePath, conflict.local)),
        readText(filePath),
        readText(resolveConflictArtifact(filePath, conflict.incoming)),
    ]);
    return { filePath, local, result, incoming, canResolve: true };
}
async function saveConflictResult(filePath, content, resolve) {
    const encoding = usesWindows1251(filePath) ? 'win1251' : 'utf8';
    await (0, promises_1.writeFile)(filePath, iconv.encode(content, encoding));
    if (resolve) {
        await runSvn(['resolve', '--accept', 'working', filePath], path.dirname(filePath));
    }
}
async function resolveMergeSource(workingCopy, value) {
    const branch = value.trim().replace(/\\/g, '/').replace(/\/$/, '');
    if (!branch || /[\r\n]/.test(branch)) {
        throw new Error('Укажите ветку или SVN URL.');
    }
    if (/^(?:https?|svn):\/\//i.test(branch) || branch.startsWith('^/')) {
        return branch;
    }
    const { stdout } = await runSvn(['info', '--show-item', 'repos-root-url', workingCopy], workingCopy);
    const repositoryRoot = stdout.trim().replace(/\/$/, '');
    if (!repositoryRoot) {
        throw new Error('Не удалось определить корневой URL SVN-репозитория.');
    }
    if (branch === 'trunk' || branch.startsWith('branches/') || branch.startsWith('tags/')) {
        return `${repositoryRoot}/${branch}`;
    }
    return `${repositoryRoot}/branches/${branch}`;
}
function parseSvnMergeOutput(output, workingCopy) {
    const byPath = new Map();
    for (const line of output.split(/\r?\n/)) {
        const match = line.match(/^(.)(.)(.)(.)\s+(.+?)\s*$/);
        if (!match || !/[ADUGCR ]/.test(match[1] ?? '') || !/[CU ]/.test(match[2] ?? '')) {
            continue;
        }
        const textStatus = match[1] ?? ' ';
        const propertyStatus = match[2] ?? ' ';
        const treeConflict = match[4] === 'C';
        if (textStatus === ' ' && propertyStatus === ' ' && !treeConflict) {
            continue;
        }
        const relativePath = normalizeRelativePath(match[5] ?? '', workingCopy);
        if (!relativePath || relativePath === '.') {
            continue;
        }
        const conflicted = textStatus === 'C' || propertyStatus === 'C' || treeConflict;
        byPath.set(relativePath, {
            path: relativePath,
            status: conflicted ? 'conflicted' : notificationStatus(textStatus),
            conflicted,
            treeConflict,
        });
    }
    return [...byPath.values()];
}
function parseSvnConflictInfo(xml) {
    const conflict = xml.match(/<conflict\b[^>]*type="text"[^>]*>([\s\S]*?)<\/conflict>/i)?.[1];
    if (!conflict) {
        return undefined;
    }
    const local = xmlValue(conflict, 'prev-wc-file');
    const incoming = xmlValue(conflict, 'cur-base-file');
    return local && incoming ? { local, incoming } : undefined;
}
async function loadSvnConflicts(workingCopy) {
    const { stdout } = await runSvn(['status', '--xml', workingCopy], workingCopy);
    const result = [];
    for (const entry of stdout.matchAll(/<entry\s+path="([^"]+)">([\s\S]*?)<\/entry>/gi)) {
        const body = entry[2] ?? '';
        const item = body.match(/<wc-status\b[^>]*item="([^"]+)"/i)?.[1];
        const treeConflict = /tree-conflicted="true"/i.test(body);
        if (item !== 'conflicted' && !treeConflict) {
            continue;
        }
        result.push({ path: normalizeRelativePath(decodeXml(entry[1] ?? ''), workingCopy), status: 'conflicted', conflicted: true, treeConflict });
    }
    return result;
}
function mergeFileLists(touched, conflicts) {
    const result = new Map(touched.map(file => [file.path.toLocaleLowerCase('ru'), file]));
    for (const conflict of conflicts) {
        const key = conflict.path.toLocaleLowerCase('ru');
        const current = result.get(key);
        result.set(key, current ? { ...current, status: 'conflicted', conflicted: true, treeConflict: conflict.treeConflict } : conflict);
    }
    return [...result.values()].sort((left, right) => Number(right.conflicted) - Number(left.conflicted) || left.path.localeCompare(right.path, 'ru'));
}
function notificationStatus(value) {
    return value === 'A' ? 'added' : value === 'D' ? 'deleted' : value === 'R' ? 'replaced' : value === 'U' || value === 'G' ? 'modified' : 'unknown';
}
function normalizeRelativePath(value, workingCopy) {
    const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
    const absolute = path.isAbsolute(cleaned) ? cleaned : path.resolve(workingCopy, cleaned);
    return path.relative(workingCopy, absolute).replace(/\\/g, '/');
}
function safeWorkingCopyPath(workingCopy, relativePath) {
    const root = path.resolve(workingCopy);
    const result = path.resolve(root, relativePath);
    if (result !== root && !result.startsWith(`${root}${path.sep}`)) {
        throw new Error('Файл находится вне рабочей копии пакетов.');
    }
    return result;
}
function resolveConflictArtifact(filePath, artifact) {
    return path.isAbsolute(artifact) ? artifact : path.resolve(path.dirname(filePath), artifact);
}
async function readText(filePath) {
    await (0, promises_1.access)(filePath);
    return iconv.decode(await (0, promises_1.readFile)(filePath), usesWindows1251(filePath) ? 'win1251' : 'utf8');
}
function usesWindows1251(filePath) { return ['.pkf', '.pas', '.bat'].includes(path.extname(filePath).toLocaleLowerCase('en-US')); }
function xmlValue(xml, tag) {
    const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1];
    return value ? decodeXml(value) : undefined;
}
function decodeXml(value) {
    return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
async function runSvn(args, cwd) {
    try {
        return await execFileAsync('svn', args, { cwd, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    }
    catch (error) {
        const detail = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : error instanceof Error ? error.message : String(error);
        throw new Error(`svn ${args[0]}: ${detail}`);
    }
}
//# sourceMappingURL=svnMergeService.js.map