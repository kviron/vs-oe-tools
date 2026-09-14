<script setup lang="ts">
import type { SettingsHostMessage, SettingsState } from '../../../src/core/webviewProtocol';
import { AiBrain01Icon, Copy01Icon, Database01Icon, Home01Icon, PlugSocketIcon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
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
const activeSection = ref('general');
const selectedDatabase = computed(() => state.value?.databaseProfiles.find(item => item.id === state.value?.databaseProfile));
const databaseFieldDescriptions: Record<string, string> = {
	dispname: 'Отображаемое имя профиля в расширении.',
	tcpport: 'Порт клиентского подключения Восточного Экспресса.',
	dbtype: 'Тип СУБД, который использует клиент.',
	dbgdsdll: 'Путь к клиентской библиотеке PostgreSQL.',
	dbpath: 'Адрес сервера и имя базы в формате host:port/database.',
	dbusername: 'Пользователь для подключения к базе.',
	dbpassword: 'Пароль хранится в rdboadm.ini.',
	checkinsertedrefs: 'Проверять ссылки при добавлении объектов.',
};
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
  <SidebarProvider class="h-screen min-h-0 overflow-hidden">
    <Tabs v-model="activeSection" orientation="vertical" class="contents">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div class="flex items-center gap-3 px-2 py-1">
            <div class="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><HugeiconsIcon :icon="Home01Icon" /></div>
            <div class="min-w-0"><p class="truncate text-sm font-semibold">Настройки</p><p class="truncate text-xs text-sidebar-foreground/70">East Express Tools</p></div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Разделы</SidebarGroupLabel>
            <SidebarGroupContent>
              <TabsList class="h-auto w-full flex-col items-stretch bg-transparent p-0">
                <SidebarMenu>
                  <SidebarMenuItem><TabsTrigger value="general" as-child><SidebarMenuButton :is-active="activeSection === 'general'"><HugeiconsIcon :icon="Home01Icon" /><span>Основные</span></SidebarMenuButton></TabsTrigger></SidebarMenuItem>
                  <SidebarMenuItem><TabsTrigger value="databases" as-child><SidebarMenuButton :is-active="activeSection === 'databases'"><HugeiconsIcon :icon="Database01Icon" /><span>Базы данных</span></SidebarMenuButton></TabsTrigger></SidebarMenuItem>
                  <SidebarMenuItem><TabsTrigger value="ai" as-child><SidebarMenuButton :is-active="activeSection === 'ai'"><HugeiconsIcon :icon="AiBrain01Icon" /><span>AI и MCP</span></SidebarMenuButton></TabsTrigger></SidebarMenuItem>
                </SidebarMenu>
              </TabsList>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter v-if="state">
          <SidebarGroup class="rounded-md bg-sidebar-accent">
            <SidebarGroupLabel>Сервисы</SidebarGroupLabel>
            <SidebarGroupContent class="flex flex-col gap-2 px-2 pb-2">
              <div class="flex items-center justify-between gap-2"><span class="text-sidebar-foreground/70">Клиентский MCP</span><Badge :variant="state.clientMcpStatus === 'online' ? 'default' : 'secondary'">{{ state.clientMcpStatus === 'online' ? 'Работает' : 'Нет связи' }}</Badge></div>
              <div class="flex items-center justify-between gap-2"><span class="text-sidebar-foreground/70">MCP расширения</span><Badge :variant="statusVariant">{{ state.mcpStatus === 'ready' ? 'Готов' : state.mcpStatus === 'disabled' ? 'Выключен' : 'Недоступен' }}</Badge></div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset class="min-w-0 overflow-auto">
        <header class="sticky top-0 flex h-12 items-center gap-2 border-b bg-background px-4 md:hidden"><SidebarTrigger /><Separator orientation="vertical" class="h-4" /><span class="text-sm font-medium">Настройки</span></header>
        <section class="min-w-0 p-4 md:p-6">
      <TabsContent value="general" class="mx-auto mt-0 flex max-w-4xl flex-col gap-4">
        <Card><CardHeader><CardTitle>Проект и база данных</CardTitle><CardDescription>Общие настройки рабочего проекта Восточного Экспресса.</CardDescription></CardHeader>
          <CardContent><FieldGroup v-if="state">
            <Field orientation="horizontal"><FieldContent><FieldLabel for="database-profile">База данных</FieldLabel><FieldDescription>Список секций из bin\rdboadm.ini в корне открытого проекта.</FieldDescription></FieldContent><NativeSelect v-if="state.databaseProfiles.length" id="database-profile" class="w-56" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</NativeSelectOption></NativeSelect><Badge v-else variant="destructive">rdboadm.ini не найден</Badge></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="user-id">ID пользователя</FieldLabel><FieldDescription>Используется для аудита изменений методов.</FieldDescription></FieldContent><InputGroup class="w-64"><InputGroupInput id="user-id" v-model="userIdInput" type="number" min="0" @keydown.enter="saveUserId" /><InputGroupAddon align="inline-end"><InputGroupButton variant="secondary" @click="saveUserId">Сохранить</InputGroupButton></InputGroupAddon></InputGroup></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-username">Логин клиента</FieldLabel><FieldDescription>Подставляется вместо username из start.bat.</FieldDescription></FieldContent><Input id="client-username" v-model="clientUsernameInput" class="w-56" autocomplete="username" /></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="client-password">Пароль клиента</FieldLabel><FieldDescription>{{ state.clientPasswordSet ? 'Пароль сохранён защищённо. Пустое поле оставит его без изменений.' : 'Подставляется вместо password из start.bat.' }}</FieldDescription></FieldContent><InputGroup class="w-64"><InputGroupInput id="client-password" v-model="clientPasswordInput" type="password" autocomplete="new-password" @keydown.enter="saveClientCredentials" /><InputGroupAddon align="inline-end"><InputGroupButton variant="secondary" @click="saveClientCredentials">Сохранить</InputGroupButton></InputGroupAddon></InputGroup></Field>
            <Field orientation="horizontal"><FieldContent><FieldLabel for="project-root">Папка как корень проекта</FieldLabel><FieldDescription>Открывать PKF, Pascal и BAT в Windows-1251.</FieldDescription></FieldContent><Switch id="project-root" :model-value="state.useFolderAsProjectRoot" @update:model-value="enabled => vscode.postMessage({ command: 'setProjectRootEnabled', enabled })" /></Field>
          </FieldGroup></CardContent><CardFooter class="flex flex-col items-stretch gap-3"><div><Button variant="outline" :disabled="testingConnection" @click="vscode.postMessage({ command: 'testSettingsDatabaseConnection' })"><Spinner v-if="testingConnection" data-icon="inline-start" /><HugeiconsIcon v-else :icon="Database01Icon" data-icon="inline-start" />{{ testingConnection ? 'Проверка…' : 'Проверить подключение' }}</Button></div><Alert v-if="connectionResult" :variant="connectionResult.success ? 'default' : 'destructive'"><AlertTitle>{{ connectionResult.success ? 'Подключение установлено' : 'Ошибка подключения' }}</AlertTitle><AlertDescription>{{ connectionResult.message }}</AlertDescription></Alert></CardFooter></Card>
        <Card>
          <CardHeader><CardTitle>Команды проекта</CardTitle><CardDescription>Обновление файлов проекта, баз данных и запуск оригинального клиента.</CardDescription></CardHeader>
          <CardContent><FieldGroup>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Файлы проекта</FieldTitle><FieldDescription>svn update в папке packages и запуск BinUpdate.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updatePackages' })">Обновить пакеты</Button><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateBinaries' })">Обновить бинарники</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Основная база</FieldTitle><FieldDescription>DBUpdate_main.bat и start.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'main' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'main' })">Запустить клиент</Button></div></Field>
            <Field orientation="horizontal"><FieldContent><FieldTitle>Тестовая база</FieldTitle><FieldDescription>DBUpdate_test.bat и start_test.bat</FieldDescription></FieldContent><div class="flex gap-2"><Button variant="outline" @click="vscode.postMessage({ command: 'runProjectCommand', action: 'updateDatabase', role: 'test' })">Обновить базу</Button><Button @click="vscode.postMessage({ command: 'runProjectCommand', action: 'startClient', role: 'test' })">Запустить клиент</Button></div></Field>
          </FieldGroup></CardContent><CardFooter><p class="text-xs text-muted-foreground">Перед обновлением расширение запросит подтверждение и покажет ход выполнения в терминале.</p></CardFooter>
        </Card>
      </TabsContent>
      <TabsContent value="databases" class="mx-auto mt-0 flex max-w-4xl flex-col gap-4"><Card><CardHeader><div class="flex items-start gap-3"><div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted"><HugeiconsIcon :icon="Database01Icon" /></div><div class="min-w-0"><CardTitle>Профили баз данных</CardTitle><CardDescription>Подключения Восточного Экспресса из rdboadm.ini. Изменения сохраняются в выбранную секцию.</CardDescription><CardDescription v-if="state?.rdboadmPath" class="mt-1 truncate font-mono text-xs">{{ state.rdboadmPath }}</CardDescription><CardDescription v-else class="mt-1 text-destructive">{{ state?.rdboadmError ?? 'Откройте папку проекта.' }}</CardDescription></div></div></CardHeader><CardContent v-if="state?.databaseProfiles.length"><FieldGroup><Field><FieldLabel for="edit-database-profile">Профиль подключения</FieldLabel><NativeSelect id="edit-database-profile" :model-value="state.databaseProfile" @change="setDatabaseProfile"><NativeSelectOption v-for="profile in state.databaseProfiles" :key="profile.id" :value="profile.id">{{ profile.name }} · {{ profile.id }}</NativeSelectOption></NativeSelect><FieldDescription>Секция определяет набор параметров, который будет использовать расширение.</FieldDescription></Field><Separator /><div class="grid grid-cols-1 gap-4 md:grid-cols-2"><Field v-for="(field, index) in databaseFields" :key="field.key"><FieldLabel :for="`database-field-${index}`">{{ field.key }}</FieldLabel><Input :id="`database-field-${index}`" v-model="field.value" :type="field.key.toLowerCase().includes('password') ? 'password' : 'text'" autocomplete="off" /><FieldDescription>{{ databaseFieldDescriptions[field.key.toLowerCase()] ?? 'Параметр секции rdboadm.ini.' }}</FieldDescription></Field></div></FieldGroup></CardContent><CardFooter v-if="selectedDatabase" class="justify-between gap-3"><p class="text-xs text-muted-foreground">Сохраняется только выбранный профиль.</p><Button @click="saveDatabaseProfile">Сохранить профиль</Button></CardFooter></Card></TabsContent>
      <TabsContent value="ai" class="mx-auto mt-0 flex max-w-4xl flex-col gap-4">
        <Card><CardHeader><div class="flex items-start gap-3"><div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted"><HugeiconsIcon :icon="SmartPhone01Icon" /></div><div class="flex min-w-0 flex-1 flex-col gap-1"><CardTitle>MCP-сервер</CardTitle><CardDescription>Чтение базы и инструменты Восточного Экспресса для AI-агентов.</CardDescription></div><Badge v-if="state" :variant="statusVariant">{{ state.mcpStatusText }}</Badge></div></CardHeader><CardContent v-if="state"><FieldGroup><Field orientation="horizontal"><FieldContent><FieldTitle>Разрешить MCP</FieldTitle><FieldDescription>Сервер запускается агентом по требованию.</FieldDescription></FieldContent><Switch :model-value="state.mcpEnabled" @update:model-value="enabled => vscode.postMessage({ command: 'setMcpEnabled', enabled })" /></Field><Field orientation="horizontal"><FieldContent><FieldTitle>Клиентский MCP</FieldTitle><FieldDescription>{{ state.clientMcpUrl }}</FieldDescription><FieldDescription v-if="state.clientMcpDatabaseMatchesSelection === false" class="text-destructive">Сервер переключается на выбранную базу…</FieldDescription><FieldDescription v-if="clientMcpActionResult" :class="clientMcpActionResult.success ? 'text-foreground' : 'text-destructive'">{{ clientMcpActionResult.message }}</FieldDescription></FieldContent><div class="flex flex-wrap items-center justify-end gap-2"><Badge :variant="state.clientMcpStatus === 'online' ? 'default' : 'secondary'">{{ clientMcpAction === 'start' ? 'Запуск…' : clientMcpAction === 'stop' ? 'Остановка…' : state.clientMcpStatusText }}</Badge><Button v-if="state.clientMcpStatus === 'offline'" size="sm" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'startClientMcpServer' })"><Spinner v-if="clientMcpAction === 'start'" data-icon="inline-start" />{{ clientMcpAction === 'start' ? 'Запуск…' : 'Запустить' }}</Button><Button v-else variant="destructive" size="sm" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'stopClientMcpServer' })"><Spinner v-if="clientMcpAction === 'stop'" data-icon="inline-start" />{{ clientMcpAction === 'stop' ? 'Остановка…' : 'Остановить' }}</Button><Button variant="outline" size="sm" :disabled="Boolean(clientMcpAction) || checkingClientMcpTools" @click="vscode.postMessage({ command: 'checkClientMcpTools' })"><Spinner v-if="checkingClientMcpTools" data-icon="inline-start" />{{ checkingClientMcpTools ? 'Проверка…' : 'Проверить инструменты' }}</Button></div></Field><Field><FieldTitle>Диагностика расширения</FieldTitle><FieldDescription v-if="state.lastExtensionError">{{ new Date(state.lastExtensionError.timestamp).toLocaleString() }} · {{ state.lastExtensionError.source }} · {{ state.lastExtensionError.message }}</FieldDescription><FieldDescription v-else>Ошибок в журнале нет.</FieldDescription></Field></FieldGroup></CardContent><CardFooter><Button variant="outline" :disabled="!state?.lastExtensionError" @click="vscode.postMessage({ command: 'clearExtensionLogs' })">Очистить журнал</Button></CardFooter></Card>
        <Card>
          <CardHeader><div class="flex items-start justify-between gap-3"><div class="flex flex-col gap-1"><CardTitle>Инструменты MCP</CardTitle><CardDescription>Нажмите на инструмент, чтобы посмотреть его описание.</CardDescription><CardDescription v-if="state?.clientMcpToolsDatabase">Клиент: {{ state.clientMcpToolsDatabase }}<template v-if="state.clientMcpToolsUpdatedAt"> · обновлено {{ new Date(state.clientMcpToolsUpdatedAt).toLocaleString() }}</template></CardDescription></div><Badge v-if="state" variant="secondary">{{ extensionMcpTools.length + clientMcpTools.length }}</Badge></div></CardHeader>
		  <CardContent v-if="state" class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Цвета:</span><Badge variant="outline">Расширение</Badge><Badge variant="secondary">Клиент</Badge><Badge variant="destructive">Deprecated</Badge></div>
			<Alert v-if="checkingClientMcpTools"><Spinner /><AlertTitle>Обновляем каталог</AlertTitle><AlertDescription>Получаем актуальный список инструментов клиентского MCP.</AlertDescription></Alert>
			<Alert v-else-if="state.clientMcpToolsError" variant="destructive"><AlertTitle>Клиент недоступен</AlertTitle><AlertDescription>{{ state.clientMcpToolsError }}</AlertDescription></Alert>
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
        </section>
      </SidebarInset>
    </Tabs>
  </SidebarProvider>
</template>
