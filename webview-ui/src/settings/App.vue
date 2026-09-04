<script setup lang="ts">
import type { SettingsHostMessage, SettingsState } from '../../../src/core/webviewProtocol';
import { Copy01Icon, Database01Icon, PlugSocketIcon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';

const state = ref<SettingsState>();
const userIdInput = ref('0');
const testingConnection = ref(false);
const connectionResult = ref<{ success: boolean; message: string }>();

const statusVariant = computed(() => state.value?.mcpStatus === 'unavailable' ? 'destructive' : state.value?.mcpStatus === 'ready' ? 'default' : 'secondary');

window.addEventListener('message', (event: MessageEvent<SettingsHostMessage>) => {
	const message = event.data;
	if (message.command === 'settingsState') {
		state.value = message.state;
		userIdInput.value = String(message.state.userId);
	} else if (message.command === 'databaseConnectionTestStarted') {
		testingConnection.value = true;
		connectionResult.value = undefined;
	} else {
		testingConnection.value = false;
		connectionResult.value = { success: message.success, message: message.message };
	}
});

function setDatabaseRole(event: Event): void {
	const role = (event.target as HTMLSelectElement).value;
	if (role === 'main' || role === 'test') vscode.postMessage({ command: 'setDatabaseRole', role });
}

function saveUserId(): void {
	const userId = Number.parseInt(userIdInput.value, 10);
	if (Number.isInteger(userId) && userId >= 0) vscode.postMessage({ command: 'setUserId', userId });
}

vscode.postMessage({ command: 'settingsReady' });
</script>

<template>
  <main class="h-screen overflow-auto p-3">
    <Tabs default-value="general" class="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="general">Основные</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="mt-0 flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Проект и база данных</CardTitle>
            <CardDescription>Общие настройки рабочего проекта Восточного Экспресса.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup v-if="state">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel for="database-role">База данных</FieldLabel>
                  <FieldDescription>Источник параметров подключения в Vars.bat.</FieldDescription>
                </FieldContent>
                <NativeSelect id="database-role" class="w-40" :model-value="state.databaseRole" @change="setDatabaseRole">
                  <NativeSelectOption value="main">Основная</NativeSelectOption>
                  <NativeSelectOption value="test">Тестовая</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel for="user-id">ID пользователя</FieldLabel>
                  <FieldDescription>Используется для аудита изменений методов.</FieldDescription>
                </FieldContent>
                <div class="flex w-56 gap-2">
                  <Input id="user-id" v-model="userIdInput" type="number" min="0" @keydown.enter="saveUserId" />
                  <Button variant="outline" @click="saveUserId">Сохранить</Button>
                </div>
              </Field>

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel for="project-root">Папка как корень проекта</FieldLabel>
                  <FieldDescription>Открывать PKF, Pascal и BAT в Windows-1251.</FieldDescription>
                </FieldContent>
                <Switch id="project-root" :model-value="state.useFolderAsProjectRoot" @update:model-value="enabled => vscode.postMessage({ command: 'setProjectRootEnabled', enabled })" />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter class="flex items-center gap-3">
            <Button variant="outline" :disabled="testingConnection" @click="vscode.postMessage({ command: 'testSettingsDatabaseConnection' })">
              <HugeiconsIcon :icon="Database01Icon" data-icon="inline-start" />
              {{ testingConnection ? 'Проверка…' : 'Проверить подключение' }}
            </Button>
            <p v-if="connectionResult" :class="connectionResult.success ? 'text-foreground' : 'text-destructive'" class="text-xs">{{ connectionResult.message }}</p>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="ai" class="mt-0 flex flex-col gap-3">
        <Card>
          <CardHeader>
            <div class="flex items-start gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                <HugeiconsIcon :icon="SmartPhone01Icon" />
              </div>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <CardTitle>MCP-сервер</CardTitle>
                <CardDescription>Чтение базы, список синхронизации пакетов, SVN-история и контролируемое сохранение кода методов с аудитом.</CardDescription>
              </div>
              <Badge v-if="state" :variant="statusVariant">{{ state.mcpStatusText }}</Badge>
            </div>
          </CardHeader>
          <CardContent v-if="state">
            <FieldGroup>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Разрешить MCP</FieldTitle>
                  <FieldDescription>Сервер запускается агентом по требованию и не работает постоянно.</FieldDescription>
                </FieldContent>
                <Switch :model-value="state.mcpEnabled" @update:model-value="enabled => vscode.postMessage({ command: 'setMcpEnabled', enabled })" />
              </Field>
              <Field>
                <FieldTitle>Диагностика расширения</FieldTitle>
                <FieldDescription v-if="state.lastExtensionError">
                  {{ new Date(state.lastExtensionError.timestamp).toLocaleString() }} · {{ state.lastExtensionError.source }} · {{ state.lastExtensionError.message }}
                </FieldDescription>
                <FieldDescription v-else>Ошибок в журнале нет.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button variant="outline" :disabled="!state?.lastExtensionError" @click="vscode.postMessage({ command: 'clearExtensionLogs' })">
              Очистить журнал
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Подключение внешнего агента</CardTitle>
            <CardDescription>Добавьте этот блок в конфигурацию MCP-клиента. Пути и выбранная база подставлены автоматически.</CardDescription>
          </CardHeader>
          <CardContent v-if="state" class="flex flex-col gap-2">
            <Textarea :model-value="state.mcpConnectionCode" readonly spellcheck="false" class="min-h-56 resize-none font-mono text-xs" />
            <p class="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon :icon="PlugSocketIcon" />
              Доступны query_readonly, get_recent_extension_errors и get_extension_logs.
            </p>
          </CardContent>
          <CardFooter>
            <Button v-if="state" variant="outline" :disabled="!state.mcpEnabled" @click="vscode.postMessage({ command: 'copyMcpConnectionCode', text: state.mcpConnectionCode })">
              <HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />
              Скопировать код
            </Button>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>
  </main>
</template>
