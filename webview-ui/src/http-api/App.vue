<script setup lang="ts">
import type { SettingsHostMessage, SettingsState } from '../../../src/core/webviewProtocol';
import { AlertCircleIcon, ApiIcon, ArrowDown01Icon, CheckmarkCircle02Icon, Clock01Icon, Copy01Icon, Delete02Icon, PlayIcon, StopIcon } from '@hugeicons/core-free-icons';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
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
const selectedMethod = computed(() => state.value?.httpMethods.find(item => item.name === selectedMethodName.value));
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
let valueSearchTimer: ReturnType<typeof setTimeout> | undefined;

function isJsonParameter(parameter: Parameter): boolean { return parameter.requestName !== parameter.name; }
function isReferenceParameter(parameter: Parameter): boolean {
  return !isJsonParameter(parameter) && !/^(?:string|integer|int64|double|extended|currency|boolean|bool|date|datetime|time|variant|olevariant)$/iu.test(parameter.type);
}
function isNumberParameter(parameter: Parameter): boolean { return /^(?:integer|int64|double|extended|currency)$/iu.test(parameter.type); }
function isBooleanParameter(parameter: Parameter): boolean { return /^(?:boolean|bool)$/iu.test(parameter.type); }
function isDateParameter(parameter: Parameter): boolean { return /^(?:date|datetime)$/iu.test(parameter.type); }
function isTimeParameter(parameter: Parameter): boolean { return /^time$/iu.test(parameter.type); }

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
  } else if (isDateParameter(parameter) && Number.isNaN(Date.parse(value)) && !/^\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/u.test(value)) {
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
    vscode.postMessage({ command: 'searchHttpParameterValues', parameter: parameter.name, typeName: parameter.type, query: parameter.suggestionQuery });
  }, 250);
}

function chooseParameterValue(parameter: Parameter, id: number): void {
  parameter.value = String(id);
  parameter.suggestions = [];
  parameter.lookupOpen = false;
}

function parseParameters(signature: string): Parameter[] {
  const source = signature.slice(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
  if (!source || signature.indexOf('(') < 0 || signature.lastIndexOf(')') < 0) { return []; }
  return source.split(';').flatMap(group => {
    const match = group.trim().match(/^(?:(?:const|var|out)\s+)?([^:]+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/iu);
    if (!match) { return []; }
    const type = match[2].trim();
    const hasDefault = match[3] !== undefined;
    return match[1].split(',').map(name => {
      const normalizedName = name.trim();
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
      };
    }).filter(item => item.name);
  });
}

function chooseMethod(name: string): void {
  selectedMethodName.value = name;
  parameters.value = parseParameters(state.value?.httpMethods.find(item => item.name === name)?.signature ?? '');
  methodPickerOpen.value = false;
}

function resetParameters(): void {
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
  <main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <HugeiconsIcon :icon="ApiIcon" />
        <div class="min-w-0"><h1 class="text-lg font-semibold tracking-tight">HTTP API</h1><p class="truncate text-sm text-muted-foreground">Интерактивная проверка методов Восточного Экспресса</p></div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Badge v-if="state?.httpTestServer" variant="outline">База · {{ state.httpTestServer.database }}</Badge>
        <Badge :variant="state?.httpTestServer ? 'default' : 'secondary'"><HugeiconsIcon v-if="state?.httpTestServer" :icon="CheckmarkCircle02Icon" data-icon="inline-start" />{{ state?.httpTestServer ? 'Сервер запущен' : 'Сервер остановлен' }}</Badge>
      </div>
    </header>

    <Card size="sm">
      <CardHeader><CardTitle>Тестовый сервер</CardTitle><CardDescription>Запустите выбранный метод изолированно или откройте весь каталог API.</CardDescription></CardHeader>
      <CardContent class="flex flex-wrap items-center gap-2">
        <Popover v-model:open="methodPickerOpen">
          <PopoverTrigger as-child><Button variant="outline" class="min-w-0 justify-between sm:w-96"><span class="truncate">{{ selectedMethodName || 'Выберите HTTP-метод' }}</span><HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" /></Button></PopoverTrigger>
          <PopoverContent class="w-[min(28rem,calc(100vw-3rem))] p-0" align="start">
            <Command :model-value="selectedMethodName"><CommandInput placeholder="Название, описание или сигнатура…" /><CommandList><CommandEmpty>Методы не найдены</CommandEmpty><CommandGroup :heading="`${state?.httpMethods.length ?? 0} методов`">
              <CommandItem v-for="method in state?.httpMethods ?? []" :key="method.id" :value="`${method.name} ${method.description} ${method.signature}`" @select="chooseMethod(method.name)"><div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ method.name }}</span><span class="truncate text-muted-foreground">{{ method.description || method.signature }}</span></div><Badge variant="outline">{{ method.id }}</Badge></CommandItem>
            </CommandGroup></CommandList></Command>
          </PopoverContent>
        </Popover>
        <Button v-if="!state?.httpTestServer" :disabled="Boolean(serverAction) || !selectedMethodName" @click="startServer(false)"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ serverAction === 'start' ? 'Запуск…' : 'Запустить выбранный' }}</Button>
        <Button v-if="!state?.httpTestServer" variant="outline" :disabled="Boolean(serverAction)" @click="startServer(true)">Запустить все</Button>
        <Button v-else variant="destructive" :disabled="Boolean(serverAction)" @click="vscode.postMessage({ command: 'stopHttpTestServer' })"><HugeiconsIcon :icon="StopIcon" data-icon="inline-start" />{{ serverAction === 'stop' ? 'Остановка…' : 'Остановить' }}</Button>
      </CardContent>
      <CardFooter v-if="state?.httpTestServer"><Field class="w-full"><FieldLabel for="server-endpoint">Endpoint</FieldLabel><Input id="server-endpoint" :model-value="state.httpTestServer.url" readonly class="font-mono" /></Field></CardFooter>
    </Card>

    <Tabs v-model="activeRequestTab" class="flex flex-col gap-3">
      <TabsList><TabsTrigger value="method">Метод</TabsTrigger><TabsTrigger value="manual">Ручной запрос</TabsTrigger><TabsTrigger value="history">История <Badge variant="secondary">{{ history.length }}</Badge></TabsTrigger></TabsList>

      <TabsContent value="method" class="mt-0">
        <Card size="sm">
          <CardHeader><CardTitle>{{ selectedMethod?.name || 'Метод не выбран' }}</CardTitle><CardDescription>{{ selectedMethod?.description || 'Выберите HTTP-метод — форма будет построена по его сигнатуре.' }}</CardDescription><CardAction v-if="selectedMethod" class="flex flex-wrap gap-1"><Badge variant="outline">HTTP ID {{ selectedMethod.id }}</Badge><Badge variant="outline">Метод ID {{ selectedMethod.methodId }}</Badge></CardAction></CardHeader>
          <CardContent v-if="selectedMethod" class="flex flex-col gap-3 p-0">
            <div class="px-3"><code class="line-clamp-2 text-xs text-muted-foreground" :title="selectedMethod.signature">{{ selectedMethod.signature }}</code></div><Separator />
            <Table><TableHeader><TableRow><TableHead class="w-10"><span class="sr-only">Передавать</span></TableHead><TableHead class="w-56">Параметр</TableHead><TableHead>Значение</TableHead><TableHead class="w-44">Тип</TableHead></TableRow></TableHeader><TableBody>
              <TableRow><TableCell><Checkbox :model-value="true" disabled aria-label="Параметр method передаётся всегда" /></TableCell><TableCell class="font-medium">method</TableCell><TableCell class="font-medium">{{ selectedMethod.name }}</TableCell><TableCell class="text-muted-foreground">String</TableCell></TableRow>
              <TableRow v-for="parameter in parameters" :key="parameter.name">
                <TableCell><Checkbox v-model="parameter.enabled" :disabled="parameter.required" :aria-label="`Передавать параметр ${parameter.requestName}`" /></TableCell>
                <TableCell><div class="flex flex-wrap items-center gap-1"><span class="font-medium">{{ parameter.requestName }}</span><Badge v-if="parameter.required" variant="secondary">Обязательный</Badge></div></TableCell>
                <TableCell>
                  <Field :data-invalid="Boolean(parameterError(parameter))" :data-disabled="!parameter.enabled">
                    <Textarea v-if="isJsonParameter(parameter)" :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(parameterError(parameter))" class="min-h-16 resize-y font-mono" placeholder="{}" />
                    <Popover v-else-if="isReferenceParameter(parameter)" v-model:open="parameter.lookupOpen"><PopoverAnchor as-child><Input :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(parameterError(parameter))" placeholder="ID объекта…" autocomplete="off" @focus="searchParameterValues(parameter, true)" @input="searchParameterValues(parameter)" /></PopoverAnchor><PopoverContent class="w-[min(26rem,calc(100vw-4rem))] p-0" align="start"><Empty v-if="parameter.lookupLoading || !parameter.suggestions.length" class="border-0"><EmptyHeader><EmptyTitle>{{ parameter.lookupLoading ? 'Загрузка…' : 'Объекты не найдены' }}</EmptyTitle><EmptyDescription v-if="!parameter.lookupLoading">Измените запрос или укажите числовой ID.</EmptyDescription></EmptyHeader></Empty><Command v-else><CommandList><CommandGroup :heading="parameter.type"><CommandItem v-for="item in parameter.suggestions" :key="item.id" :value="`${item.id} ${item.name}`" @select="chooseParameterValue(parameter, item.id)"><span class="truncate">{{ item.name }}</span><Badge variant="outline">{{ item.id }}</Badge></CommandItem></CommandGroup></CommandList></Command></PopoverContent></Popover>
                    <Input v-else :id="`parameter-${parameter.name}`" v-model="parameter.value" :disabled="!parameter.enabled" :aria-invalid="Boolean(parameterError(parameter))" :placeholder="parameter.type" />
                    <FieldError v-if="parameterError(parameter)">{{ parameterError(parameter) }}</FieldError>
                  </Field>
                </TableCell>
                <TableCell class="text-muted-foreground">{{ isJsonParameter(parameter) ? `${parameter.type} · JSON` : parameter.type }}</TableCell>
              </TableRow>
            </TableBody></Table>
            <Empty v-if="!parameters.length" class="border-0"><EmptyHeader><EmptyTitle>Нет параметров</EmptyTitle><EmptyDescription>Метод можно отправить без дополнительных значений.</EmptyDescription></EmptyHeader></Empty>
            <div v-if="generatedRequest" class="px-3"><Field><FieldLabel for="generated-url">Итоговый URL</FieldLabel><Input id="generated-url" :model-value="generatedRequest.url" readonly class="font-mono" /></Field></div>
            <Alert v-if="parameterErrors.length" variant="destructive" class="mx-3 w-auto"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Проверьте параметры</AlertTitle><AlertDescription>{{ parameterErrors.join(' ') }}</AlertDescription></Alert>
          </CardContent>
          <CardFooter v-if="selectedMethod" class="flex flex-wrap gap-2"><NativeSelect v-model="requestMethod" aria-label="HTTP-метод"><NativeSelectOption v-for="verb in ['POST', 'GET', 'PUT', 'PATCH', 'DELETE']" :key="verb" :value="verb">{{ verb }}</NativeSelectOption></NativeSelect><Button :disabled="busy || !generatedRequest" @click="sendGeneratedRequest"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ busy ? 'Отправка…' : 'Отправить' }}</Button><Button variant="outline" :disabled="!generatedRequest" @click="copyForPostman(generatedRequest)"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />cURL</Button><Button variant="ghost" :disabled="busy" @click="resetParameters">Сбросить значения</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="manual" class="mt-0">
        <Card size="sm">
          <CardHeader><CardTitle>Ручной запрос</CardTitle><CardDescription>Полный контроль над URL, заголовками и телом запроса.</CardDescription></CardHeader>
          <CardContent><FieldGroup><Field><FieldLabel for="manual-url">URL</FieldLabel><Input id="manual-url" v-model="manualUrl" class="font-mono" placeholder="http://127.0.0.1:8080/api" /></Field><Field :data-invalid="Boolean(manualHeadersError)"><FieldLabel for="manual-headers">Заголовки JSON</FieldLabel><Textarea id="manual-headers" v-model="manualHeaders" :aria-invalid="Boolean(manualHeadersError)" class="min-h-24 font-mono" /><FieldError v-if="manualHeadersError">{{ manualHeadersError }}</FieldError></Field><Field v-if="!['GET', 'HEAD'].includes(requestMethod)" :data-invalid="Boolean(manualBodyError)"><FieldLabel for="manual-body">Тело запроса</FieldLabel><Textarea id="manual-body" v-model="manualBody" :aria-invalid="Boolean(manualBodyError)" class="min-h-40 font-mono" /><FieldDescription>Для JSON добавьте заголовок Content-Type: application/json.</FieldDescription><FieldError v-if="manualBodyError">{{ manualBodyError }}</FieldError></Field></FieldGroup></CardContent>
          <CardFooter class="flex flex-wrap gap-2"><NativeSelect v-model="requestMethod" aria-label="HTTP-метод"><NativeSelectOption v-for="verb in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']" :key="verb" :value="verb">{{ verb }}</NativeSelectOption></NativeSelect><Button :disabled="busy || !buildManualRequest()" @click="sendManualRequest"><HugeiconsIcon :icon="PlayIcon" data-icon="inline-start" />{{ busy ? 'Отправка…' : 'Отправить' }}</Button><Button variant="outline" :disabled="!buildManualRequest()" @click="copyManualRequestForPostman"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />cURL</Button></CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="history" class="mt-0">
        <Card size="sm">
          <CardHeader><CardTitle>История запросов</CardTitle><CardDescription>Последние 30 вызовов сохраняются для этого экземпляра webview. Секретные заголовки скрываются.</CardDescription><CardAction><Button variant="outline" size="sm" :disabled="!history.length" @click="clearHistory"><HugeiconsIcon :icon="Delete02Icon" data-icon="inline-start" />Очистить</Button></CardAction></CardHeader>
          <CardContent v-if="history.length" class="p-0"><Table><TableHeader><TableRow><TableHead>Время</TableHead><TableHead>Запрос</TableHead><TableHead>Результат</TableHead><TableHead class="w-24"><span class="sr-only">Действия</span></TableHead></TableRow></TableHeader><TableBody><TableRow v-for="entry in history" :key="entry.id"><TableCell class="whitespace-nowrap text-muted-foreground">{{ formatHistoryTime(entry.timestamp) }}</TableCell><TableCell><div class="flex min-w-0 flex-col"><span class="truncate font-medium">{{ entry.request.method }} · {{ entry.label }}</span><span class="max-w-xl truncate text-muted-foreground" :title="entry.request.url">{{ entry.request.url }}</span></div></TableCell><TableCell><Badge v-if="entry.response" :variant="entry.response.status >= 400 ? 'destructive' : 'secondary'">{{ entry.response.status }} · {{ entry.response.durationMs }} мс</Badge><Badge v-else variant="destructive">Ошибка</Badge></TableCell><TableCell><Button variant="ghost" size="sm" @click="loadHistoryEntry(entry)">В форму</Button></TableCell></TableRow></TableBody></Table></CardContent>
          <CardContent v-else><Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="Clock01Icon" /></EmptyMedia><EmptyTitle>История пуста</EmptyTitle><EmptyDescription>Здесь появятся выполненные запросы, их статус и время ответа.</EmptyDescription></EmptyHeader></Empty></CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Card size="sm">
      <CardHeader><CardTitle>Ответ</CardTitle><CardDescription v-if="result?.response">{{ result.response.durationMs }} мс · {{ result.response.body.length.toLocaleString('ru-RU') }} символов · {{ responseHeaders.length }} заголовков</CardDescription><CardDescription v-else-if="result?.error" class="text-destructive">Запрос завершился ошибкой</CardDescription><CardDescription v-else>Результат следующего запроса появится здесь.</CardDescription><CardAction v-if="result?.response" class="flex items-center gap-2"><Badge :variant="result.response.status >= 400 ? 'destructive' : 'secondary'">{{ result.response.status }} {{ result.response.statusText }}</Badge><Button variant="outline" size="sm" @click="copyText(formattedResponseBody, 'Ответ скопирован.')"><HugeiconsIcon :icon="Copy01Icon" data-icon="inline-start" />Копировать</Button></CardAction></CardHeader>
      <CardContent v-if="result?.response"><Tabs v-model="responseTab"><TabsList variant="line"><TabsTrigger value="body">Body</TabsTrigger><TabsTrigger value="headers">Headers <Badge variant="secondary">{{ responseHeaders.length }}</Badge></TabsTrigger><TabsTrigger value="raw">Raw</TabsTrigger></TabsList><TabsContent value="body"><JsonResponseEditor :model-value="formattedResponseBody" @open-object="openDatabaseObject" /></TabsContent><TabsContent value="headers"><Table><TableHeader><TableRow><TableHead class="w-64">Заголовок</TableHead><TableHead>Значение</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="([name, value]) in responseHeaders" :key="name"><TableCell class="font-medium">{{ name }}</TableCell><TableCell class="break-all font-mono">{{ value }}</TableCell></TableRow></TableBody></Table></TabsContent><TabsContent value="raw"><Textarea :model-value="result.response.body" readonly class="min-h-64 resize-y font-mono" aria-label="Ответ без форматирования" /></TabsContent></Tabs></CardContent>
      <CardContent v-else-if="result?.error"><Alert variant="destructive"><HugeiconsIcon :icon="AlertCircleIcon" /><AlertTitle>Не удалось выполнить запрос</AlertTitle><AlertDescription>{{ result.error }}</AlertDescription></Alert></CardContent>
      <CardContent v-else><Empty><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon :icon="ApiIcon" /></EmptyMedia><EmptyTitle>Ответа пока нет</EmptyTitle><EmptyDescription>Выберите метод, заполните параметры и отправьте запрос.</EmptyDescription></EmptyHeader></Empty></CardContent>
    </Card>
  </main>
</template>
