<script setup lang="ts">
import type { DateValue } from '@internationalized/date';
import { Calendar03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { parseDate } from '@internationalized/date';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

const props = defineProps<{
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
}>();
const model = defineModel<string>({ default: '' });

type DateTimeParts = { year: number; month: number; day: number; time: string };

const parts = computed(() => parseDateTime(model.value));
const calendarDate = computed<DateValue | undefined>(() => {
  const value = parts.value;
  if (!value) return undefined;
  try { return parseDate(`${value.year}-${pad(value.month)}-${pad(value.day)}`); }
  catch { return undefined; }
});
const time = computed(() => parts.value?.time ?? '00:00:00');

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateTime(value: string): DateTimeParts | undefined {
  const trimmed = value.trim();
  const local = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/u);
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/u);
  const match = local ?? iso;
  if (!match) return undefined;
  const year = Number(match[local ? 3 : 1]);
  const month = Number(match[2]);
  const day = Number(match[local ? 1 : 3]);
  const hours = match[4] ?? '00';
  const minutes = match[5] ?? '00';
  const seconds = match[6] ?? '00';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return undefined;
  return { year, month, day, time: `${hours}:${minutes}:${seconds}` };
}

function serialize(value: DateTimeParts): string {
  return `${pad(value.day)}.${pad(value.month)}.${value.year} ${value.time}`;
}

function selectDate(value: DateValue | undefined): void {
  if (!value) return;
  model.value = serialize({ year: value.year, month: value.month, day: value.day, time: time.value });
}

function selectTime(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  const date = calendarDate.value;
  if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u.test(value)) return;
  model.value = serialize({ year: date.year, month: date.month, day: date.day, time: value.length === 5 ? `${value}:00` : value });
}

function setNow(): void {
  const now = new Date();
  model.value = serialize({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  });
}
</script>

<template>
  <Popover>
    <InputGroup :data-disabled="disabled">
      <InputGroupInput
        :id="id"
        v-model="model"
        :disabled="disabled"
        :aria-invalid="invalid"
        placeholder="дд.мм.гггг чч:мм:сс"
        autocomplete="off"
        inputmode="numeric"
      />
      <PopoverTrigger as-child>
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          :disabled="disabled"
          :aria-label="label ?? 'Выбрать дату и время'"
        >
          <HugeiconsIcon :icon="Calendar03Icon" />
        </InputGroupButton>
      </PopoverTrigger>
    </InputGroup>
    <PopoverContent class="w-auto gap-0 overflow-hidden p-0" align="end">
      <Calendar
        :model-value="calendarDate"
        :default-placeholder="calendarDate"
        locale="ru-RU"
        @update:model-value="selectDate"
      />
      <Separator />
      <div class="flex items-center justify-between gap-2 p-2">
        <Input
          class="w-28 font-mono"
          type="text"
          inputmode="numeric"
          placeholder="чч:мм:сс"
          :model-value="time"
          :disabled="!calendarDate"
          aria-label="Время в 24-часовом формате"
          @change="selectTime"
        />
        <Button variant="outline" size="sm" @click="setNow">Сейчас</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
