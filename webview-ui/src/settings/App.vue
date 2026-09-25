<script setup lang="ts">
import type { SettingsHostMessage, SettingsState } from '../../../src/core/webviewProtocol';
import { AiBrain01Icon, Copy01Icon, Database01Icon, Home01Icon, PlugSocketIcon, SmartPhone01Icon, PlayIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import DatabaseProfileSelect from './DatabaseProfileSelect.vue';
import SettingsNavigation from './SettingsNavigation.vue';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { vscode } from '@/vscode';
import SearchField from '@/components/SearchField.vue';
import { defaultSearchOptions, matchesAnySearch, type SearchOptions } from '@/lib/searchMatch';

const state = ref<SettingsState>();
const userIdInput = ref('0');
const clientUsernameInput = ref('');
const clientPasswordInput = ref('');
const clientLaunchArgumentsInput = ref('');
const clientLaunchArgumentsDirty = ref(false);
const databaseFields = ref<Array<{ key: string; value: string }>>([]);
const testingConnection = ref(false);
const connectionResult = ref<{ success: boolean; message: string }>();
const clientMcpAction = ref<'start' | 'stop'>();
const clientMcpActionResult = ref<{ success: boolean; message: string }>();
const checkingClientMcpTools = ref(false);
const activeSection = ref('general');
const toolSearch = ref('');
const toolSearchOptions = ref<SearchOptions>({ ...defaultSearchOptions });
const sectionDetails: Record<string, { title: string; description: string }> = {
  general: { title: 'Рабочее окружение', description: 'Подключение, учётная запись и поведение проекта.' },
  databases: { title: 'Базы данных', description: 'Параметры подключения и профили Восточного Экспресса.' },
  commands: { title: 'Команды проекта', description: 'Обновление проекта и запуск клиента для нужной базы.' },
  ai: { title: 'AI и MCP', description: 'Подключите агента и управляйте доступом к инструментам.' },
  tools: { title: 'Каталог инструментов', description: 'Возможности расширения и клиентского MCP в одном месте.' },
};
const currentSection = computed(() => sectionDetails[activeSection.value] ?? sectionDetails.general);
const databaseLabels: Record<string, string> = { dispname: 'Название профиля', dbpath: 'Адрес базы данных', dbusername: 'Пользователь базы', dbpassword: 'Пароль базы', tcpport: 'Порт клиента', dbtype: 'Система управления базой', dbgdsdll: 'Клиентская библиотека', checkinsertedrefs: 'Проверка ссылок' };
const databaseGroups = computed(() => [
  { title: 'Подключение', description: 'Адрес базы и данные для входа.', fields: databaseFields.value.filter(field => ['dispname', 'dbpath', 'dbusername', 'dbpassword', 'tcpport'].includes(field.key.toLowerCase())) },
  { title: 'Дополнительные параметры', description: 'Библиотеки и параметры клиентского окружения.', fields: databaseFields.value.filter(field => !['dispname', 'dbpath', 'dbusername', 'dbpassword', 'tcpport'].includes(field.key.toLowerCase())) },
]);
const commandGroups = [
  { title: 'Файлы проекта', description: 'Исходники пакетов и исполняемые файлы.', icon: Home01Icon, commands: [{ label: 'Обновить пакеты', action: 'updatePackages', script: 'svn update · packages' }, { label: 'Обновить бинарники', action: 'updateBinaries', script: 'OEUpdater · bin и bin.win64' }] },
  { title: 'Основная база', description: 'Рабочее окружение проекта.', icon: Database01Icon, role: 'main', commands: [{ label: 'Обновить базу', action: 'updateDatabase', script: 'OEPrjScript → OEPatch' }, { label: 'Запустить клиент', action: 'startClient', script: 'bin\\fme.exe · основная' }] },
  { title: 'Тестовая база', description: 'Окружение для проверки изменений.', icon: Database01Icon, role: 'test', commands: [{ label: 'Обновить базу', action: 'updateDatabase', script: 'OEPrjScript → OEPatch' }, { label: 'Запустить клиент', action: 'startClient', script: 'bin\\fme.exe · тестовая' }] },
] as const;
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
const toolGroups = computed(() => [
  { source: 'extension' as const, title: 'Расширение', tools: extensionMcpTools.value },
  { source: 'client' as const, title: 'Клиент', tools: clientMcpTools.value.map(tool => ({ ...tool, deprecated: false })) },
].map(group => ({ ...group, tools: group.tools.filter(tool => matchesAnySearch([tool.name, tool.description], toolSearch.value, toolSearchOptions.value)) })));
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
		if (!clientLaunchArgumentsDirty.value || clientLaunchArgumentsInput.value === message.state.clientLaunchArguments) {
			clientLaunchArgumentsInput.value = message.state.clientLaunchArguments;
			clientLaunchArgumentsDirty.value = false;
		}
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

function setDatabaseProfile(profile: string): void {
	if (profile) vscode.postMessage({ command: 'setDatabaseProfile', profile });
}
function runCommand(action: 'updatePackages' | 'updateBinaries' | 'updateDatabase' | 'startClient', role?: 'main' | 'test'): void {
  if (action === 'updatePackages' || action === 'updateBinaries') vscode.postMessage({ command: 'runProjectCommand', action });
  else if (role) vscode.postMessage({ command: 'runProjectCommand', action, role });
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
function saveClientLaunchArguments(): void {
	vscode.postMessage({ command: 'setClientLaunchArguments', value: clientLaunchArgumentsInput.value });
}
vscode.postMessage({ command: 'settingsReady' });
</script>

<template>
  <SidebarProvider class="h-screen min-h-0 overflow-hidden">
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader class="p-4">
        <div class="flex items-center gap-3"><HugeiconsIcon :icon="Home01Icon" class="size-6 text-sidebar-primary" /><div><p class="text-sm font-semibold">East Express Tools</p><p class="text-xs text-muted-foreground">Настройки пространства</p></div></div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel>Рабочее пространство</SidebarGroupLabel><SidebarGroupContent><SettingsNavigation v-model="activeSection" /></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter v-if="state" class="p-3">
        <Card size="sm"><CardHeader><CardDescription>Активное подключение</CardDescription><CardTitle><span class="break-words">{{ selectedDatabase?.name || 'Профиль не выбран' }}</span></CardTitle></CardHeader><CardContent><div class="flex flex-col gap-2"><div class="flex items-center justify-between gap-2"><span class="text-muted-foreground">MCP расширения</span><Badge :variant="statusVariant">{{ state.mcpStatus === 'ready' ? 'Готов' : state.mcpStatus === 'disabled' ? 'Выключен' : 'Недоступен' }}</Badge></div><div class="flex items-center justify-between gap-2"><span class="text-muted-foreground">Клиент</span><Badge :variant="state.clientMcpStatus === 'online' ? 'default' : 'secondary'">{{ state.clientMcpStatus === 'online' ? 'На связи' : 'Нет связи' }}</Badge></div></div></CardContent></Card>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset class="min-w-0 overflow-auto">
      <header class="flex shrink-0 items-center gap-3 border-b px-4 py-3"><SidebarTrigger aria-label="Переключить навигацию" /><Separator orientation="vertical" class="h-4" /><p class="text-xs text-muted-foreground">Настройки <span class="mx-2" aria-hidden="true">/</span><span class="text-foreground">{{ currentSection.title }}</span></p></header>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 lg:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3"><div class="flex flex-col gap-1"><h1 class="text-2xl font-semibold tracking-tight">{{ currentSection.title }}</h1><p class="text-sm text-muted-foreground">{{ currentSection.description }}</p></div><Badge v-if="state?.databaseProfile" variant="outline">{{ state.databaseProfile }}</Badge></div>
        <div v-if="!state" class="grid gap-4 sm:grid-cols-2"><Skeleton v-for="index in 4" :key="index" class="h-48 w-full" /></div>
        <template v-else>
          <section v-if="activeSection === 'general'" aria-label="Рабочее окружение" class="flex flex-col gap-5">
            <div class="grid gap-3 sm:grid-cols-3">
              <Card size="sm"><CardHeader><CardDescription>Подключения</CardDescription></CardHeader><CardContent><p class="text-2xl font-semibold tabular-nums">{{ state.databaseProfiles.length }}</p><p class="mt-1 text-xs text-muted-foreground">Профили баз данных</p></CardContent></Card>
              <Card size="sm"><CardHeader><CardDescription>Учётная запись клиента</CardDescription></CardHeader><CardContent><p class="truncate text-lg font-semibold">{{ state.clientUsername || 'Из start.bat' }}</p><p class="mt-1 text-xs text-muted-foreground">{{ state.clientPasswordSet ? 'Пароль сохранён' : 'Пароль не задан в расширении' }}</p></CardContent></Card>
              <Card size="sm"><CardHeader><CardDescription>Инструменты AI</CardDescription></CardHeader><CardContent><p class="text-2xl font-semibold tabular-nums">{{ extensionMcpTools.length + clientMcpTools.length }}</p><p class="mt-1 text-xs text-muted-foreground">В полученных каталогах MCP</p></CardContent></Card>
            </div>
            <div class="grid items-start gap-5 xl:grid-cols-2">
              <div class="flex min-w-0 flex-col gap-5">
                <Card><CardHeader><CardTitle>Подключение к базе</CardTitle><CardDescription>Выберите профиль для текущего проекта.</CardDescription><CardAction><HugeiconsIcon :icon="Database01Icon" class="size-5 text-muted-foreground" /></CardAction></CardHeader>
                  <CardContent><FieldGroup><Field><FieldLabel for="database-profile">Активная база данных</FieldLabel><DatabaseProfileSelect v-if="state.databaseProfiles.length" id="database-profile" :model-value="state.databaseProfile" :profiles="state.databaseProfiles" @update:model-value="setDatabaseProfile" /><Alert v-else variant="destructive"><AlertTitle>Профили не найдены</AlertTitle><AlertDescription>{{ state.rdboadmError || 'Проверьте bin/rdboadm.ini в папке проекта.' }}</AlertDescription></Alert><FieldDescription>Используется расширением для работы с метаданными.</FieldDescription></Field><div v-if="state.rdboadmPath" class="bg-muted/50 p-3"><p class="mb-1 text-xs text-muted-foreground">Файл подключений</p><p class="break-all font-mono text-xs">{{ state.rdboadmPath }}</p></div><Alert v-if="connectionResult" :variant="connectionResult.success ? 'default' : 'destructive'"><AlertTitle>{{ connectionResult.success ? 'Подключение установлено' : 'Ошибка подключения' }}</AlertTitle><AlertDescription>{{ connectionResult.message }}</AlertDescription></Alert></FieldGroup></CardContent>
                  <CardFooter class="flex flex-wrap gap-2 border-t"><Button variant="outline" :disabled="testingConnection || !selectedDatabase" @click="vscode.postMessage({ command: 'testSettingsDatabaseConnection' })"><Spinner v-if="testingConnection" data-icon="inline-start" /><HugeiconsIcon v-else :icon="Database01Icon" data-icon="inline-start" />{{ testingConnection ? 'Проверка…' : 'Проверить подключение' }}</Button><Button variant="ghost" @click="activeSection = 'databases'">Настроить профиль</Button></CardFooter>
                </Card>
                <Card><CardHeader><CardTitle>Поведение проекта</CardTitle><CardDescription>Работа с файлами Восточного Экспресса.</CardDescription></CardHeader><CardContent><Field orientation="horizontal"><FieldContent><FieldLabel for="project-root">Папка как корень проекта</FieldLabel><FieldDescription>Открывать PKF, Pascal и BAT в Windows-1251.</FieldDescription></FieldContent><Switch id="project-root" :model-value="state.useFolderAsProjectRoot" @update:model-value="enabled => vscode.postMessage({ command: 'setProjectRootEnabled', enabled })" /></Field></CardContent></Card>
              </div>
              <div class="flex min-w-0 flex-col gap-5">
                <Card><CardHeader><CardTitle>Учётная запись клиента</CardTitle><CardDescription>Данные для запуска оригинального клиента.</CardDescription><CardAction><HugeiconsIcon :icon="SmartPhone01Icon" class="size-5 text-muted-foreground" /></CardAction></CardHeader><CardContent><FieldGroup><Field><FieldLabel for="client-username">Логин клиента</FieldLabel><Input id="client-username" v-model="clientUsernameInput" autocomplete="username" /><FieldDescription>Подставляется вместо username из start.bat.</FieldDescription></Field><Field><FieldLabel for="client-password">Пароль клиента</FieldLabel><Input id="client-password" v-model="clientPasswordInput" type="password" autocomplete="new-password" :placeholder="state.clientPasswordSet ? 'Пароль сохранён' : 'Введите пароль'" @keydown.enter="saveClientCredentials" /><FieldDescription>{{ state.clientPasswordSet ? 'Оставьте поле пустым, чтобы сохранить текущий пароль.' : 'Подставляется вместо password из start.bat.' }}</FieldDescription></Field></FieldGroup></CardContent><CardFooter class="justify-between gap-3 border-t"><span class="text-xs text-muted-foreground">Пароль хранится защищённо</span><Button @click="saveClientCredentials">Сохранить учётную запись</Button></CardFooter></Card>
                <Card><CardHeader><CardTitle>Автор изменений</CardTitle><CardDescription>Идентификатор для аудита изменений методов.</CardDescription></CardHeader><CardContent><Field><FieldLabel for="user-id">ID пользователя</FieldLabel><InputGroup><InputGroupInput id="user-id" v-model="userIdInput" type="number" min="0" @keydown.enter="saveUserId" /><InputGroupAddon align="inline-end"><InputGroupButton variant="secondary" @click="saveUserId">Сохранить ID</InputGroupButton></InputGroupAddon></InputGroup></Field></CardContent></Card>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'databases'" aria-label="Профили баз данных" class="flex flex-col gap-5">
            <Card><CardHeader><CardTitle>Профиль подключения</CardTitle><CardDescription>Изменения сохраняются в выбранную секцию rdboadm.ini.</CardDescription></CardHeader><CardContent><FieldGroup class="grid items-start gap-4 lg:grid-cols-2"><Field><FieldLabel for="edit-database-profile">Редактируемая база</FieldLabel><DatabaseProfileSelect v-if="state.databaseProfiles.length" id="edit-database-profile" :model-value="state.databaseProfile" :profiles="state.databaseProfiles" @update:model-value="setDatabaseProfile" /><FieldDescription v-else>{{ state.rdboadmError || 'Откройте папку проекта с bin/rdboadm.ini.' }}</FieldDescription></Field><Field><FieldLabel>Файл конфигурации</FieldLabel><FieldDescription class="break-all">{{ state.rdboadmPath || 'Файл не найден' }}</FieldDescription></Field></FieldGroup></CardContent></Card>
            <div v-if="selectedDatabase" class="grid items-start gap-5 xl:grid-cols-2">
              <Card v-for="group in databaseGroups.filter(group => group.fields.length)" :key="group.title"><CardHeader><CardTitle>{{ group.title }}</CardTitle><CardDescription>{{ group.description }}</CardDescription></CardHeader><CardContent><FieldGroup><Field v-for="field in group.fields" :key="field.key"><div class="flex flex-wrap items-center justify-between gap-2"><FieldLabel :for="'db-' + field.key">{{ databaseLabels[field.key.toLowerCase()] || field.key }}</FieldLabel><Badge variant="outline">{{ field.key }}</Badge></div><Input :id="'db-' + field.key" v-model="field.value" :type="field.key.toLowerCase().includes('password') ? 'password' : 'text'" autocomplete="off" /><FieldDescription>{{ databaseFieldDescriptions[field.key.toLowerCase()] || 'Дополнительный параметр профиля.' }}</FieldDescription></Field></FieldGroup></CardContent></Card>
            </div>
            <div v-if="selectedDatabase" class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-muted-foreground">Сохраняется только профиль {{ selectedDatabase.name }}.</p><Button @click="saveDatabaseProfile">Сохранить профиль</Button></div>
          </section>

          <section v-else-if="activeSection === 'commands'" aria-label="Команды проекта" class="flex flex-col gap-5">
            <div class="grid items-start gap-4 xl:grid-cols-3"><Card v-for="group in commandGroups" :key="group.title"><CardHeader><CardTitle>{{ group.title }}</CardTitle><CardDescription>{{ group.description }}</CardDescription><CardAction><HugeiconsIcon :icon="group.icon" class="size-5 text-muted-foreground" /></CardAction></CardHeader><CardContent><FieldGroup><Field v-for="command in group.commands" :key="command.action"><FieldDescription>{{ command.script }}</FieldDescription><Button :variant="command.action === 'startClient' ? 'default' : 'outline'" @click="runCommand(command.action, 'role' in group ? group.role : undefined)"><HugeiconsIcon v-if="command.action === 'startClient'" :icon="PlayIcon" data-icon="inline-start" />{{ command.label }}</Button></Field></FieldGroup></CardContent></Card></div>
            <Card><CardHeader><CardTitle>Параметры запуска клиента</CardTitle><CardDescription>Аргументы будут добавлены к каждому запуску fme.exe после -NoSelfUpdate.</CardDescription></CardHeader><CardContent><Field><FieldLabel for="client-launch-arguments">Дополнительные аргументы</FieldLabel><Input id="client-launch-arguments" v-model="clientLaunchArgumentsInput" placeholder="-BeautifyPGQueries" autocomplete="off" spellcheck="false" class="font-mono" @input="clientLaunchArgumentsDirty = true" @keydown.enter="saveClientLaunchArguments" /><FieldDescription>Значения с пробелами заключайте в двойные кавычки. Параметры подключения формируются расширением.</FieldDescription></Field></CardContent><CardFooter class="justify-end border-t"><Button :disabled="!clientLaunchArgumentsDirty" @click="saveClientLaunchArguments">Сохранить параметры</Button></CardFooter></Card>
            <Alert><AlertTitle>Обновление проекта</AlertTitle><AlertDescription>Перед обновлением появится подтверждение. Ход выполнения будет показан в терминале.</AlertDescription></Alert>
          </section>

          <section v-else-if="activeSection === 'ai'" aria-label="AI и MCP" class="flex flex-col gap-5">
            <div class="grid items-start gap-5 xl:grid-cols-2">
              <Card><CardHeader><CardTitle>MCP расширения</CardTitle><CardDescription>Инструменты базы и навигации для AI-агентов.</CardDescription><CardAction><Badge :variant="statusVariant">{{ state.mcpStatusText }}</Badge></CardAction></CardHeader><CardContent><FieldGroup><Field orientation="horizontal"><FieldContent><FieldLabel for="mcp-enabled">Разрешить MCP</FieldLabel><FieldDescription>Сервер запускается агентом по требованию.</FieldDescription></FieldContent><Switch id="mcp-enabled" :model-value="state.mcpEnabled" @update:model-value="enabled => vscode.postMessage({ command: 'setMcpEnabled', enabled })" /></Field><Separator /><Field><FieldTitle>Диагностика</FieldTitle><FieldDescription v-if="state.lastExtensionError" class="break-words">{{ new Date(state.lastExtensionError.timestamp).toLocaleString() }} · {{ state.lastExtensionError.source }} · {{ state.lastExtensionError.message }}</FieldDescription><FieldDescription v-else>Ошибок в журнале нет.</FieldDescription></Field></FieldGroup></CardContent><CardFooter class="border-t"><Button variant="ghost" :disabled="!state.lastExtensionError" @click="vscode.postMessage({ command: 'clearExtensionLogs' })">Очистить журнал</Button></CardFooter></Card>
              <Card><CardHeader><CardTitle>Клиентский MCP</CardTitle><CardDescription>Подключение к оригинальному клиенту.</CardDescription><CardAction><Badge :variant="state.clientMcpStatus === 'online' ? 'default' : 'secondary'">{{ clientMcpAction === 'start' ? 'Запуск…' : clientMcpAction === 'stop' ? 'Остановка…' : state.clientMcpStatusText }}</Badge></CardAction></CardHeader><CardContent><div class="bg-muted/50 p-3"><p class="mb-1 text-xs text-muted-foreground">Адрес сервера</p><p class="break-all font-mono text-xs">{{ state.clientMcpUrl }}</p></div><p v-if="state.clientMcpDatabaseMatchesSelection === false" class="mt-3 text-xs text-destructive">Сервер переключается на выбранную базу…</p><Alert v-if="clientMcpActionResult" class="mt-3" :variant="clientMcpActionResult.success ? 'default' : 'destructive'"><AlertTitle>{{ clientMcpActionResult.success ? 'Готово' : 'Ошибка' }}</AlertTitle><AlertDescription>{{ clientMcpActionResult.message }}</AlertDescription></Alert></CardContent><CardFooter class="flex flex-wrap gap-2 border-t"><Button v-if="state.clientMcpStatus === 'offline'" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'startClientMcpServer' })"><Spinner v-if="clientMcpAction === 'start'" data-icon="inline-start" />{{ clientMcpAction === 'start' ? 'Запуск…' : 'Запустить' }}</Button><Button v-else variant="outline" :disabled="Boolean(clientMcpAction)" @click="vscode.postMessage({ command: 'stopClientMcpServer' })"><Spinner v-if="clientMcpAction === 'stop'" data-icon="inline-start" />{{ clientMcpAction === 'stop' ? 'Остановка…' : 'Остановить' }}</Button><Button variant="outline" :disabled="Boolean(clientMcpAction) || checkingClientMcpTools" @click="vscode.postMessage({ command: 'checkClientMcpTools' })"><Spinner v-if="checkingClientMcpTools" data-icon="inline-start" />Проверить инструменты</Button></CardFooter></Card>
            </div>
            <Card><CardHeader><CardTitle>Подключение агента</CardTitle><CardDescription>Скопируйте конфигурацию в настройки вашего AI-клиента. Путь и профиль базы уже подставлены.</CardDescription><CardAction><HugeiconsIcon :icon="AiBrain01Icon" class="size-5 text-muted-foreground" /></CardAction></CardHeader><CardContent><Field><FieldLabel for="mcp-config" class="sr-only">Конфигурация подключения агента</FieldLabel><Textarea id="mcp-config" :model-value="state.mcpConnectionCode" readonly spellcheck="false" class="min-h-56 font-mono" /></Field></CardContent><CardFooter class="flex flex-wrap justify-between gap-3 border-t"><Button variant="ghost" @click="activeSection = 'tools'"><HugeiconsIcon :icon="PlugSocketIcon" data-icon="inline-start" />Каталог инструментов</Button><Button :disabled="!state.mcpEnabled" @click="vscode.postMessage({ command: 'copyMcpConnectionCode', text: state.mcpConnectionCode })"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Скопировать код</Button></CardFooter></Card>
          </section>

          <section v-else-if="activeSection === 'tools'" aria-label="Каталог инструментов" class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-3"><Field class="min-w-48 flex-1"><FieldLabel for="tool-search" class="sr-only">Поиск инструментов</FieldLabel><SearchField id="tool-search" v-model="toolSearch" v-model:options="toolSearchOptions" placeholder="Название или описание инструмента…" /></Field><Button variant="outline" :disabled="Boolean(clientMcpAction) || checkingClientMcpTools" @click="vscode.postMessage({ command: 'checkClientMcpTools' })"><Spinner v-if="checkingClientMcpTools" data-icon="inline-start" />Обновить каталог</Button></div>
            <p v-if="state.clientMcpToolsDatabase" class="text-xs text-muted-foreground">Клиент: {{ state.clientMcpToolsDatabase }}<template v-if="state.clientMcpToolsUpdatedAt"> · обновлено {{ new Date(state.clientMcpToolsUpdatedAt).toLocaleString() }}</template></p>
            <Alert v-if="checkingClientMcpTools"><Spinner /><AlertTitle>Обновляем каталог</AlertTitle><AlertDescription>Получаем инструменты клиентского MCP.</AlertDescription></Alert><Alert v-else-if="state.clientMcpToolsError" variant="destructive"><AlertTitle>Клиент недоступен</AlertTitle><AlertDescription>{{ state.clientMcpToolsError }}</AlertDescription></Alert>
            <div class="grid items-start gap-4 xl:grid-cols-2"><Card v-for="group in toolGroups" :key="group.source"><CardHeader><CardTitle>{{ group.title }}</CardTitle><CardDescription>{{ group.source === 'extension' ? 'Работа с базой и редактором' : 'Возможности оригинального клиента' }}</CardDescription><CardAction><Badge variant="secondary">{{ group.tools.length }}</Badge></CardAction></CardHeader><CardContent class="flex flex-col gap-2"><Button v-for="tool in group.tools" :key="tool.name" :variant="selectedToolKey === group.source + ':' + tool.name ? 'secondary' : 'outline'" class="h-auto w-full justify-start whitespace-normal py-3 text-left" @click="selectTool(group.source, tool.name)"><span class="flex min-w-0 flex-1 flex-col gap-1"><span class="break-all font-mono">{{ tool.name }}</span><span class="line-clamp-2 text-xs font-normal text-muted-foreground">{{ tool.description || 'Описание не указано' }}</span></span><Badge v-if="tool.deprecated" variant="destructive">Deprecated</Badge></Button><Empty v-if="!group.tools.length"><EmptyHeader><EmptyTitle>{{ toolSearch ? 'Ничего не найдено' : 'Каталог пуст' }}</EmptyTitle><EmptyDescription>{{ toolSearch ? 'Попробуйте другое название.' : 'Обновите каталог, чтобы получить список инструментов.' }}</EmptyDescription></EmptyHeader></Empty></CardContent></Card></div>
            <Card v-if="selectedTool"><CardHeader><CardDescription>{{ selectedTool.source }}</CardDescription><CardTitle><span class="break-all font-mono">{{ selectedTool.name }}</span></CardTitle></CardHeader><CardContent><p class="whitespace-pre-wrap break-words text-sm leading-relaxed">{{ selectedTool.description || 'Описание не указано.' }}</p></CardContent></Card>
          </section>
        </template>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
