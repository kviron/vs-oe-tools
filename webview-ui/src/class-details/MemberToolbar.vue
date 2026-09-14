<script setup lang="ts">
import { Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import DatePicker from '@/components/DatePicker.vue';

defineProps<{ title: string; description: string; count: number; loading: boolean; inherited: boolean; advanced?: boolean }>();
const emit = defineEmits<{ inheritedChange: [value: boolean | 'indeterminate'] }>();
const search = defineModel<string>('search', { default: '' });
const creator = defineModel<string>('creator', { default: '' });
const dateFrom = defineModel<string>('dateFrom', { default: '' });
const dateTo = defineModel<string>('dateTo', { default: '' });
</script>

<template>
  <Card size="sm" class="shrink-0">
    <CardHeader class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1"><CardTitle>{{ title }} <Badge variant="secondary">{{ loading ? '…' : count }}</Badge></CardTitle><CardDescription>{{ description }}</CardDescription></div>
      <slot />
    </CardHeader>
    <CardContent>
      <FieldGroup class="flex flex-row flex-wrap items-end gap-3">
        <Field class="min-w-44 flex-1 gap-1.5"><FieldLabel :for="`${title}-search`">Поиск</FieldLabel><InputGroup><InputGroupInput :id="`${title}-search`" v-model="search" placeholder="Имя, владелец или ID…" type="search" /><InputGroupAddon><HugeiconsIcon :icon="Search01Icon" /></InputGroupAddon></InputGroup></Field>
        <template v-if="advanced">
          <Field class="w-36 gap-1.5"><FieldLabel :for="`${title}-creator`">Создатель</FieldLabel><Input :id="`${title}-creator`" v-model="creator" placeholder="Все авторы" type="search" /></Field>
          <Field class="w-auto gap-1.5"><FieldLabel>Обновлено с</FieldLabel><DatePicker v-model="dateFrom" :label="`${title}: обновлено с`" /></Field>
          <Field class="w-auto gap-1.5"><FieldLabel>По</FieldLabel><DatePicker v-model="dateTo" :label="`${title}: обновлено по`" /></Field>
        </template>
        <Field orientation="horizontal" class="h-8 w-auto" :data-disabled="loading || undefined"><Checkbox :id="`${title}-inherited`" :model-value="inherited" :disabled="loading" @update:model-value="emit('inheritedChange', $event)" /><FieldLabel :for="`${title}-inherited`">Включая наследуемые</FieldLabel></Field>
      </FieldGroup>
    </CardContent>
  </Card>
</template>
