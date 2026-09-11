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
import { Separator } from '@/components/ui/separator';
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
const clientMcpAction = ref<'start' | 'stop'>();
const clientMcpActionResult = ref<{ success: boolean; message: string }>();
const checkingClientMcpTools = ref(false);
const selectedDatabase = computed(() => state.value?.databaseProfiles.find(item => item.id === state.value?.databaseProfile));
const statusVariant = computed(() => state.value?.mcpStatus === 'unavailable' ? 'destructive' : state.value?.mcpStatus === 'ready' ? 'default' : 'secondary');
const extensionMcpTools = computed(() => [...(state.value?.extensionMcpTools ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'ru')));
const clientMcpTools = computed(() => [...(state.value?.clientMcpTools ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'ru')));
const selectedToolKey = ref<string>();
const selectedTool = computed(() => {
	const [source, name] = selectedToolKey.value?.split(':', 2) ?? [];
	if (!source || !name) { return undefined; }
	if (source === 'extension') {
		const tool = extensionMcpTools.value.find(item => item.name === name);
		return tool && { ...tool, source: 'Инструмент расширения' };
	}
	const tool = clientMcpTools.value.find(item => item.name === name);
	return tool && { ...tool, deprecated: false, source: 'Инструмент клиента' };
});

function selectTool(source: 'extension' | 'client', name: string): void {
	const key = `${source}:${name}`;
	selectedToolKey.value = selectedToolKey.value === key ? undefined : key;
}

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
	} else if (message.command === 'databaseConnectionTestFinished') {
		testingConnection.value = false;
		connectionResult.value = { success: message.success, message: message.message };
	} else if (message.command === 'clientMcpActionStarted') {
		clientMcpAction.value = message.action;
		clientMcpActionResult.value = undefined;
	} else if (message.command === 'clientMcpActionFinished') {
		clientMcpAction.value = undefined;
		clientMcpActionResult.value = { success: message.success, message: message.message };
	} else if (message.command === 'clientMcpToolsCheckStarted') {
		checkingClientMcpTools.value = true;
	} else if (message.command === 'clientMcpToolsCheckFinished') {
		checkingClientMcpTools.value = false;
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
            <Field orientation="horizontal"><FieldContent><FieldLabel for="database-profile">База данных</FieldLabel><FieldDescription>Список секций из bin\rdboadm.ini в корне открытого проекта.</FieldDescription></FieldContent><NativeSelect v-if="state.databaseProfiles.length" id="database-profile" class="w-56" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</NativeSelectOption></NativeSelect><Badge v-else variant="destructive">rdboadm.ini не найден</Badge></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="user-id">ID пользователя</FieldLabel><FieldDescription>Используется для аудита изменений методов.</FieldDescription></FieldContent><div class="flex w-56 gap-2"><Input id="user-id" v-model="userIdInput" type="number" min="0" @keydown.enter="saveUserId" /><Button variant="outline" @click="saveUserId">Сохранить</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-username">Логин клиента</FieldLabel><FieldDescription>Подставляется вместо username из start.bat.</FieldDescription></FieldContent><Input id="client-username" v-model="clientUsernameInput" class="w-56" autocomplete="username" /></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-password">Пароль клиента</FieldLabel><FieldDescription>{{ state.clientPasswordSet ? 'Пароль сохранён защищённо. Пустое поле оставит его без изменений.' : 'Подставляется вместо password из start.bat.' }}</FieldDescription></FieldContent><div class="flex w-56 gap-2"><Input id="client-password" v-model="clientPasswordInput" type="password" autocomplete="new-password" @keydown.enter="saveClientCredentials" /><Button variant="outline" @click="saveClientCredentials">Сохранить</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="project-root">Папка как корень проекта</FieldLabel><FieldDescription>Открывать PKF, Pascal и BAT в Windows-1251.</FieldDescription></FieldContent><Switch id="project-root" :model-value="state.useFolderAsProjectRoot" @update:model-value="enabled => vscode.postMessage({ command: 'setProjectRootEnabled', enabled })" /></Field>
          </FieldGroup></CardContent><CardFooter class="flex items-center gap-3"><Button variant="outline" :disabled="testingConnection" @click="vscode.postMessage({ command: 'testSettingsDatabaseConnection' })"><HugeiconsIcon :icon="Database01Icon" data-icon="inline-start" />{{ testingConnection ? 'Проверка…' : 'Проверить подключение' }}</Button><p v-if="connectionResult" :class="connectionResult.success ? 'text-foreground' : 'text-destructive'" class="text-xs">{{ connectionResult.message }}</p></CardFooter></Card>
        <Card>
          <CardHeader><CardTitle>Команды проекта</CardTitle><CardDescription>Обновление файлов проекта, баз данных и запуск оригинального клиента.</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Файлы проекта</FieldTitle><FieldDescription>svn update в папке packages и запуск BinUpdate.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updatePackages' })">Обновить пакеты</Button><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateBinaries' })">Обновить бинарники</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Основная база</FieldTitle><FieldDescription>DBUpdate_main.bat и start.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'main' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'main' })">Запустить клиент</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Тестовая база</FieldTitle><FieldDescription>DBUpdate_test.bat и start_test.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'test' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'test' })">Запустить клиент</Button></div></Field>
          </FieldGroup></CardContent><CardFooter><p class="text-xs text-muted-foreground">Перед обновлением расширение запросит подтверждение и покажет ход выполнения в терминале.</p></CardFooter>
        </Card>
      </TabsContent>
      <TabsContent value="databases" class="mt-0 flex flex-col gap-3"><Card><CardHeader><CardTitle>Настройки баз</CardTitle><CardDescription v-if="state?.rdboadmPath">{{ state.rdboadmPath }}</CardDescription><CardDescription v-else>{{ state?.rdboadmError ?? 'Откройте папку проекта.' }}</CardDescription></CardHeader><CardContent v-if="state?.databaseProfiles.length"><FieldGroup><Field><FieldLabel for="edit-database-profile">Секция</FieldLabel><NativeSelect id="edit-database-profile" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }} [{{ profile.id }}]</NativeSelectOption></NativeSelect></Field><Field v-for="(field, index) in databaseFields" :key="field.key"><FieldLabel :for="`database-field-${index}`">{{ field.key }}</FieldLabel><Input :id="`database-field-${index}`" v-model="field.value" :type="field.key.toLowerCase().includes('password') ? 'password' : 'text'" autocomplete="off" /></Field></FieldGroup></CardContent><CardFooter v-if="selectedDatabase"><Button @click="saveDatabaseProfile">Сохранить в rdboadm.ini</Button></CardFooter></Card></TabsContent>
      <TabsContent value="ai" class="mt-0 flex flex-col gap-3">
        <Card><CardHeader><div class="flex items-start gap-3"><div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted"><HugeiconsIcon :icon="SmartPhone01Icon" /></div><div class="flex min-w-0 flex-1 flex-col gap-1"><CardTitle>MCP-сервер</CardTitle><CardDescription>Чтение базы и инструменты Восточного Экспресса для AI-агентов.</CardDescription></div><Badge v-if="state" :variant="statusVariant">{{ state.mcpStatusText }}</Badge></div></CardHeader><CardContent v-if="state"><FieldGroup><Field orientation="horizontal"><FieldContent><FieldTitle>Разрешить MCP</FieldTitle><FieldDescription>Сервер запускается агентом по требованию.</FieldDescription></FieldContent><Switch :model-value="state.mcpEnabled" @update:model-value="enabled => vscode.postMessage({ command: 'setMcpEnabled', enabled })" /></Field><Field orientation="horizontal"><FieldContent><FieldTitle>Клиентский MCP</FieldTitle><FieldDescription>{{ state.clientMcpUrl }}</FieldDescription><FieldDescription v-if="state.clientMcpDatabaseMatchesSelection === false" class="text-destructive">Сервер переключается на выбранную базу…</FieldDescription><FieldDescription v-if="clientMcpActionResult" :class="clientMcpActionResult.success ? 'text-foreground' : 'text-destructive'">{{ clientMcpActionResult.message }}</FieldDescription></FieldContent><div class="flex items-center gap-2"><span :class="state.clientMcpStatus === 'online' ? 'bg-green-500' : 'bg-destructive'" class="size-2.5 rounded-full" aria-hidden="true" /><span :class="state.clientMcpStatus === 'online' ? 'text-foreground' : 'text-destructive'" class="text-sm font-medium">{{ clientMcpAction === 'start' ? 'Запуск…' : clientMcpAction === 'stop' ? 'Остановка…' : state.clientMcpStatusText }}</span><Button v-if="state.clientMcpStatus === 'offline'" size="sm" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'startClientMcpServer' })">{{ clientMcpAction === 'start' ? 'Запуск…' : 'Запустить' }}</Button><Button v-else variant="destructive" size="sm" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'stopClientMcpServer' })">{{ clientMcpAction === 'stop' ? 'Остановка…' : 'Остановить' }}</Button><Button variant="outline" size="sm" :disabled="Boolean(clientMcpAction) || checkingClientMcpTools" @click="vscode.postMessage({ command: 'checkClientMcpTools' })">{{ checkingClientMcpTools ? 'Проверка…' : 'Проверить инструменты' }}</Button></div></Field><Field><FieldTitle>Диагностика расширения</FieldTitle><FieldDescription v-if="state.lastExtensionError">{{ new Date(state.lastExtensionError.timestamp).toLocaleString() }} · {{ state.lastExtensionError.source }} · {{ state.lastExtensionError.message }}</FieldDescription><FieldDescription v-else>Ошибок в журнале нет.</FieldDescription></Field></FieldGroup></CardContent><CardFooter><Button variant="outline" :disabled="!state?.lastExtensionError" @click="vscode.postMessage({ command: 'clearExtensionLogs' })">Очистить журнал</Button></CardFooter></Card>
        <Card>
          <CardHeader><div class="flex items-start justify-between gap-3"><div class="flex flex-col gap-1"><CardTitle>Инструменты MCP</CardTitle><CardDescription>Нажмите на инструмент, чтобы посмотреть его описание.</CardDescription><CardDescription v-if="state?.clientMcpToolsDatabase">Клиент: {{ state.clientMcpToolsDatabase }}<template v-if="state.clientMcpToolsUpdatedAt"> · обновлено {{ new Date(state.clientMcpToolsUpdatedAt).toLocaleString() }}</template></CardDescription></div><Badge v-if="state" variant="secondary">{{ extensionMcpTools.length + clientMcpTools.length }}</Badge></div></CardHeader>
		  <CardContent v-if="state" class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Цвета:</span><Badge variant="outline">Расширение</Badge><Badge variant="secondary">Клиент</Badge><Badge variant="destructive">Deprecated</Badge></div>
			<div v-if="checkingClientMcpTools" class="text-sm text-muted-foreground">Обновляем клиентский каталог…</div>
			<div v-else-if="state.clientMcpToolsError" class="flex items-center gap-2"><Badge variant="destructive">Клиент недоступен</Badge><span class="text-xs text-muted-foreground">{{ state.clientMcpToolsError }}</span></div>
			<section class="flex flex-col gap-2">
			  <div class="flex items-center gap-2"><h3 class="text-sm font-medium">Расширение</h3><Badge variant="outline">{{ extensionMcpTools.length }}</Badge></div>
			  <div class="flex flex-wrap gap-1.5"><Badge v-for="tool in extensionMcpTools" :key="tool.name" as="button" type="button" :variant="tool.deprecated ? 'destructive' : 'outline'" class="max-w-full cursor-pointer" @click="selectTool('extension', tool.name)"><span class="truncate font-mono font-normal opacity-70">{{ tool.name }}</span></Badge></div>
			</section>
			<Separator />
			<section class="flex flex-col gap-2">
			  <div class="flex items-center gap-2"><h3 class="text-sm font-medium">Клиент</h3><Badge variant="secondary">{{ clientMcpTools.length }}</Badge></div>
			  <p v-if="!state.clientMcpTools" class="text-xs text-muted-foreground">Каталог ещё не получен для выбранной базы.</p>
			  <div v-else class="flex flex-wrap gap-1.5"><Badge v-for="tool in clientMcpTools" :key="tool.name" as="button" type="button" variant="secondary" class="max-w-full cursor-pointer" @click="selectTool('client', tool.name)"><span class="truncate font-mono font-normal opacity-70">{{ tool.name }}</span></Badge></div>
			</section>
			<Card v-if="selectedTool" size="sm">
			  <CardHeader><div class="flex min-w-0 items-center justify-between gap-2"><CardTitle><span class="font-mono">{{ selectedTool.name }}</span></CardTitle><CardDescription>{{ selectedTool.source }}</CardDescription></div></CardHeader>
			  <CardContent><p class="text-xs leading-relaxed text-muted-foreground">{{ selectedTool.description || 'Описание не указано.' }}</p></CardContent>
			</Card>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Подключение агента</CardTitle><CardDescription>Путь и выбранная секция базы подставлены автоматически.</CardDescription></CardHeader><CardContent v-if="state" class="flex flex-col gap-2"><Textarea :model-value="state.mcpConnectionCode" readonly spellcheck="false" class="min-h-56 resize-none font-mono text-xs" /><p class="flex items-center gap-1 text-xs text-muted-foreground"><HugeiconsIcon :icon="PlugSocketIcon" />Доступны инструменты базы и навигации.</p></CardContent><CardFooter><Button v-if="state" variant="outline" :disabled="!state.mcpEnabled" @click="vscode.postMessage({ command: 'copyMcpConnectionCode', text: state.mcpConnectionCode })"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Скопировать код</Button></CardFooter></Card>
      </TabsContent>
    </Tabs>
  </main>
</template>
