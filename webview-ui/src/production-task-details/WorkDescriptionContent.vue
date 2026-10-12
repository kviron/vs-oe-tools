<script setup lang="ts">
import { computed } from 'vue';
import { parsePlainWorkDescription } from '../../../src/features/production-tasks/plainWorkDescription';
import { splitWorkDescriptionObjectIds, type WorkDescriptionPart } from '../../../src/features/production-tasks/workDescriptionLinks';
import type { ProductionTaskDescriptionPart } from '../../../src/features/production-tasks/models';

type RenderPart =
  | (WorkDescriptionPart & { renderKind: 'text'; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string })
  | ({ renderKind: 'image' } & Omit<Extract<ProductionTaskDescriptionPart, { kind: 'image' }>, 'kind'>);
const props = defineProps<{ source: string; richParts?: ProductionTaskDescriptionPart[] }>();
defineSlots<{ default(props: { part: RenderPart; index: number }): unknown }>();
const rich = computed<RenderPart[]>(() => (props.richParts?.length ? props.richParts : [{ kind: 'text' as const, text: props.source }]).flatMap<RenderPart>(part => {
  if (part.kind === 'image') { return [{ ...part, renderKind: 'image' as const }]; }
  const { bold, italic, underline, strike, color } = part;
  return splitWorkDescriptionObjectIds(part.text).map(textPart => ({ ...textPart, renderKind: 'text' as const, bold, italic, underline, strike, color }));
}));
const blocks = computed(() => {
  let index = 0;
  return parsePlainWorkDescription(props.source).map(block => ({
    ...block,
    items: block.items.map(item => ({ ...item, parts: splitWorkDescriptionObjectIds(item.text).map(part => ({
      part: { ...part, renderKind: 'text' as const }, index: index++,
    })) })),
  }));
});
</script>

<template>
  <div v-if="richParts !== undefined" class="whitespace-pre-wrap"><template v-for="(part, index) in rich" :key="index"><slot :part="part" :index="index" /></template></div>
  <div v-else class="flex min-w-0 flex-col gap-4 break-words text-sm leading-relaxed">
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <p v-if="block.kind === 'paragraph'" class="whitespace-pre-wrap"><template v-for="entry in block.items[0].parts" :key="entry.index"><slot :part="entry.part" :index="entry.index" /></template></p>
      <component :is="block.kind === 'ordered-list' ? 'ol' : 'ul'" v-else :start="block.kind === 'ordered-list' ? block.items[0].number : undefined" :class="block.kind === 'ordered-list' ? 'list-decimal pl-6' : 'list-disc pl-6'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex" :value="item.number" class="whitespace-pre-wrap py-1"><template v-for="entry in item.parts" :key="entry.index"><slot :part="entry.part" :index="entry.index" /></template></li>
      </component>
    </template>
  </div>
</template>
