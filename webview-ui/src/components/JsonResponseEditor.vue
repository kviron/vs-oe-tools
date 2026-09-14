<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { json } from '@codemirror/lang-json';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ modelValue?: string; ariaLabel?: string; class?: HTMLAttributes['class'] }>(), {
  modelValue: '', ariaLabel: 'Ответ HTTP API', class: undefined,
});
const emit = defineEmits<{ openObject: [id: number] }>();
const host = ref<HTMLElement>();
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? '';
const objectIdPattern = /\b[1-9]\d{6,}\b/gu;
let view: EditorView | undefined;

function objectIdDecorations(editor: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = editor.state.doc.toString();
  for (const match of text.matchAll(objectIdPattern)) {
    const from = match.index;
    builder.add(from, from + match[0].length, Decoration.mark({
      class: 'cm-object-id-link',
      attributes: { 'data-object-id': match[0], title: `Открыть объект ID ${match[0]}` },
    }));
  }
  return builder.finish();
}

const objectIdLinks = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(editor: EditorView) { this.decorations = objectIdDecorations(editor); }
  update(update: ViewUpdate) { if (update.docChanged) { this.decorations = objectIdDecorations(update.view); } }
}, { decorations: plugin => plugin.decorations });

watch(() => props.modelValue, value => {
  if (!view || view.state.doc.toString() === value) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
});

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    parent: host.value,
    doc: props.modelValue,
    extensions: [
      basicSetup,
      json(),
      EditorView.cspNonce.of(nonce),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
      objectIdLinks,
      EditorView.domEventHandlers({
        click(event) {
          const target = (event.target as HTMLElement).closest<HTMLElement>('[data-object-id]');
          if (!target) return false;
          const id = Number(target.dataset.objectId);
          if (Number.isSafeInteger(id) && id > 0) { emit('openObject', id); }
          return true;
        },
      }),
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vscode-editor-font-family)', fontSize: 'var(--vscode-editor-font-size)' },
        '.cm-gutters': { backgroundColor: 'var(--vscode-editorGutter-background, var(--background))', color: 'var(--vscode-editorLineNumber-foreground)', border: 'none' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
        '.cm-object-id-link': { color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', textDecoration: 'underline' },
        '.cm-object-id-link:hover': { color: 'var(--vscode-textLink-activeForeground)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--vscode-editor-selectionBackground) !important' },
      }),
    ],
  });
});

onBeforeUnmount(() => view?.destroy());
</script>

<template><div ref="host" :class="cn('h-64 overflow-hidden rounded-md border bg-background', props.class)" /></template>

<style scoped>
:global(.cm-editor) { height: 100%; }
</style>
