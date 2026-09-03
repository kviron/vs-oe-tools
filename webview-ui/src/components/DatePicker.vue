<script setup lang="ts">
import type { DateValue } from '@internationalized/date';
import { Calendar03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { parseDate } from '@internationalized/date';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

defineProps<{ label: string; title?: string }>();
const model = defineModel<string>({ default: '' });

const date = computed<DateValue | undefined>(() => {
  if (!model.value) return undefined;
  try {
    return parseDate(model.value);
  } catch {
    return undefined;
  }
});

const displayValue = computed(() => date.value
  ? new Intl.DateTimeFormat('ru-RU').format(new Date(date.value.year, date.value.month - 1, date.value.day))
  : 'дд.мм.гггг');

function selectDate(value: DateValue | undefined, close: () => void): void {
  if (!value) return;
  model.value = value.toString();
  close();
}

function clearDate(): void {
  model.value = '';
}
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :class="cn('h-6 w-32 justify-between px-2 font-normal', !date && 'text-muted-foreground')"
        :aria-label="label"
        :title="title"
        @keydown.delete.prevent="clearDate"
        @keydown.backspace.prevent="clearDate"
      >
        <span class="truncate">{{ displayValue }}</span>
        <HugeiconsIcon :icon="Calendar03Icon" data-icon="inline-end" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto gap-0 overflow-hidden p-0" align="start">
      <Calendar
        :model-value="date"
        :default-placeholder="date"
        locale="ru-RU"
        layout="month-and-year"
        @update:model-value="selectDate($event, close)"
      />
      <div v-if="date" class="border-t p-1">
        <Button variant="ghost" size="sm" class="w-full" @click="clearDate(); close()">Очистить</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
