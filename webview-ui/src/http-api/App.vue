<script setup lang="ts">
import type { SettingsHostMessage, SettingsState } from '../../../src/core/webviewProtocol';
import { parseHttpMethodDocumentation } from '../../../src/features/http-api/httpParameterDocumentation';
import { AlertCircleIcon, ApiIcon, ArrowDown01Icon, CheckmarkCircle02Icon, Clock01Icon, Copy01Icon, Delete02Icon, PlayIcon, SourceCodeIcon, StopIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';
import { computed, ref } from 'vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import HttpVerbSelect from './HttpVerbSelect.vue';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import DateTimePicker from '@/components/DateTimePicker.vue';
import JsonResponseEditor from '@/components/JsonResponseEditor.vue';
import { vscode } from '@/vscode';

type Parameter = {
  name: string;
  requestName: string;
  type: string;
  value: string;
  defaultValue: string;
  required: boolean;
  enabled: boolean;
  suggestions: Array<{ id: number; name: string }>;
  suggestionQuery: string;
  lookupOpen: boolean;
  lookupLoading: boolean;
  referenceType?: string;
  description?: string;
};
type Response = { status: number; statusText: string; durationMs: number; headers: Record<string, string>; body: string };
type ApiRequest = { method: string; url: string; headers: Record<string, string>; body?: string };
type RequestSource = 'method' | 'manual';
type HistoryEntry = {
  id: string;
  timestamp: string;
  source: RequestSource;
  label: string;
  request: ApiRequest;
  response?: Pick<Response, 'status' | 'statusText' | 'durationMs'>;
  error?: string;
};
type PersistedState = { history?: HistoryEntry[] };

const persistedState = vscode.getState() as PersistedState | undefined;
const state = ref<SettingsState>();
const selectedMethodName = ref('');
const parameters = ref<Parameter[]>([]);
const requestMethod = ref('GET');
const manualUrl = ref('');
const manualHeaders = ref('{\n  "Accept": "application/json"\n}');
const manualBody = ref('');
const activeRequestTab = ref<RequestSource | 'history'>('method');
const responseTab = ref('body');
const busy = ref(false);
const serverAction = ref<'start' | 'stop'>();
const result = ref<{ response?: Response; error?: string }>();
const activeRequest = ref<{ request: ApiRequest; source: RequestSource; label: string }>();
const history = ref<HistoryEntry[]>(Array.isArray(persistedState?.history) ? persistedState.history.slice(0, 30) : []);
const methodPickerOpen = ref(false);
const touchedParameters = ref(new Set<string>());
const selectedMethod = computed(() => state.value?.httpMethods.find(item => item.name === selectedMethodName.value));
const selectedMethodDescription = computed(() => parseHttpMethodDocumentation(selectedMethod.value?.description ?? '').description);
const serverUrl = computed(() => state.value?.httpTestServer?.url ?? '');
const responseHeaders = computed(() => Object.entries(result.value?.response?.headers ?? {}).sort(([left], [right]) => left.localeCompare(right)));
const formattedResponseBody = computed(() => {
  const body = result.value?.response?.body ?? '';
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
});
const manualHeadersError = computed(() => validateHeaders(manualHeaders.value));
const manualBodyError = computed(() => validateManualBody());
const parameterErrors = computed(() => parameters.value.map(parameter => parameterError(parameter)).filter((error): error is string => Boolean(error)));
const generatedRequest = computed(() => parameterErrors.value.length ? undefined : buildGeneratedRequest());
const requiredRemaining = computed(() => parameters.value.filter(parameter => parameter.enabled && parameter.required && !parameter.value.trim()).length);
const visibleParameterErrors = computed(() => parameters.value.map(parameter => visibleParameterError(parameter)).filter((error): error is string => Boolean(error)));
let valueSearchTimer: ReturnType<typeof setTimeout> | undefined;

function visibleParameterError(parameter: Parameter): string | undefined {
  return touchedParameters.value.has(parameter.name) || parameter.value.trim() ? parameterError(parameter) : undefined;
}

function isJsonParameter(parameter: Parameter): boolean { return parameter.requestName !== parameter.name; }
function publicMethodDescription(description: string): string { return parseHttpMethodDocumentation(description).description; }
function isReferenceParameter(parameter: Parameter): boolean {
  return !isJsonParameter(parameter) && (Boolean(parameter.referenceType) || !/^(?:string|integer|int64|double|extended|currency|boolean|bool|date|datetime|time|variant|olevariant)$/iu.test(parameter.type));
}
function isNumberParameter(parameter: Parameter): boolean { return /^(?:integer|int64|double|extended|currency)$/iu.test(parameter.type); }
function isBooleanParameter(parameter: Parameter): boolean { return /^(?:boolean|bool)$/iu.test(parameter.type); }
function isDateParameter(parameter: Parameter): boolean { return /^(?:date|datetime)$/iu.test(parameter.type); }
function isDateTimeParameter(parameter: Parameter): boolean { return /^datetime$/iu.test(parameter.type); }
function isTimeParameter(parameter: Parameter): boolean { return /^time$/iu.test(parameter.type); }

function isRecognizedDate(value: string): boolean {
  const local = value.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/u);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:Z|[+-]\d{2}:?\d{2})?$/u);
  const match = local ?? iso;
  if (!match) return false;
  const year = Number(match[local ? 3 : 1]);
  const month = Number(match[2]);
  const day = Number(match[local ? 1 : 3]);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && hours <= 23 && minutes <= 59 && seconds <= 59;
}

function parameterError(parameter: Parameter): string | undefined {
  if (!parameter.enabled) { return undefined; }
  const value = parameter.value.trim();
  if (parameter.required && !value) { return `${parameter.requestName}: укажите обязательное значение.`; }
  if (!value) { return undefined; }
  if (isJsonParameter(parameter)) {
    try { JSON.parse(value); } catch { return `${parameter.requestName}: некорректный JSON.`; }
  } else if (isReferenceParameter(parameter) && !/^[1-9]\d*$/u.test(value)) {
    return `${parameter.requestName}: выберите объект или укажите его числовой ID.`;
  } else if (isNumberParameter(parameter) && !/^-?\d+(?:[.,]\d+)?$/u.test(value)) {
    return `${parameter.requestName}: ожидается число.`;
  } else if (isBooleanParameter(parameter) && !/^(?:true|false)$/iu.test(value)) {
    return `${parameter.requestName}: ожидается true или false.`;
  } else if (isDateParameter(parameter) && !isRecognizedDate(value)) {
    return `${parameter.requestName}: дата или время не распознаны.`;
  } else if (isTimeParameter(parameter) && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u.test(value)) {
    return `${parameter.requestName}: ожидается время в формате ЧЧ:ММ или ЧЧ:ММ:СС.`;
  }
  return undefined;
}

function validateHeaders(value: string): string | undefined {
  if (!value.trim()) { return undefined; }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') { return 'Заголовки должны быть JSON-объектом.'; }
    if (Object.values(parsed as Record<string, unknown>).some(item => typeof item !== 'string')) { return 'Значения заголовков должны быть строками.'; }
  } catch { return 'Заголовки должны быть корректным JSON-объектом.'; }
  return undefined;
}

function validateManualBody(): string | undefined {
  if (!manualBody.value.trim() || manualHeadersError.value) { return undefined; }
  const headers = manualHeaders.value.trim() ? JSON.parse(manualHeaders.value) as Record<string, string> : {};
  const contentType = Object.entries(headers).find(([name]) => name.toLocaleLowerCase('en') === 'content-type')?.[1] ?? '';
  if (!/json/iu.test(contentType)) { return undefined; }
  try { JSON.parse(manualBody.value); return undefined; }
  catch { return 'Content-Type содержит JSON, но тело запроса не является корректным JSON.'; }
}

function searchParameterValues(parameter: Parameter, showAll = false): void {
  parameter.suggestions = [];
  if (!parameter.enabled || !isReferenceParameter(parameter) || (!showAll && !parameter.value.trim())) { return; }
  parameter.lookupOpen = true;
  parameter.lookupLoading = true;
  if (valueSearchTimer) { clearTimeout(valueSearchTimer); }
  valueSearchTimer = setTimeout(() => {
    parameter.suggestionQuery = showAll ? '' : parameter.value.trim();
    vscode.postMessage({ command: 'searchHttpParameterValues', parameter: parameter.name, typeName: parameter.referenceType ?? parameter.type, query: parameter.suggestionQuery });
  }, 250);
}

function chooseParameterValue(parameter: Parameter, id: number): void {
  parameter.value = String(id);
  parameter.suggestions = [];
  parameter.lookupOpen = false;
}

function parseParameters(signature: string, description: string): Parameter[] {
  const documentation = parseHttpMethodDocumentation(description).parameters;
  const source = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
  if (!source || signature.indexOf('(') < 0 || signature.lastIndexOf(')') < 0) { return []; }
  return source.split(';').flatMap(group => {
    const match = group.trim().match(/^(?:(?:const|var|out)\s+)?([^:]+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/iu);
    if (!match) { return []; }
    const type = match[2].trim();
    const hasDefault = match[3] !== undefined;
    return match[1].split(',').map(name => {
      const normalizedName = name.trim();
      const parameterDocumentation = documentation.get(normalizedName.toLocaleLowerCase('ru'));
      const defaultValue = match[3]?.trim() ?? '';
      const value = /^(?:nil|null|'')$/iu.test(defaultValue) ? '' : defaultValue;
      return {
        name: normalizedName,
        requestName: /^wDynamicStorage$/iu.test(type) ? `${normalizedName}.json` : normalizedName,
        type,
        value,
        defaultValue: value,
        required: !hasDefault,
        enabled: !hasDefault || Boolean(value),
        suggestions: [],
        suggestionQuery: '',
        lookupOpen: false,
        lookupLoading: false,
        referenceType: parameterDocumentation?.referenceType,
        description: parameterDocumentation?.description,
      };
    }).filter(item => item.name);
  });
}

function chooseMethod(name: string): void {
  touchedParameters.value.clear();
  selectedMethodName.value = name;
  const method = state.value?.httpMethods.find(item => item.name === name);
  parameters.value = parseParameters(method?.signature ?? '', method?.description ?? '');
  methodPickerOpen.value = false;
}

function resetParameters(): void {
  touchedParameters.value.clear();
  parameters.value.forEach(parameter => {
    parameter.value = parameter.defaultValue;
    parameter.enabled = parameter.required || Boolean(parameter.defaultValue);
    parameter.suggestions = [];
    parameter.lookupOpen = false;
  });
}

function startServer(all = false): void {
  vscode.postMessage({ command: 'startHttpTestServer', methodName: all ? '*' : selectedMethodName.value });
}

function parseValue(parameter: Parameter): unknown {
  const value = parameter.value.trim();
  if (!value) { return ''; }
  if (/^(true|false)$/iu.test(value)) { return value.toLocaleLowerCase('en') === 'true'; }
  if (/^-?\d+(?:[.,]\d+)?$/u.test(value)) { return Number(value.replace(',', '.')); }
  if (/^(null|nil)$/iu.test(value)) { return null; }
  if (/^[\[{]/u.test(value)) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function buildGeneratedRequest(): ApiRequest | undefined {
  if (!serverUrl.value || !selectedMethodName.value) { return undefined; }
  const payload = Object.fromEntries(parameters.value.filter(parameter => parameter.enabled).map(parameter => [parameter.requestName, parseValue(parameter)]));
  const url = new URL(serverUrl.value);
  url.searchParams.set('method', selectedMethodName.value);
  Object.entries(payload).forEach(([key, value]) => url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value)));
  return { method: requestMethod.value, url: url.toString(), headers: { Accept: 'application/json' } };
}

function executeRequest(request: ApiRequest, source: RequestSource, label: string): void {
  activeRequest.value = { request, source, label };
  responseTab.value = 'body';
  vscode.postMessage({ command: 'executeHttpApiRequest', ...request });
}

function sendGeneratedRequest(): void {
  if (generatedRequest.value) { executeRequest(generatedRequest.value, 'method', selectedMethodName.value); }
}

function openSelectedMethod(): void {
  if (selectedMethod.value) { vscode.postMessage({ command: 'openDatabaseObjectById', id: selectedMethod.value.methodId, target: 'object' }); }
}

function buildManualRequest(): ApiRequest | undefined {
  if (manualHeadersError.value || manualBodyError.value || !manualUrl.value.trim()) { return undefined; }
  const headers = manualHeaders.value.trim() ? JSON.parse(manualHeaders.value) as Record<string, string> : {};
  return { method: requestMethod.value, url: manualUrl.value.trim(), headers, ...(['GET', 'HEAD'].includes(requestMethod.value) ? {} : { body: manualBody.value }) };
}

function sendManualRequest(): void {
  const request = buildManualRequest();
  if (request) {
    let label = request.url;
    try { label = new URL(request.url).pathname || request.url; } catch { /* Host validation reports the URL error. */ }
    executeRequest(request, 'manual', label);
  }
}

function shellQuote(value: string): string { return `'${value.replace(/'/gu, `'"'"'`)}'`; }
function copyText(text: string, notification: string): void { vscode.postMessage({ command: 'copyHttpApiRequest', text, notification }); }

function copyForPostman(request: ApiRequest | undefined): void {
  if (!request) { return; }
  const parts = [`curl --request ${shellQuote(request.method)}`, `--url ${shellQuote(request.url)}`];
  for (const [name, value] of Object.entries(request.headers)) { parts.push(`--header ${shellQuote(`${name}: ${value}`)}`); }
  if (request.body !== undefined) { parts.push(`--data-raw ${shellQuote(request.body)}`); }
  copyText(parts.join(' \\\n  '), 'Запрос cURL скопирован.');
}

function copyManualRequestForPostman(): void { copyForPostman(buildManualRequest()); }

function safeHistoryRequest(request: ApiRequest): ApiRequest {
  const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, /^(?:authorization|cookie|set-cookie|x-api-key)$/iu.test(name) ? '[скрыто]' : value]));
  const body = request.body && request.body.length > 65_536 ? `${request.body.slice(0, 65_536)}\n…` : request.body;
  return { ...request, headers, ...(body === undefined ? {} : { body }) };
}

function saveHistory(entry: HistoryEntry): void {
  history.value = [entry, ...history.value].slice(0, 30);
  vscode.setState({ history: history.value } satisfies PersistedState);
}

function completeHistory(response?: Response, error?: string): void {
  if (!activeRequest.value) { return; }
  saveHistory({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    source: activeRequest.value.source,
    label: activeRequest.value.label,
    request: safeHistoryRequest(activeRequest.value.request),
    ...(response ? { response: { status: response.status, statusText: response.statusText, durationMs: response.durationMs } } : {}),
    ...(error ? { error } : {}),
  });
  activeRequest.value = undefined;
}

function loadHistoryEntry(entry: HistoryEntry): void {
  activeRequestTab.value = 'manual';
  requestMethod.value = entry.request.method;
  manualUrl.value = entry.request.url;
  manualHeaders.value = JSON.stringify(entry.request.headers, null, 2);
  manualBody.value = entry.request.body ?? '';
  result.value = undefined;
}

function clearHistory(): void {
  history.value = [];
  vscode.setState({ history: [] } satisfies PersistedState);
}

function formatHistoryTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function openDatabaseObject(id: number): void { vscode.postMessage({ command: 'openDatabaseObjectById', id, target: 'object' }); }

window.addEventListener('message', (event: MessageEvent<SettingsHostMessage>) => {
  const message = event.data;
  if (message.command === 'settingsState') {
    state.value = message.state;
    if (!selectedMethodName.value && message.state.httpMethods[0]) { chooseMethod(message.state.httpMethods[0].name); }
    if (message.state.httpTestServer && !manualUrl.value) { manualUrl.value = message.state.httpTestServer.url; }
  } else if (message.command === 'httpApiRequestStarted') {
    busy.value = true;
    result.value = undefined;
  } else if (message.command === 'httpApiRequestFinished') {
    busy.value = false;
    result.value = message.success ? { response: message.response } : { error: message.message };
    completeHistory(message.success ? message.response : undefined, message.success ? undefined : message.message);
  } else if (message.command === 'httpTestServerActionStarted') {
    serverAction.value = message.action;
  } else if (message.command === 'httpTestServerActionFinished') {
    serverAction.value = undefined;
    if (!message.success) { result.value = { error: message.message }; }
  } else if (message.command === 'httpParameterValuesLoaded') {
    const parameter = parameters.value.find(item => item.name === message.parameter);
    if (parameter && parameter.suggestionQuery === message.query) {
      parameter.suggestions = message.values;
      parameter.lookupLoading = false;
      parameter.lookupOpen = true;
    }
  }
});

vscode.postMessage({ command: 'settingsReady' });
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-5 bg-background p-4 text-foreground lg:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <p class="text-xs text-muted-foreground">Восточный Экспресс / Инструменты</p>
        <h1 class="text-2xl font-semibold tracking-tight">HTTP API</h1><p class="text-xs text-muted-foreground">Выберите метод, настройте запрос и исследуйте ответ</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-if="state?.httpTestServer" variant="outline">База · {{ state.httpTestServer.database }}</Badge>
        <Badge :variant="state?.httpTestServer ? 'default' : 'secondary'"><HugeiconsIcon v-if="state?.httpTestServer" :icon="CheckmarkCircle02Icon" data-icon="inline-start" />{{ state?.httpTestServer ? 'Сервер запущен' : 'Сервер остановлен' }}</Badge>
      </div>
    </header>

    <Card>
      <CardHeader><CardTitle>Подключение</CardTitle><CardDescription>{{ serverUrl ? 'Тестовый сервер готов принимать запросы.' : 'Для вызова методов запустите тестовый сервер.' }}</CardDescription><CardAction class="flex flex-wrap gap-2">
        <Button v-if="!state?.httpTestServer" :disabled="Boolean(serverAction) || !selectedMethodName" @click="startServer(false)"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ serverAction === 'start' ? 'Запуск…' : 'Запустить выбранный' }}</Button>
        <Button v-if="!state?.httpTestServer" variant="outline" :disabled="Boolean(serverAction) || !state?.httpMethods.length" @click="startServer(true)">Запустить все</Button>
        <Button v-else variant="outline" :disabled="Boolean(serverAction)" @click="vscode.postMessage({ command: 'stopHttpTestServer' })"><HugeiconsIcon :icon="StopIcon" data-icon="inline-start" />{{ serverAction === 'stop' ? 'Остановка…' : 'Остановить' }}</Button>
      </CardAction></CardHeader>
      <CardContent><div class="flex flex-wrap items-center gap-3 bg-muted/50 px-3 py-2"><Badge variant="outline">Endpoint</Badge><span class="min-w-0 flex-1 break-all font-mono text-xs">{{ serverUrl || 'Адрес появится после запуска сервера' }}</span><Button v-if="serverUrl" size="icon-xs" variant="ghost" aria-label="Копировать адрес сервера" @click="copyText(serverUrl, 'Адрес сервера скопирован.')"><HugeiconsIcon :icon="Copy01Icon" /></Button></div></CardContent>
    </Card>

    <div class="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
    <section aria-label="Редактор запроса" class="min-w-0">
    <Tabs v-model="activeRequestTab" class="flex min-w-0 flex-col gap-3">
      <TabsList><TabsTrigger value="method">Метод</TabsTrigger><TabsTrigger value="manual">Ручной запрос</TabsTrigger><TabsTrigger value="history">История <Badge variant="secondary">{{ history.length }}</Badge></TabsTrigger></TabsList>

      <TabsContent value="method" class="mt-0 min-w-0">
        <Card>
          <CardHeader class="gap-3 border-b"><div class="flex items-center justify-between gap-3"><CardTitle>Запрос к методу</CardTitle><Badge variant="outline">{{ state?.httpMethods.length ?? 0 }} методов</Badge></div>
          <Field><FieldLabel class="sr-only" for="http-method-picker">Метод API</FieldLabel>
        <Popover v-model:open="methodPickerOpen">
          <PopoverTrigger as-child><Button id="http-method-picker" variant="outline" class="w-full min-w-0 justify-between" aria-label="Выбрать метод API"><span class="truncate">{{ selectedMethodName || 'Выберите HTTP-метод' }}</span><HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" /></Button></PopoverTrigger>
          <PopoverContent class="w-[min(28rem,calc(100vw-3rem))] p-0" align="start">
            <Command :model-value="selectedMethodName"><CommandInput placeholder="Название, описание или сигнатура…" /><CommandList><CommandEmpty>Методы не найдены</CommandEmpty><CommandGroup :heading="`${state?.httpMethods.length ?? 0} методов`">
              <CommandItem v-for="method in state?.httpMethods ?? []" :key="method.id" :value="`${method.name} ${method.description} ${method.signature}`" @select="chooseMethod(method.name)"><div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ method.name }}</span><span class="truncate text-muted-foreground">{{ publicMethodDescription(method.description) || method.signature }}</span></div><Badge variant="outline">{{ method.id }}</Badge></CommandItem>
            </CommandGroup></CommandList></Command>
          </PopoverContent>
        </Popover>
          </Field>
          <CardDescription>{{ selectedMethod ? selectedMethodDescription || 'Параметры запроса определены сигнатурой метода.' : 'Выберите метод из каталога, чтобы настроить параметры.' }}</CardDescription>
          <div v-if="selectedMethod" class="flex flex-wrap items-center gap-2"><Badge variant="outline">HTTP ID {{ selectedMethod.id }}</Badge><Badge variant="outline">Метод ID {{ selectedMethod.methodId }}</Badge><Button variant="ghost" size="sm" class="ml-auto" @click="openSelectedMethod"><HugeiconsIcon :icon="SourceCodeIcon" data-icon="inline-start" />Открыть код</Button></div>
          </CardHeader>
          <CardContent v-if="selectedMethod" class="flex min-w-0 flex-col gap-4">
            <div class="bg-muted/50 p-3"><p class="mb-1 text-xs text-muted-foreground">Сигнатура</p><pre class="whitespace-pre-wrap break-all font-mono text-xs">{{ selectedMethod.signature }}</pre></div>
            <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-sm font-medium">Параметры <span class="text-muted-foreground">{{ parameters.length }}</span></h2><span v-if="requiredRemaining" class="text-xs text-muted-foreground">Осталось заполнить: {{ requiredRemaining }}</span></div>
            <FieldGroup class="gap-4">
              <Field v-for="parameter in parameters" :key="parameter.name" :data-invalid="Boolean(visibleParameterError(parameter))" :data-disabled="!parameter.enabled" @focusout="touchedParameters.add(parameter.name)">
                <div class="flex flex-wrap items-center gap-2"><Checkbox v-if="!parameter.required" :id="`enable-${parameter.name}`" v-model="parameter.enabled" :aria-label="`Передавать параметр ${parameter.requestName}`" /><FieldLabel :for="`parameter-${parameter.name}`">{{ parameter.requestName }}</FieldLabel><Badge variant="outline">{{ isJsonParameter(parameter) ? 'JSON' : parameter.referenceType || parameter.type }}</Badge><span v-if="parameter.required" class="ml-auto text-xs text-muted-foreground">Обязательный</span></div>
                    <Textarea v-if="isJsonParameter(parameter)" :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(visibleParameterError(parameter))" class="min-h-16 resize-y font-mono" placeholder="{}" />
                    <Popover v-else-if="isReferenceParameter(parameter)" v-model:open="parameter.lookupOpen"><PopoverAnchor as-child><Input :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(visibleParameterError(parameter))" :placeholder="`ID объекта ${parameter.referenceType ?? parameter.type}…`" autocomplete="off" @focus="searchParameterValues(parameter, true)" @input="searchParameterValues(parameter)" /></PopoverAnchor><PopoverContent class="w-[min(26rem,calc(100vw-4rem))] p-0" align="start"><Empty v-if="parameter.lookupLoading || !parameter.suggestions.length" class="border-0"><EmptyHeader><EmptyTitle>{{ parameter.lookupLoading ? 'Загрузка…' : 'Объекты не найдены' }}</EmptyTitle><EmptyDescription v-if="!parameter.lookupLoading">Измените запрос или укажите числовой ID.</EmptyDescription></EmptyHeader></Empty><Command v-else><CommandList><CommandGroup :heading="parameter.referenceType ?? parameter.type"><CommandItem v-for="item in parameter.suggestions" :key="item.id" :value="`${item.id} ${item.name}`" @select="chooseParameterValue(parameter, item.id)"><span class="truncate">{{ item.name }}</span><Badge variant="outline">{{ item.id }}</Badge></CommandItem></CommandGroup></CommandList></Command></PopoverContent></Popover>
                    <DateTimePicker v-else-if="isDateTimeParameter(parameter)" :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :invalid="Boolean(visibleParameterError(parameter))" :label="`Выбрать дату и время для ${parameter.requestName}`" />
                    <Input v-else :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(visibleParameterError(parameter))" :placeholder="parameter.type" />
                    <FieldDescription v-if="parameter.description">{{ parameter.description }}</FieldDescription>
                    <FieldError v-if="visibleParameterError(parameter)">{{ visibleParameterError(parameter) }}</FieldError>
                  </Field>
            </FieldGroup>
            <Empty v-if="!parameters.length" class="border-0"><EmptyHeader><EmptyTitle>Нет параметров</EmptyTitle><EmptyDescription>Метод можно отправить без дополнительных значений.</EmptyDescription></EmptyHeader></Empty>
            <Separator />
            <Field v-if="generatedRequest"><FieldLabel for="generated-url">Итоговый URL</FieldLabel><Input id="generated-url" :model-value="generatedRequest.url" readonly class="font-mono" /></Field>
            <p v-else-if="!serverUrl" class="text-xs text-muted-foreground">Запустите сервер, чтобы отправить запрос.</p>
            <Alert v-if="visibleParameterErrors.length" variant="destructive"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Проверьте параметры</AlertTitle><AlertDescription>{{ visibleParameterErrors.join(' ') }}</AlertDescription></Alert>
          </CardContent>
          <CardFooter v-if="selectedMethod" class="flex flex-wrap gap-2 border-t"><HttpVerbSelect v-model="requestMethod" :verbs="['GET', 'POST', 'PUT', 'PATCH', 'DELETE']" /><Button :disabled="busy || !generatedRequest" @click="sendGeneratedRequest"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ busy ? 'Отправка…' : 'Отправить' }}</Button><Button variant="outline" :disabled="!generatedRequest" @click="copyForPostman(generatedRequest)"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />cURL</Button><Button variant="ghost" :disabled="busy" @click="resetParameters">Сбросить значения</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="manual" class="mt-0">
        <Card>
          <CardHeader><CardTitle>Ручной запрос</CardTitle><CardDescription>Полный контроль над URL, заголовками и телом запроса.</CardDescription></CardHeader>
          <CardContent><FieldGroup><Field><FieldLabel for="manual-url">URL</FieldLabel><Input id="manual-url" v-model="manualUrl" class="font-mono" placeholder="http://127.0.0.1:8080/api" /></Field><Field :data-invalid="Boolean(manualHeadersError)"><FieldLabel for="manual-headers">Заголовки JSON</FieldLabel><Textarea id="manual-headers" v-model="manualHeaders" :aria-invalid="Boolean(manualHeadersError)" class="min-h-24 font-mono" /><FieldError v-if="manualHeadersError">{{ manualHeadersError }}</FieldError></Field><Field v-if="!['GET', 'HEAD'].includes(requestMethod)" :data-invalid="Boolean(manualBodyError)"><FieldLabel for="manual-body">Тело запроса</FieldLabel><Textarea id="manual-body" v-model="manualBody" :aria-invalid="Boolean(manualBodyError)" class="min-h-40 font-mono" /><FieldDescription>Для JSON добавьте заголовок Content-Type: application/json.</FieldDescription><FieldError v-if="manualBodyError">{{ manualBodyError }}</FieldError></Field></FieldGroup></CardContent>
          <CardFooter class="flex flex-wrap gap-2 border-t"><HttpVerbSelect v-model="requestMethod" :verbs="['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']" /><Button :disabled="busy || !buildManualRequest()" @click="sendManualRequest"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ busy ? 'Отправка…' : 'Отправить' }}</Button><Button variant="outline" :disabled="!buildManualRequest()" @click="copyManualRequestForPostman"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />cURL</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="history" class="mt-0">
        <Card>
          <CardHeader><CardTitle>История запросов</CardTitle><CardDescription>Последние 30 запросов. Выберите запись, чтобы снова открыть её в редакторе.</CardDescription><CardAction><Button variant="outline" size="sm" :disabled="!history.length" @click="clearHistory"><HugeiconsIcon :icon="Delete02Icon" data-icon="inline-start" />Очистить</Button></CardAction></CardHeader>
          <CardContent v-if="history.length" class="p-0"><Table><TableHeader><TableRow><TableHead>Время</TableHead><TableHead>Запрос</TableHead><TableHead>Результат</TableHead><TableHead class="w-24"><span class="sr-only">Действия</span></TableHead></TableRow></TableHeader><TableBody><TableRow v-for="entry in history" :key="entry.id"><TableCell class="whitespace-nowrap text-muted-foreground">{{ formatHistoryTime(entry.timestamp) }}</TableCell><TableCell><div class="flex min-w-0 flex-col"><span class="truncate font-medium">{{ entry.request.method }} · {{ entry.label }}</span><span class="max-w-xl truncate text-muted-foreground" :title="entry.request.url">{{ entry.request.url }}</span></div></TableCell><TableCell><Badge v-if="entry.response" :variant="entry.response.status >= 400 ? 'destructive' : 'secondary'">{{ entry.response.status }} · {{ entry.response.durationMs }} мс</Badge><Badge v-else variant="destructive">Ошибка</Badge></TableCell><TableCell><Button variant="ghost" size="sm" @click="loadHistoryEntry(entry)">В форму</Button></TableCell></TableRow></TableBody></Table></CardContent>
          <CardContent v-else><Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="Clock01Icon" /></EmptyMedia><EmptyTitle>История пуста</EmptyTitle><EmptyDescription>Здесь появятся выполненные запросы, их статус и время ответа.</EmptyDescription></EmptyHeader></Empty></CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    </section>

    <section aria-label="Результат запроса" class="min-w-0 xl:sticky xl:top-6 xl:pt-10">
    <Card class="min-h-96">
      <CardHeader><CardTitle>Ответ</CardTitle><CardDescription v-if="result?.response">{{ result.response.durationMs }} мс · {{ result.response.body.length.toLocaleString('ru-RU') }} символов · {{ responseHeaders.length }} заголовков</CardDescription><CardDescription v-else-if="result?.error" class="text-destructive">Запрос завершился ошибкой</CardDescription><CardDescription v-else>Результат следующего запроса появится здесь.</CardDescription><CardAction v-if="result?.response" class="flex items-center gap-2"><Badge :variant="result.response.status >= 400 ? 'destructive' : 'secondary'">{{ result.response.status }} {{ result.response.statusText }}</Badge><Button variant="outline" size="sm" @click="copyText(formattedResponseBody, 'Ответ скопирован.')"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Копировать</Button></CardAction></CardHeader>
      <CardContent v-if="result?.response"><Tabs v-model="responseTab"><TabsList variant="line"><TabsTrigger value="body">Body</TabsTrigger><TabsTrigger value="headers">Headers <Badge variant="secondary">{{ responseHeaders.length }}</Badge></TabsTrigger><TabsTrigger value="raw">Raw</TabsTrigger></TabsList><TabsContent value="body"><JsonResponseEditor class="h-[28rem]" :model-value="formattedResponseBody" @open-object="openDatabaseObject" /></TabsContent><TabsContent value="headers"><Table><TableHeader><TableRow><TableHead class="w-64">Заголовок</TableHead><TableHead>Значение</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="([name, value]) in responseHeaders" :key="name"><TableCell class="font-medium">{{ name }}</TableCell><TableCell class="break-all font-mono">{{ value }}</TableCell></TableRow></TableBody></Table></TabsContent><TabsContent value="raw"><Textarea :model-value="result.response.body" readonly class="min-h-64 resize-y font-mono" aria-label="Ответ без форматирования" /></TabsContent></Tabs></CardContent>
      <CardContent v-else-if="result?.error"><Alert variant="destructive"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Не удалось выполнить запрос</AlertTitle><AlertDescription>{{ result.error }}</AlertDescription></Alert></CardContent>
      <CardContent v-else-if="busy" class="flex flex-col gap-3"><p class="text-xs text-muted-foreground" role="status">Ожидаем ответ сервера…</p><Skeleton class="h-5 w-2/3" /><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-4/5" /></CardContent>
      <CardContent v-else class="flex flex-1 items-center justify-center"><Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="ApiIcon" /></EmptyMedia><EmptyTitle>Готов к первому запросу</EmptyTitle><EmptyDescription>Здесь появятся статус, время выполнения и содержимое ответа.</EmptyDescription></EmptyHeader></Empty></CardContent>
    </Card>
    </section>
    </div>
  </main>
</template>
