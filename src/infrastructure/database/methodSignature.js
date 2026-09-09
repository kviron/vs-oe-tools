"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMethodSignature = extractMethodSignature;
exports.resolveMethodSignature = resolveMethodSignature;
const declarationStart = /^(?:proc(?:edure)?|func(?:tion)?)\b/i;
const bodySectionStart = /^(?:var|const|type|begin|function|procedure|proc|func)\b/i;
/** Reads the anonymous declaration stored at the start of Methods.Code. */
function extractMethodSignature(code) {
    const source = code.replace(/^\uFEFF/, '').trimStart();
    const declaration = declarationStart.exec(source);
    if (!declaration) {
        return undefined;
    }
    const lines = source.slice(declaration[0].length).split(/\r?\n/);
    const signatureLines = [];
    let parenthesisDepth = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (signatureLines.length > 0 && parenthesisDepth === 0 && bodySectionStart.test(trimmed)) {
            break;
        }
        signatureLines.push(trimmed);
        parenthesisDepth += count(line, '(') - count(line, ')');
        if (parenthesisDepth === 0 && /;\s*$/.test(trimmed)) {
            break;
        }
    }
    const signature = signatureLines.filter(Boolean).join(' ').replace(/;\s*$/, '').trim();
    return signature || '()';
}
/** Keeps the native client's canonical signature while the declaration is unchanged. */
function resolveMethodSignature(oldCode, newCode, storedSignature) {
    const oldDeclaration = extractMethodSignature(oldCode);
    const newDeclaration = extractMethodSignature(newCode);
    if (!newDeclaration || normalize(newDeclaration) === normalize(oldDeclaration)) {
        return storedSignature;
    }
    return newDeclaration;
}
function normalize(value) {
    return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}
function count(value, character) {
    return [...value].filter(item => item === character).length;
}
//# sourceMappingURL=methodSignature.js.map