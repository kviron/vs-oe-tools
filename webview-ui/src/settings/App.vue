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
const clientUsernameInput = ref('');
const clientPasswordInput = ref('');
const databaseFields = ref<Array<{ key: string; value: string }>>([]);
const testingConnection = ref(false);
const connectionResult = ref<{ success: boolean; message: string }>();
const selectedDatabase = computed(() => state.value?.databaseProfiles.find(item => item.id === state.value?.databaseProfile));
const statusVariant = computed(() => state.value?.mcpStatus === 'unavailable' ? 'destructive' : state.value?.mcpStatus === 'ready' ? 'default' : 'secondary');

window.addEventListener('message', (event: MessageEvent<SettingsHostMessage>) => {
	const message = event.data;
	if (message.command === 'settingsState') {
		state.value = message.state;
		userIdInput.value = String(message.state.userId);
		clientUsernameInput.value = message.state.clientUsername;
		clientPasswordInput.value = '';
		databaseFields.value = message.state.databaseProfiles.find(item => item.id === message.state.databaseProfile)?.fields.map(field => ({ ...field })) ?? [];
	} else if (message.command === 'databaseConnectionTestStarted') {
		testingConnection.value = true;
		connectionResult.value = undefined;
	} else {
		testingConnection.value = false;
		connectionResult.value = { success: message.success, message: message.message };
	}
});

function setDatabaseProfile(event: Event): void {
	const profile = (event.target as HTMLSelectElement).value;
	if (profile) vscode.postMessage({ command: 'setDatabaseProfile', profile });
}
function saveDatabaseProfile(): void {
	if (state.value?.databaseProfile) vscode.postMessage({ command: 'saveDatabaseProfile', profile: state.value.databaseProfile, fields: databaseFields.value });
}
function saveUserId(): void {
	const userId = Number.parseInt(userIdInput.value, 10);
	if (Number.isInteger(userId) && userId >= 0) vscode.postMessage({ command: 'setUserId', userId });
}
function saveClientCredentials(): void {
	vscode.postMessage({
		command: 'setClientCredentials',
		username: clientUsernameInput.value.trim(),
		...(clientPasswordInput.value ? { password: clientPasswordInput.value } : {}),
	});
	clientPasswordInput.value = '';
}
vscode.postMessage({ command: 'settingsReady' });
</script>

<template>
  <main class="h-screen overflow-auto p-3">
    <Tabs default-value="general" class="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <TabsList class="grid w-full grid-cols-3"><TabsTrigger value="general">Основные</TabsTrigger><TabsTrigger value="databases">Базы</TabsTrigger><TabsTrigger value="ai">AI</TabsTrigger></TabsList>
      <TabsContent value="general" class="mt-0 flex flex-col gap-3">
        <Card><CardHeader><CardTitle>Проект и база данных</CardTitle><CardDescription>Общие настройки рабочего проекта Восточного Экспресса.</CardDescription></CardHeader>
          <CardContent><FieldGroup v-if="state">
            <Field orientation="horizontal"><FieldContent><FieldLabel for="database-profile">База данных</FieldLabel><FieldDescription>Список секций из trunk\bin\rdboadm.ini.</FieldDescription></FieldContent><NativeSelect v-if="state.databaseProfiles.length" id="database-profile" class="w-56" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</NativeSelectOption></NativeSelect><Badge v-else variant="destructive">rdboadm.ini не найден</Badge></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="user-id">ID пользователя</FieldLabel><FieldDescription>Используется для аудита изменений методов.</FieldDescription></FieldContent><div class="flex w-56 gap-2"><Input id="user-id" v-model="userIdInput" type="number" min="0" @keydown.enter="saveUserId" /><Button variant="outline" @click="saveUserId">Сохранить</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-username">Логин клиента</FieldLabel><FieldDescription>Подставляется вместо username из start.bat.</FieldDescription></FieldContent><Input id="client-username" v-model="clientUsernameInput" class="w-56" autocomplete="username" /></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-password">Пароль клиента</FieldLabel><FieldDescription>{{ state.clientPasswordSet ? 'Пароль сохранён защищённо. Пустое поле оставит его без изменений.' : 'Подставляется вместо password из start.bat.' }}</FieldDescription></FieldContent><div class="flex w-56 gap-2"><Input id="client-password" v-model="clientPasswordInput" type="password" autocomplete="new-password" @keydown.enter="saveClientCredentials" /><Button variant="outline" @click="saveClientCredentials">Сохранить</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="project-root">Папка как корень проекта</FieldLabel><FieldDescription>Открывать PKF, Pascal и BAT в Windows-1251.</FieldDescription></FieldContent><Switch id="project-root" :model-value="state.useFolderAsProjectRoot" @update:model-value="enabled => vscode.postMessage({ command: 'setProjectRootEnabled', enabled })" /></Field>
          </FieldGroup></CardContent><CardFooter class="flex items-center gap-3"><Button variant="outline" :disabled="testingConnection" @click="vscode.postMessage({ command: 'testSettingsDatabaseConnection' })"><HugeiconsIcon :icon="Database01Icon" data-icon="inline-start" />{{ testingConnection ? 'Проверка…' : 'Проверить подключение' }}</Button><p v-if="connectionResult" :class="connectionResult.success ? 'text-foreground' : 'text-destructive'" class="text-xs">{{ connectionResult.message }}</p></CardFooter></Card>
        <Card>
          <CardHeader><CardTitle>Команды проекта</CardTitle><CardDescription>Обновление базы и запуск оригинального клиента командами из BAT-файлов проекта.</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Основная база</FieldTitle><FieldDescription>DBUpdate_main.bat и start.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'main' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'main' })">Запустить клиент</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Тестовая база</FieldTitle><FieldDescription>DBUpdate_test.bat и start_test.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'test' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'test' })">Запустить клиент</Button></div></Field>
          </FieldGroup></CardContent><CardFooter><p class="text-xs text-muted-foreground">Перед обновлением базы расширение запросит подтверждение и покажет ход выполнения в терминале.</p></CardFooter>
        </Card>
      </TabsContent>
      <TabsContent value="databases" class="mt-0 flex flex-col gap-3"><Card><CardHeader><CardTitle>Настройки баз</CardTitle><CardDescription v-if="state?.rdboadmPath">{{ state.rdboadmPath }}</CardDescription><CardDescription v-else>{{ state?.rdboadmError ?? 'Откройте папку проекта.' }}</CardDescription></CardHeader><CardContent v-if="state?.databaseProfiles.length"><FieldGroup><Field><FieldLabel for="edit-database-profile">Секция</FieldLabel><NativeSelect id="edit-database-profile" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }} [{{ profile.id }}]</NativeSelectOption></NativeSelect></Field><Field v-for="(field, index) in databaseFields" :key="field.key"><FieldLabel :for="`database-field-${index}`">{{ field.key }}</FieldLabel><Input :id="`database-field-${index}`" v-model="field.value" :type="field.key.toLowerCase().includes('password') ? 'password' : 'text'" autocomplete="off" /></Field></FieldGroup></CardContent><CardFooter v-if="selectedDatabase"><Button @click="saveDatabaseProfile">Сохранить в rdboadm.ini</Button></CardFooter></Card></TabsContent>
      <TabsContent value="ai" class="mt-0 flex flex-col gap-3"><Card><CardHeader><div class="flex items-start gap-3"><div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted"><HugeiconsIcon :icon="SmartPhone01Icon" /></div><div class="flex min-w-0 flex-1 flex-col gap-1"><CardTitle>MCP-сервер</CardTitle><CardDescription>Чтение базы и инструменты Восточного Экспресса для AI-агентов.</CardDescription></div><Badge v-if="state" :variant="statusVariant">{{ state.mcpStatusText }}</Badge></div></CardHeader><CardContent v-if="state"><FieldGroup><Field orientation="horizontal"><FieldContent><FieldTitle>Разрешить MCP</FieldTitle><FieldDescription>Сервер запускается агентом по требованию.</FieldDescription></FieldContent><Switch :model-value="state.mcpEnabled" @update:model-value="enabled => vscode.postMessage({ command: 'setMcpEnabled', enabled })" /></Field><Field><FieldTitle>Диагностика расширения</FieldTitle><FieldDescription v-if="state.lastExtensionError">{{ new Date(state.lastExtensionError.timestamp).toLocaleString() }} · {{ state.lastExtensionError.source }} · {{ state.lastExtensionError.message }}</FieldDescription><FieldDescription v-else>Ошибок в журнале нет.</FieldDescription></Field></FieldGroup></CardContent><CardFooter><Button variant="outline" :disabled="!state?.lastExtensionError" @click="vscode.postMessage({ command: 'clearExtensionLogs' })">Очистить журнал</Button></CardFooter></Card><Card><CardHeader><CardTitle>Подключение агента</CardTitle><CardDescription>Путь и выбранная секция базы подставлены автоматически.</CardDescription></CardHeader><CardContent v-if="state" class="flex flex-col gap-2"><Textarea :model-value="state.mcpConnectionCode" readonly spellcheck="false" class="min-h-56 resize-none font-mono text-xs" /><p class="flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon :icon="PlugSocketIcon" />Доступны инструменты базы и навигации.</p></CardContent><CardFooter><Button v-if="state" variant="outline" :disabled="!state.mcpEnabled" @click="vscode.postMessage({ command: 'copyMcpConnectionCode', text: state.mcpConnectionCode })"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Скопировать код</Button></CardFooter></Card></TabsContent>
    </Tabs>
  </main>
</template>
