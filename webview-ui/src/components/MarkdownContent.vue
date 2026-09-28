<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import { highlightWorkHistoryCode, workHistoryCodeLanguage } from './workHistoryCodeHighlight';

const props = defineProps<{ source: string }>();
const emit = defineEmits<{ openObject: [id: number] }>();
const root = ref<HTMLElement>();
const mountedEditors: Array<() => void> = [];
let renderRevision = 0;
interface Snippet { code: string; language: 've-pascal' | 've-pkf' }
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, highlight(code, language) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
  return hljs.highlightAuto(code).value;
} });
const originalFence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
  const info = tokens[index].info.trim();
  const language = info.split(/\s+/u)[0] ?? '';
  const highlighted = highlightWorkHistoryCode(tokens[index].content, language);
  if (highlighted) {
    const snippets = (env as { snippets: Snippet[] }).snippets;
    const snippetIndex = snippets.push({ code: tokens[index].content, language: workHistoryCodeLanguage(tokens[index].content, language)! }) - 1;
    const methodId = /\bmethod(?:id)?=(\d+)\b/iu.exec(info)?.[1];
    const header = methodId && Number.isSafeInteger(Number(methodId))
      ? `<a href="#" class="object-id-link" data-object-id="${methodId}" title="Открыть метод ID=${methodId}">Метод ID ${methodId}</a>`
      : '<span>Код метода · ID не указан</span>';
    return `<div class="method-code-block"><div class="method-code-header">${header}</div><div data-snippet-index="${snippetIndex}">${highlighted}</div></div>`;
  }
  return originalFence?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
};
const originalLinkOpen = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return originalLinkOpen?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
};
markdown.core.ruler.after('inline', 'object_ids', state => {
  const makeToken = (type: string, content: string) => {
    const token = new state.Token(type, '', 0);
    token.content = content;
    return token;
  };
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) { continue; }
    const result: typeof block.children = [];
    let inLink = false;
    for (const token of block.children) {
      if (token.type === 'link_open') { inLink = true; }
      if (token.type !== 'text' || inLink) { result.push(token); }
      else {
        let offset = 0;
        for (const match of token.content.matchAll(/\b[1-9]\d{4,}\b/gu)) {
          const id = Number(match[0]);
          if (!Number.isSafeInteger(id)) { continue; }
          if (match.index > offset) { result.push(makeToken('text', token.content.slice(offset, match.index))); }
          result.push(makeToken('html_inline', `<a href="#" class="object-id-link" data-object-id="${id}" title="Открыть объект ID=${id}">${id}</a>`));
          offset = match.index + match[0].length;
        }
        if (offset < token.content.length) { result.push(makeToken('text', token.content.slice(offset))); }
      }
      if (token.type === 'link_close') { inLink = false; }
    }
    block.children = result;
  }
});
function openObject(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) { return; }
  const link = target.closest<HTMLAnchorElement>('[data-object-id]');
  if (!link) { return; }
  event.preventDefault();
  const id = Number(link.dataset.objectId);
  if (Number.isSafeInteger(id) && id > 0) { emit('openObject', id); }
}
const rendered = computed(() => {
  const snippets: Snippet[] = [];
  return { html: markdown.render(props.source, { snippets }), snippets };
});
async function mountSnippets(value: { html: string; snippets: Snippet[] }): Promise<void> {
  const revision = ++renderRevision;
  mountedEditors.splice(0).forEach(dispose => dispose());
  if (!value.snippets.length) { return; }
  await nextTick();
  let mountMonacoWorkHistorySnippet: typeof import('./monacoWorkHistorySnippet').mountMonacoWorkHistorySnippet;
  try { ({ mountMonacoWorkHistorySnippet } = await import('./monacoWorkHistorySnippet')); }
  catch (error) { console.error('Не удалось загрузить Monaco:', error); return; }
  if (revision !== renderRevision) { return; }
  for (const [index, snippet] of value.snippets.entries()) {
    const element = root.value?.querySelector<HTMLElement>(`[data-snippet-index="${index}"]`);
    if (!element) { continue; }
    try { mountedEditors.push(mountMonacoWorkHistorySnippet(element, snippet.code, snippet.language)); }
    catch (error) { console.error('Не удалось открыть фрагмент кода в Monaco:', error); }
  }
}
onMounted(() => { void mountSnippets(rendered.value); });
watch(rendered, value => { void mountSnippets(value); }, { flush: 'post' });
onUnmounted(() => { renderRevision++; mountedEditors.splice(0).forEach(dispose => dispose()); });
</script>

<template>
  <div ref="root" class="markdown-content min-w-0 break-words text-sm leading-relaxed" v-html="rendered.html" @click="openObject" />
</template>

<style scoped>
.markdown-content :deep(> * + *) { margin-top: .65rem; }
.markdown-content :deep(h1), .markdown-content :deep(h2), .markdown-content :deep(h3) { font-weight: 600; line-height: 1.3; }
.markdown-content :deep(h1) { font-size: 1.35em; }
.markdown-content :deep(h2) { font-size: 1.2em; }
.markdown-content :deep(ul), .markdown-content :deep(ol) { padding-left: 1.4rem; }
.markdown-content :deep(ul) { list-style: disc; }
.markdown-content :deep(ol) { list-style: decimal; }
.markdown-content :deep(li + li) { margin-top: .2rem; }
.markdown-content :deep(blockquote) { border-left: 3px solid var(--border); padding-left: .8rem; color: var(--muted-foreground); }
.markdown-content :deep(a) { color: var(--vscode-textLink-foreground, var(--primary)); text-decoration: underline; }
.markdown-content :deep(a:hover) { color: var(--vscode-textLink-activeForeground, var(--primary)); }
.markdown-content :deep(:not(pre) > code) { border-radius: .25rem; background: var(--muted); padding: .1rem .3rem; font-family: var(--vscode-editor-font-family, monospace); }
.markdown-content :deep(pre) { overflow-x: auto; border: 1px solid var(--border); border-radius: .5rem; background: var(--muted); padding: .8rem; font-family: var(--vscode-editor-font-family, monospace); font-size: .85em; line-height: 1.5; }
.markdown-content :deep(pre code) { background: none; white-space: pre; }
.markdown-content :deep(.hljs-keyword), .markdown-content :deep(.hljs-selector-tag) { color: var(--vscode-symbolIcon-keywordForeground, var(--primary)); }
.markdown-content :deep(.hljs-string), .markdown-content :deep(.hljs-attr) { color: var(--vscode-symbolIcon-stringForeground, var(--foreground)); }
.markdown-content :deep(.hljs-number), .markdown-content :deep(.hljs-literal) { color: var(--vscode-symbolIcon-numberForeground, var(--primary)); }
.markdown-content :deep(.hljs-comment), .markdown-content :deep(.hljs-quote) { color: var(--muted-foreground); font-style: italic; }
.markdown-content :deep(.hljs-title), .markdown-content :deep(.hljs-function) { color: var(--vscode-symbolIcon-functionForeground, var(--primary)); }
.markdown-content :deep(.method-code-block) { overflow: hidden; border: 1px solid var(--border); border-radius: .5rem; }
.markdown-content :deep(.method-code-header) { border-bottom: 1px solid var(--border); background: var(--muted); padding: .4rem .8rem; font-size: .8em; color: var(--muted-foreground); }
.markdown-content :deep(.method-code-header a) { color: var(--vscode-textLink-foreground, var(--primary)); }
.markdown-content :deep(.method-code-block pre) { margin: 0; border: 0; border-radius: 0; }
.markdown-content :deep(.shiki), .markdown-content :deep(.shiki span) { color: var(--shiki-light); }
:global(body.vscode-dark .markdown-content .shiki), :global(body.vscode-dark .markdown-content .shiki span), :global(body.vscode-high-contrast .markdown-content .shiki), :global(body.vscode-high-contrast .markdown-content .shiki span) { color: var(--shiki-dark); }
.markdown-content :deep(table) { display: block; overflow-x: auto; border-collapse: collapse; }
.markdown-content :deep(th), .markdown-content :deep(td) { border: 1px solid var(--border); padding: .35rem .6rem; text-align: left; }
</style>
