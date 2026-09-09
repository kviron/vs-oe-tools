<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { basicSetup, EditorView } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{ modelValue?: string; readOnly?: boolean; ariaLabel?: string; class?: HTMLAttributes['class'] }>(), {
  modelValue: '', readOnly: false, ariaLabel: 'Редактор версии', class: undefined,
});
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'save': [] }>();
const host = ref<HTMLElement>();
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? '';
let view: EditorView | undefined;

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
      EditorView.cspNonce.of(nonce),
      EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
      EditorState.readOnly.of(props.readOnly),
      keymap.of([indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true; } }]),
      EditorView.updateListener.of(update => { if (update.docChanged) emit('update:modelValue', update.state.doc.toString()); }),
      EditorView.theme({
        '&': { height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vscode-editor-font-family)', fontSize: 'var(--vscode-editor-font-size)' },
        '.cm-gutters': { backgroundColor: 'var(--vscode-editorGutter-background, var(--background))', color: 'var(--vscode-editorLineNumber-foreground)', border: 'none' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--vscode-editor-lineHighlightBackground)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--vscode-editor-selectionBackground) !important' },
      }),
    ],
  });
});

onBeforeUnmount(() => view?.destroy());
</script>

<template><div ref="host" :class="cn('overflow-hidden bg-background', props.class)" /></template>

<style scoped>
:global(.cm-editor) { height: 100%; }
</style>
