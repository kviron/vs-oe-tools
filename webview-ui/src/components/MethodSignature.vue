<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ signature: string }>();
const parts = computed(() => {
  const result: Array<{ text: string; kind: 'plain' | 'parameter' | 'type' }> = [];
  const pattern = /([\p{L}_][\p{L}\p{N}_]*)(\s*:\s*)([\p{L}_][\p{L}\p{N}_.]*)/gu;
  let position = 0;
  for (const match of props.signature.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > position) result.push({ text: props.signature.slice(position, index), kind: 'plain' });
    result.push({ text: match[1], kind: 'parameter' }, { text: match[2], kind: 'plain' }, { text: match[3], kind: 'type' });
    position = index + match[0].length;
  }
  if (position < props.signature.length) result.push({ text: props.signature.slice(position), kind: 'plain' });
  return result;
});
</script>

<template>
  <span><span v-for="(part, index) in parts" :key="index" :class="{ 'signature-parameter font-medium': part.kind === 'parameter', 'signature-type font-medium': part.kind === 'type' }">{{ part.text }}</span></span>
</template>

<style scoped>
.signature-parameter { color: var(--kind-attribute); }
.signature-type { color: var(--kind-class); }
</style>
