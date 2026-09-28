import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker&inline';
import { workHistoryCodeTokens } from './workHistoryCodeHighlight';

type Language = 've-pascal' | 've-pkf';
type ColorPair = { light: string; dark: string };
const colorPairs = new Map<string, ColorPair>();
let nextLanguage = 0;

Object.assign(self, { MonacoEnvironment: { getWorker: () => new EditorWorker() } });

class LineState implements monaco.languages.IState {
  constructor(readonly line: number) {}
  clone(): LineState { return new LineState(this.line); }
  equals(other: monaco.languages.IState): boolean { return other instanceof LineState && other.line === this.line; }
}

function colorAt(tokens: Array<{ content: string; color?: string }>, offset: number): string {
  let start = 0;
  for (const token of tokens) {
    start += token.content.length;
    if (offset < start) { return token.color ?? '#808080'; }
  }
  return '#808080';
}

function lineTokens(code: string, language: Language): monaco.languages.IToken[][] {
  const light = workHistoryCodeTokens(code, language, 'light-plus');
  const dark = workHistoryCodeTokens(code, language, 'dark-plus');
  return code.split('\n').map((line, index) => {
    const lightLine = light[index] ?? [];
    const darkLine = dark[index] ?? [];
    const boundaries = new Set([0]);
    for (const row of [lightLine, darkLine]) {
      let offset = 0;
      for (const token of row) { boundaries.add(offset); offset += token.content.length; }
    }
    return [...boundaries].filter(offset => offset < line.length || offset === 0).sort((a, b) => a - b)
      .map(startIndex => {
        const lightColor = colorAt(lightLine, startIndex);
        const darkColor = colorAt(darkLine, startIndex);
        const type = `work-history-${lightColor.slice(1)}-${darkColor.slice(1)}`;
        colorPairs.set(type, { light: lightColor, dark: darkColor });
        return { startIndex, scopes: type };
      });
  });
}

function defineThemes(): void {
  for (const [name, base, key] of [
    ['work-history-light', 'vs', 'light'],
    ['work-history-dark', 'vs-dark', 'dark'],
  ] as const) {
    monaco.editor.defineTheme(name, {
      base, inherit: true,
      rules: [...colorPairs].map(([token, pair]) => ({ token, foreground: pair[key].slice(1) })),
      colors: {},
    });
  }
}

function applyTheme(): void {
  monaco.editor.setTheme(document.body.classList.contains('vscode-dark')
    || document.body.classList.contains('vscode-high-contrast') ? 'work-history-dark' : 'work-history-light');
}

export function mountMonacoWorkHistorySnippet(element: HTMLElement, code: string, language: Language): () => void {
  const fallback = element.firstElementChild as HTMLElement | null;
  const mount = document.createElement('div');
  element.append(mount);
  const languageId = `work-history-${++nextLanguage}`;
  const tokens = lineTokens(code, language);
  monaco.languages.register({ id: languageId });
  const provider = monaco.languages.setTokensProvider(languageId, {
    getInitialState: () => new LineState(0),
    tokenize(_line, state) {
      const current = state as LineState;
      return { tokens: tokens[current.line] ?? [{ startIndex: 0, scopes: '' }], endState: new LineState(current.line + 1) };
    },
  });
  defineThemes();
  applyTheme();
  const model = monaco.editor.createModel(code, languageId);
  const lineHeight = 19;
  const height = Math.min(Math.max(code.split('\n').length * lineHeight + 16, 58), 520);
  mount.style.height = `${height}px`;
  const editor = monaco.editor.create(mount, {
    model, readOnly: true, domReadOnly: true, automaticLayout: true,
    minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'off',
    lineNumbers: 'on', glyphMargin: false, folding: false,
    overviewRulerLanes: 0, renderLineHighlight: 'none',
    lineHeight, fontSize: 12, contextmenu: true,
  });
  if (fallback) { fallback.hidden = true; }
  const observer = new MutationObserver(applyTheme);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => { observer.disconnect(); editor.dispose(); model.dispose(); provider.dispose(); mount.remove(); if (fallback) { fallback.hidden = false; } };
}
