<script setup lang="ts">
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  FireIcon,
  Flag01Icon,
  Loading03Icon,
  MinusSignIcon,
  PauseIcon,
  SparklesIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';

const props = defineProps<{
  kind: 'status' | 'priority';
  value?: string;
}>();

const normalizedValue = computed(() => (props.value || '').trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е'));
const presentation = computed(() => props.kind === 'status'
  ? statusPresentation(normalizedValue.value)
  : priorityPresentation(normalizedValue.value));

function includesAny(value: string, fragments: readonly string[]): boolean {
  return fragments.some(fragment => value.includes(fragment));
}

function statusPresentation(value: string) {
  if (includesAny(value, ['отмен', 'отклон', 'заблок', 'ошиб'])) return { variant: 'statusBlocked' as const, icon: Alert02Icon };
  if (includesAny(value, ['выполн', 'закры', 'заверш', 'решен'])) return { variant: 'statusDone' as const, icon: CheckmarkCircle02Icon };
  if (includesAny(value, ['провер', 'тест', 'согласован', 'прием'])) return { variant: 'statusReview' as const, icon: ViewIcon };
  if (includesAny(value, ['ожидан', 'отлож', 'приост'])) return { variant: 'statusPaused' as const, icon: PauseIcon };
  if (includesAny(value, ['в работе', 'работа', 'исполн'])) return { variant: 'statusWork' as const, icon: Loading03Icon };
  if (includesAny(value, ['нов', 'создан'])) return { variant: 'statusNew' as const, icon: SparklesIcon };
  return { variant: 'taskNeutral' as const, icon: CircleIcon };
}

function priorityPresentation(value: string) {
  if (includesAny(value, ['крит', 'немедл', 'блок'])) return { variant: 'priorityCritical' as const, icon: FireIcon };
  if (includesAny(value, ['высок', 'важн'])) return { variant: 'priorityHigh' as const, icon: ArrowUp01Icon };
  if (includesAny(value, ['обыч', 'сред', 'нормал'])) return { variant: 'priorityNormal' as const, icon: MinusSignIcon };
  if (includesAny(value, ['низк'])) return { variant: 'priorityLow' as const, icon: ArrowDown01Icon };
  return { variant: 'taskNeutral' as const, icon: Flag01Icon };
}
</script>

<template>
  <Badge :variant="presentation.variant">
    <HugeiconsIcon :icon="presentation.icon" aria-hidden="true" />
    {{ value || (kind === 'status' ? 'Без статуса' : 'Без приоритета') }}
  </Badge>
</template>
