import pascal from '@shikijs/langs/pascal';
import sql from '@shikijs/langs/sql';
import darkPlus from '@shikijs/themes/dark-plus';
import lightPlus from '@shikijs/themes/light-plus';
import { createHighlighterCoreSync, type LanguageRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import pascalGrammar from '../../../syntaxes/pascal.tmLanguage.json';
import pkfGrammar from '../../../syntaxes/pkf.tmLanguage.json';

const highlighter = createHighlighterCoreSync({
  themes: [lightPlus, darkPlus],
  langs: [pascal, sql,
    { ...pascalGrammar, name: 've-pascal' } as unknown as LanguageRegistration,
    { ...pkfGrammar, name: 've-pkf' } as unknown as LanguageRegistration,
  ],
  engine: createJavaScriptRegexEngine(),
});

export function highlightWorkHistoryCode(code: string, language: string): string | undefined {
  const lang = workHistoryCodeLanguage(code, language);
  if (!lang) { return undefined; }
  return highlighter.codeToHtml(code, {
    lang,
    themes: { light: 'light-plus', dark: 'dark-plus' },
    defaultColor: false,
  });
}

export function workHistoryCodeLanguage(code: string, language: string): 've-pascal' | 've-pkf' | undefined {
  const normalized = language.trim().toLowerCase();
  return ['pascal', 'delphi', 'pas', 've-pascal'].includes(normalized) ? 've-pascal'
    : ['pkf', 've-pkf'].includes(normalized) ? 've-pkf'
      : !normalized && /^\s*proc\s*\(/imu.test(code) ? 've-pkf'
        : !normalized && looksLikePascal(code) ? 've-pascal' : undefined;
}

export function workHistoryCodeTokens(code: string, language: 've-pascal' | 've-pkf', theme: 'light-plus' | 'dark-plus') {
  return highlighter.codeToTokens(code, { lang: language, theme }).tokens;
}

function looksLikePascal(code: string): boolean {
  return /\b(?:begin|end|procedure|function|constructor|destructor|proc|var)\b/iu.test(code)
    && /(?:;|:=)/u.test(code);
}
