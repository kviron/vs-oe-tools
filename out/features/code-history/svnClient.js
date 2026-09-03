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
exports.svnLog = svnLog;
exports.svnBlameRevisions = svnBlameRevisions;
exports.svnBlame = svnBlame;
exports.svnCat = svnCat;
exports.svnCatBase = svnCatBase;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const iconv = __importStar(require("iconv-lite"));
async function svnLog(fileName, limit) {
    const args = ['log', '--xml'];
    if (limit !== undefined) {
        args.push('--limit', String(limit));
    }
    args.push(fileName);
    const xml = (await runSvn(args, fileName)).toString('utf8');
    return [...xml.matchAll(/<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g)].map(match => ({
        revision: Number(match[1]),
        author: xmlValue(match[2], 'author') || 'неизвестен',
        date: new Date(xmlValue(match[2], 'date') || 0),
        message: xmlValue(match[2], 'msg'),
    }));
}
async function svnBlameRevisions(fileName, startLine, endLine) {
    const lines = await svnBlame(fileName);
    const revisions = new Set();
    for (const entry of lines) {
        if (entry.line >= startLine && entry.line <= endLine) {
            revisions.add(entry.revision);
        }
    }
    return revisions;
}
async function svnBlame(fileName) {
    const xml = (await runSvn(['blame', '--xml', fileName], fileName)).toString('utf8');
    return [...xml.matchAll(/<entry\s+line-number="(\d+)">([\s\S]*?)<\/entry>/g)].map(match => {
        const body = match[2];
        return {
            line: Number(match[1]),
            revision: Number(body.match(/<commit\s+revision="(\d+)">/)?.[1]),
            author: xmlValue(body, 'author') || 'неизвестен',
            date: new Date(xmlValue(body, 'date') || 0),
        };
    }).filter(entry => Number.isSafeInteger(entry.revision));
}
async function svnCat(fileName, revision) {
    if (revision < 0) {
        return '';
    }
    const bytes = await runSvn(['cat', '-r', String(revision), fileName], fileName);
    return legacyExtension(fileName) ? iconv.decode(bytes, 'win1251') : bytes.toString('utf8');
}
async function svnCatBase(fileName) {
    const bytes = await runSvn(['cat', '-r', 'BASE', fileName], fileName);
    return legacyExtension(fileName) ? iconv.decode(bytes, 'win1251') : bytes.toString('utf8');
}
async function runSvn(args, fileName) {
    return new Promise((resolve, reject) => {
        const process = (0, node_child_process_1.spawn)('svn', args, { cwd: path.dirname(fileName), windowsHide: true });
        const stdout = [];
        const stderr = [];
        process.stdout.on('data', (chunk) => stdout.push(chunk));
        process.stderr.on('data', (chunk) => stderr.push(chunk));
        process.on('error', reject);
        process.on('close', code => {
            if (code === 0) {
                resolve(Buffer.concat(stdout));
                return;
            }
            const detail = decodeConsole(Buffer.concat(stderr)).trim();
            reject(new Error(`svn ${args[0]} завершился с кодом ${code ?? 'неизвестен'}${detail ? `: ${detail}` : ''}`));
        });
    });
}
function xmlValue(xml, tag) {
    const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function legacyExtension(fileName) {
    return ['.pas', '.pkf', '.bat'].includes(path.extname(fileName).toLocaleLowerCase('en-US'));
}
function decodeConsole(value) {
    const utf8 = value.toString('utf8');
    return utf8.includes('\uFFFD') ? iconv.decode(value, 'win1251') : utf8;
}
//# sourceMappingURL=svnClient.js.map