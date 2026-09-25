<script setup lang="ts">
import { Search01Icon, Settings02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed } from 'vue';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import type { SearchMode, SearchOptions } from '@/lib/searchMatch';

defineProps<{ id?: string; placeholder?: string; ariaLabel?: string }>();
const query = defineModel<string>({ default: '' });
const options = defineModel<SearchOptions>('options', { required: true });
const modeLabels: Record<SearchMode, string> = {
  contains: 'Содержит', starts: 'Начинается с', ends: 'Заканчивается на', exact: 'Точное совпадение', word: 'Целое слово',
};
const settingsLabel = computed(() => `Настройки поиска: ${modeLabels[options.value.mode]}${options.value.caseSensitive ? ', учитывать регистр' : ''}`);
function setMode(mode: unknown): void { if (typeof mode === 'string' && mode in modeLabels) options.value = { ...options.value, mode: mode as SearchMode }; }
function setCaseSensitive(value: boolean): void { options.value = { ...options.value, caseSensitive: value }; }
</script>

<template>
  <InputGroup>
    <InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon>
    <InputGroupInput :id="id" v-model="query" type="search" :placeholder="placeholder" :aria-label="ariaLabel" />
    <InputGroupAddon align="inline-end">
      <DropdownMenu>
        <DropdownMenuTrigger as-child><InputGroupButton size="icon-xs" :variant="options.mode === 'contains' && !options.caseSensitive ? 'ghost' : 'secondary'" :aria-label="settingsLabel" :title="settingsLabel"><HugeiconsIcon :icon="Settings02Icon" /></InputGroupButton></DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Совпадение</DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="options.mode" @update:model-value="setMode">
              <DropdownMenuRadioItem v-for="(label, mode) in modeLabels" :key="mode" :value="mode">{{ label }}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup><DropdownMenuCheckboxItem :model-value="options.caseSensitive" @update:model-value="setCaseSensitive">Учитывать регистр</DropdownMenuCheckboxItem></DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </InputGroupAddon>
  </InputGroup>
</template>
