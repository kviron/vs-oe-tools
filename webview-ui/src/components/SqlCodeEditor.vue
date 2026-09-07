<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { SqlCompletionSchema } from '../../../src/infrastructure/database/sqlCompletionSchema';
import { basicSetup, EditorView } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { Compartment, EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cn } from '@/lib/utils';

const props = withDefaults(defineProps<{
	modelValue?: string;
	readOnly?: boolean;
	lineWrapping?: boolean;
	saveShortcut?: boolean;
	executeShortcut?: boolean;
	ariaLabel?: string;
	completion?: SqlCompletionSchema;
	class?: HTMLAttributes['class'];
}>(), {
	modelValue: '', readOnly: false, lineWrapping: false, saveShortcut: false,
	executeShortcut: false, ariaLabel: 'SQL-редактор', class: undefined,
});

const emit = defineEmits<{
	'update:modelValue': [value: string];
	'save': [];
	'execute': [];
}>();

const host = ref<HTMLElement>();
const readOnlyCompartment = new Compartment();
const languageCompartment = new Compartment();
const cspNonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content ?? '';
let view: EditorView | undefined;

const sqlHighlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: 'var(--sql-token-keyword)', fontWeight: '700' },
	{ tag: tags.standard(tags.name), color: 'var(--sql-token-function)', fontWeight: '600' },
	{ tag: tags.special(tags.name), color: 'var(--sql-token-special)' },
	{ tag: [tags.name, tags.variableName, tags.propertyName], color: 'var(--sql-token-identifier)' },
	{ tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-token-string)' },
	{ tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-token-number)' },
	{ tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--sql-token-comment)', fontStyle: 'italic' },
	{ tag: [tags.typeName, tags.className], color: 'var(--sql-token-type)' },
	{ tag: [tags.operator, tags.punctuation, tags.paren, tags.brace, tags.squareBracket], color: 'var(--sql-token-operator)' },
]);

watch(() => props.modelValue, value => {
	if (!view || view.state.doc.toString() === value) return;
	view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
});

watch(() => props.readOnly, value => {
	view?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(value)) });
});

watch(() => props.completion, value => {
	view?.dispatch({ effects: languageCompartment.reconfigure(sqlLanguage(value)) });
});

onMounted(() => {
	if (!host.value) return;
	const shortcuts = [indentWithTab];
	if (props.saveShortcut) shortcuts.push({ key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true; } });
	if (props.executeShortcut) shortcuts.push({ key: 'Mod-Enter', preventDefault: true, run: () => { emit('execute'); return true; } });
	view = new EditorView({
		parent: host.value,
		doc: props.modelValue,
		extensions: [
			basicSetup,
			EditorView.cspNonce.of(cspNonce),
			EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
			languageCompartment.of(sqlLanguage(props.completion)),
			syntaxHighlighting(sqlHighlightStyle),
			keymap.of(shortcuts),
			readOnlyCompartment.of(EditorState.readOnly.of(props.readOnly)),
			...(props.lineWrapping ? [EditorView.lineWrapping] : []),
			EditorView.updateListener.of(update => {
				if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
			}),
			EditorView.theme({
				'&': { height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
				'.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vscode-editor-font-family)', fontSize: 'var(--vscode-editor-font-size)' },
				'.cm-content': { caretColor: 'var(--vscode-editorCursor-foreground)', padding: '0.5rem 0' },
				'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
				'.cm-gutters': { backgroundColor: 'var(--vscode-editorGutter-background, var(--background))', color: 'var(--vscode-editorLineNumber-foreground)', border: 'none' },
				'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--vscode-editor-lineHighlightBackground)' },
				'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--vscode-editor-selectionBackground) !important' },
				'.cm-matchingBracket': { backgroundColor: 'var(--vscode-editorBracketMatch-background)', outline: '1px solid var(--vscode-editorBracketMatch-border)' },
				'.cm-tooltip': { backgroundColor: 'var(--vscode-editorSuggestWidget-background)', color: 'var(--vscode-editorSuggestWidget-foreground)', borderColor: 'var(--vscode-editorSuggestWidget-border)' },
			}),
		],
	});
});

onBeforeUnmount(() => view?.destroy());

function focus(): void { view?.focus(); }
defineExpose({ focus });

function sqlLanguage(completion: SqlCompletionSchema | undefined) {
	return sql({
		dialect: PostgreSQL,
		upperCaseKeywords: true,
		schema: completion?.schema,
		defaultSchema: completion?.defaultSchema,
	});
}
</script>

<template>
	<div ref="host" :class="cn('sql-code-editor overflow-hidden bg-background', props.class)" />
</template>

<style scoped>
:global(:root) {
	--sql-token-keyword: #000080;
	--sql-token-function: #00627a;
	--sql-token-special: #660e7a;
	--sql-token-identifier: var(--vscode-editor-foreground, #000000);
	--sql-token-string: #008000;
	--sql-token-number: #0000ff;
	--sql-token-comment: #808080;
	--sql-token-type: #000080;
	--sql-token-operator: var(--vscode-editor-foreground, #333333);
}

:global(.dark),
:global(.vscode-dark),
:global(.vscode-high-contrast) {
	--sql-token-keyword: #cc7832;
	--sql-token-function: #ffc66d;
	--sql-token-special: #9876aa;
	--sql-token-identifier: #a9b7c6;
	--sql-token-string: #6a8759;
	--sql-token-number: #6897bb;
	--sql-token-comment: #808080;
	--sql-token-type: #a9b7c6;
	--sql-token-operator: #a9b7c6;
}

.sql-code-editor :deep(.cm-editor) { height: 100%; }
</style>
