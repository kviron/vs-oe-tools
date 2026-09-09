<script setup lang="ts">
import type { ExplorerHostMessage } from '../../../src/core/webviewProtocol';
import type { ClassTreeRow } from '../../../src/features/classes/models';
import type { DatabaseObjectSearchResult } from '../../../src/core/objectSearch';
import type { PackageContentNode, PackageExplorerNode, PackageSummary } from '../../../src/features/packages/models';
import { computed, nextTick, ref, watch } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { vscode } from '@/vscode';
import ClassTreeNode, { type TreeNode } from './ClassTreeNode.vue';
import PackageTreeNode from './PackageTreeNode.vue';
import EntityContextMenu from '@/components/EntityContextMenu.vue';
import { ArrowDown01Icon, BrowserIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/vue';

const activeTab = ref('packages');
const packages = ref<PackageSummary[]>([]);
const packagesLoading = ref(false);
const packagesLoaded = ref(false);
const packagesError = ref('');
const selectedPackageId = ref('');
const packageTree = ref<PackageExplorerNode>();
const packageTreeLoading = ref(false);
const packageTreeError = ref('');
const loadingFileId = ref<number>();
const classes = ref<ClassTreeRow[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const selectedClassId = ref<number>();
const explorerActive = ref(document.hasFocus());
const revealClassId = ref<number>();
const searchQuery = ref('');
const objectSearchQuery = ref('');
const objectSearchResults = ref<DatabaseObjectSearchResult[]>([]);
const objectSearchLoading = ref(false);
const objectSearchError = ref('');
let searchClickTimer: number | undefined;
let objectSearchTimer: number | undefined;
const selectedPackageName = computed(() => packages.value.find(item => item.id === Number(selectedPackageId.value))?.name ?? 'Выберите пакет');

const normalizedSearchQuery = computed(() => searchQuery.value.trim());
const searchResults = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return [];
  if (/^\d+$/.test(query)) {
    const id = Number(query);
    return classes.value.filter(item => item.id === id);
  }
  const name = query.toLocaleLowerCase('ru');
  return classes.value
    .filter(item => item.name.toLocaleLowerCase('ru').includes(name))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
});

const classTree = computed<TreeNode>(() => {
  const byId = new Map<number, TreeNode>(
    classes.value.map(item => [item.id, { id: item.id, entityId: item.id, name: item.name, kind: 'class', hasDfm: item.hasDfm, virtual: item.virtual, dbtablename: item.dbtablename, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const item of classes.value) {
    const node = byId.get(item.id)!;
    node.children.push(...item.comments.map(comment => ({
      id: `comment-${comment.id}`,
      entityId: comment.id,
      name: comment.name || `Комментарий #${comment.id}`,
      kind: 'comment' as const,
      children: [],
    })));
    if (item.objectMetaDataCount > 0) {
      node.children.push({
        id: `metadata-${item.id}`,
        name: `Объекты метаданных (${item.objectMetaDataCount})`,
        kind: 'metadata',
        children: [],
      });
    }
    const parent = item.seniorid === null ? undefined : byId.get(item.seniorid);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return { id: 'root', name: 'Root', kind: 'root', children: roots.length === 1 ? roots[0].children : roots };
});

function loadClasses(): void {
  if (loading.value || loaded.value) return;
  loading.value = true;
  error.value = '';
  vscode.postMessage({ command: 'loadClasses' });
}

function loadPackages(): void {
  if (packagesLoading.value || packagesLoaded.value) return;
  packagesLoading.value = true;
  packagesError.value = '';
  vscode.postMessage({ command: 'loadPackages' });
}

function loadSelectedPackage(): void {
  const packageId = Number(selectedPackageId.value);
  packageTree.value = undefined;
  packageTreeError.value = '';
  persistExplorerState();
  if (!Number.isSafeInteger(packageId)) return;
  packageTreeLoading.value = true;
  vscode.postMessage({ command: 'loadPackageTree', packageId });
}

function selectPackage(packageId: number): void {
  if (selectedPackageId.value === String(packageId)) return;
  selectedPackageId.value = String(packageId);
  loadSelectedPackage();
}

function loadPackageFile(fileId: number): void {
  if (loadingFileId.value !== undefined) return;
  loadingFileId.value = fileId;
  vscode.postMessage({ command: 'loadPackageFileObjects', fileId });
}

function openPackageContent(fileId: number, objectId?: number): void {
  vscode.postMessage({ command: 'openPackageContent', fileId, objectId });
}

function attachFileObjects(node: PackageExplorerNode, fileId: number, objects: PackageContentNode[]): boolean {
  if (node.kind === 'file' && node.fileId === fileId) {
    node.children = objects.map(object => objectNode(object, fileId));
    node.hasChildren = node.children.length > 0;
    return true;
  }
  return node.children.some(child => attachFileObjects(child, fileId, objects));
}

function objectNode(node: PackageContentNode, fileId: number): PackageExplorerNode {
  return {
    key: `object:${node.id}`, id: node.id, objectId: node.id, fileId,
    name: node.name, kind: 'object', objectKind: node.kind, className: node.className,
    hasChildren: node.children.length > 0, children: node.children.map(child => objectNode(child, fileId)),
  };
}

function onTabChange(value: string | number): void {
  activeTab.value = String(value);
  persistExplorerState();
  if (activeTab.value === 'packages') loadPackages();
  if (activeTab.value === 'classes') loadClasses();
}

watch(objectSearchQuery, (value) => {
  window.clearTimeout(objectSearchTimer);
  const query = value.trim();
  if (!query) {
    objectSearchResults.value = [];
    objectSearchLoading.value = false;
    objectSearchError.value = '';
    return;
  }
  objectSearchTimer = window.setTimeout(() => vscode.postMessage({ command: 'searchDatabaseObjects', query }), 250);
});

function objectKindLabel(kind: DatabaseObjectSearchResult['kind']): string {
  if (kind === 'class') return 'Класс';
  if (kind === 'method') return 'Метод';
  if (kind === 'attribute') return 'Атрибут';
  if (kind === 'lifecycle') return 'Жизненный цикл';
  if (kind === 'journal') return 'Журнал';
  if (kind === 'list') return 'Список';
  return 'Объект';
}

function selectDatabaseObject(item: DatabaseObjectSearchResult, open: boolean): void {
  const id = Number(item.id);
  if (!Number.isSafeInteger(id)) return;
  selectedClassId.value = id;
  vscode.postMessage({ command: 'selectExplorerEntity', id });
  if (open) vscode.postMessage({ command: 'openDatabaseObject', id, kind: item.kind, pinned: true });
}

function selectSearchResult(item: ClassTreeRow, pinned: boolean): void {
  selectedClassId.value = item.id;
  persistExplorerState();
  debugLog(`Клик по результату поиска; выбран ID=${item.id}; double=${pinned}.`);
  vscode.postMessage({ command: 'selectExplorerEntity', id: item.id });
  window.clearTimeout(searchClickTimer);
  if (!pinned) {
    searchClickTimer = window.setTimeout(() => vscode.postMessage({ command: 'openClass', id: item.id, pinned: false }), 180);
    return;
  }
  searchQuery.value = '';
  revealClassId.value = undefined;
  void nextTick(async () => {
    revealClassId.value = item.id;
    await nextTick();
    window.setTimeout(() => scrollToSelectedClass(item.id), 100);
  });
  vscode.postMessage({ command: 'openClass', id: item.id, pinned: true });
}

function debugLog(message: string): void {
  vscode.postMessage({ command: 'explorerDebugLog', message });
}

function updateCopyContext(active: boolean): void {
  vscode.postMessage({ command: 'setExplorerCopyContext', active });
}

function selectTreeClass(id: number): void {
  selectedClassId.value = id;
  persistExplorerState();
  debugLog(`Клик по дереву; выбран ID=${id}.`);
  vscode.postMessage({ command: 'selectExplorerEntity', id });
}

function scrollToSelectedClass(id: number): void {
  document.querySelector<HTMLElement>(`[data-class-id="${id}"]`)
    ?.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
}

document.addEventListener('copy', (event: ClipboardEvent) => {
  const activeElement = document.activeElement;
  const activeTag = activeElement?.tagName ?? 'нет';
  debugLog(`Событие copy; activeElement=${activeTag}; selectedId=${selectedClassId.value ?? 'нет'}; clipboardData=${Boolean(event.clipboardData)}.`);
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || (activeElement instanceof HTMLElement && activeElement.isContentEditable)) {
    debugLog('copy оставлен стандартному полю ввода.');
    return;
  }
  if (!window.getSelection()?.isCollapsed || selectedClassId.value === undefined || !event.clipboardData) {
    debugLog(`copy пропущен; selectionCollapsed=${window.getSelection()?.isCollapsed ?? 'нет'}.`);
    return;
  }
  event.preventDefault();
  event.clipboardData.setData('text/plain', String(selectedClassId.value));
  debugLog(`ID=${selectedClassId.value} записан в clipboardData.`);
  vscode.postMessage({ command: 'copyEntityId', id: selectedClassId.value });
});

document.addEventListener('focusin', (event: FocusEvent) => {
  const target = event.target;
  const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
  updateCopyContext(!isTextInput);
});

window.addEventListener('focus', () => {
  explorerActive.value = true;
  updateCopyContext(true);
});
window.addEventListener('blur', () => {
  explorerActive.value = false;
  updateCopyContext(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.ctrlKey && event.key.toLocaleLowerCase() === 'c') {
    debugLog(`Получен keydown Ctrl+C; target=${event.target instanceof HTMLElement ? event.target.tagName : 'не HTMLElement'}; defaultPrevented=${event.defaultPrevented}.`);
  }
}, true);

window.addEventListener('message', (event: MessageEvent<ExplorerHostMessage>) => {
  const message = event.data;
  if (message.command === 'classesLoaded') {
    classes.value = message.classes;
    loading.value = false;
    loaded.value = true;
  } else if (message.command === 'restoreExplorerState') {
    activeTab.value = message.activeTab;
    selectedClassId.value = message.selectedClassId;
    selectedPackageId.value = message.selectedPackageId === undefined ? '' : String(message.selectedPackageId);
    if (activeTab.value === 'packages') loadPackages();
    if (activeTab.value === 'classes') loadClasses();
    if (message.selectedClassId !== undefined) revealClassId.value = message.selectedClassId;
  } else if (message.command === 'packagesLoaded') {
    packages.value = message.packages;
    packagesLoading.value = false;
    packagesLoaded.value = true;
    if (!selectedPackageId.value && packages.value.length) {
      selectedPackageId.value = String(packages.value.find(item => item.name.toLocaleLowerCase('ru') === 'консультант')?.id ?? packages.value[0]?.id ?? '');
    }
    if (selectedPackageId.value) loadSelectedPackage();
  } else if (message.command === 'packagesLoadFailed') {
    packagesLoading.value = false;
    packagesError.value = message.message;
  } else if (message.command === 'resetPackages') {
    packages.value = [];
    packagesLoaded.value = false;
    packageTree.value = undefined;
    selectedPackageId.value = '';
    if (activeTab.value === 'packages') loadPackages();
  } else if (message.command === 'packageTreeLoading') {
    packageTreeLoading.value = true;
    packageTreeError.value = '';
  } else if (message.command === 'packageTreeLoaded') {
    if (message.packageId === Number(selectedPackageId.value)) packageTree.value = message.tree;
    packageTreeLoading.value = false;
  } else if (message.command === 'packageTreeLoadFailed') {
    if (message.packageId === Number(selectedPackageId.value)) packageTreeError.value = message.message;
    packageTreeLoading.value = false;
  } else if (message.command === 'packageFileObjectsLoaded') {
    if (packageTree.value) attachFileObjects(packageTree.value, message.fileId, message.objects);
    loadingFileId.value = undefined;
  } else if (message.command === 'packageFileObjectsLoadFailed') {
    packageTreeError.value = message.message;
    loadingFileId.value = undefined;
  } else if (message.command === 'revealClass') {
    activeTab.value = 'classes';
    selectedClassId.value = message.id;
    persistExplorerState();
    searchQuery.value = '';
    vscode.postMessage({ command: 'selectExplorerEntity', id: message.id });
    if (!loaded.value) loadClasses();
    void nextTick(async () => {
      revealClassId.value = undefined;
      await nextTick();
      revealClassId.value = message.id;
      await nextTick();
      window.setTimeout(() => scrollToSelectedClass(message.id), 100);
    });
  } else if (message.command === 'classesLoadFailed') {
    loading.value = false;
    error.value = message.message;
  } else if (message.command === 'resetClasses') {
    classes.value = [];
    selectedClassId.value = undefined;
    vscode.postMessage({ command: 'selectExplorerEntity' });
    loaded.value = false;
    loading.value = false;
    if (activeTab.value === 'classes') loadClasses();
  } else if (message.command === 'databaseObjectsLoading') {
    if (message.query === objectSearchQuery.value.trim()) {
      objectSearchLoading.value = true;
      objectSearchError.value = '';
    }
  } else if (message.command === 'databaseObjectsLoaded') {
    if (message.query === objectSearchQuery.value.trim()) {
      objectSearchResults.value = message.objects;
      objectSearchLoading.value = false;
    }
  } else if (message.command === 'databaseObjectsLoadFailed' && message.query === objectSearchQuery.value.trim()) {
    objectSearchLoading.value = false;
    objectSearchError.value = message.message;
  }
});

function persistExplorerState(): void {
  vscode.postMessage({ command: 'explorerStateChanged', activeTab: activeTab.value, selectedClassId: selectedClassId.value, selectedPackageId: selectedPackageId.value ? Number(selectedPackageId.value) : undefined });
}

vscode.postMessage({ command: 'explorerReady' });
</script>

<template>
  <Tabs :model-value="activeTab" class="h-screen min-h-0 min-w-0 overflow-hidden gap-0" @update:model-value="onTabChange">
    <TabsList variant="line" class="relative z-20 w-full shrink-0 border-b bg-muted px-1">
      <TabsTrigger value="packages" class="flex-1">Пакеты</TabsTrigger>
      <TabsTrigger value="objects" class="flex-1">Объекты</TabsTrigger>
      <TabsTrigger value="classes" class="flex-1">Классы</TabsTrigger>
    </TabsList>
    <TabsContent value="packages" class="min-h-0 min-w-0 overflow-hidden">
      <div class="flex h-full min-h-0 min-w-0 flex-col">
        <div class="shrink-0 border-b bg-background p-1">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm" class="h-7 w-full justify-between px-2 font-normal" :disabled="packagesLoading" aria-label="Выбрать пакет">
                <span class="truncate">{{ selectedPackageName }}</span><HugeiconsIcon :icon="ArrowDown01Icon" data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="max-h-96" align="start">
              <DropdownMenuRadioGroup :model-value="selectedPackageId">
                <DropdownMenuRadioItem v-for="item in packages" :key="item.id" :value="String(item.id)" @select="selectPackage(item.id)">{{ item.name }}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div v-if="packagesLoading || packageTreeLoading" class="flex flex-col gap-1 p-1"><Skeleton v-for="index in 8" :key="index" class="h-7 w-full" /></div>
        <Empty v-else-if="packagesError || packageTreeError" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Не удалось загрузить пакет</EmptyTitle><EmptyDescription>{{ packagesError || packageTreeError }}</EmptyDescription></EmptyHeader></Empty>
        <Empty v-else-if="packagesLoaded && packages.length === 0" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Пакеты не найдены</EmptyTitle><EmptyDescription>В базе нет доступных пакетов.</EmptyDescription></EmptyHeader></Empty>
        <div v-else-if="packageTree" class="min-h-0 min-w-0 flex-1 overflow-auto p-1"><div class="w-max min-w-full"><PackageTreeNode :node="packageTree" :loading-file-id="loadingFileId" initially-open @load-file="loadPackageFile" @open-content="openPackageContent" /></div></div>
        <Empty v-else class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Выберите пакет</EmptyTitle><EmptyDescription>Его папки, файлы и вложенные объекты появятся в дереве.</EmptyDescription></EmptyHeader></Empty>
      </div>
    </TabsContent>
    <TabsContent value="objects" class="min-h-0 overflow-hidden">
      <div class="flex h-full min-h-0 flex-col">
        <div class="shrink-0 border-b bg-background p-1">
          <Input v-model="objectSearchQuery" type="search" class="h-7 bg-background dark:bg-background" placeholder="ID или имя любого объекта" aria-label="Поиск объекта по ID или имени" />
        </div>
        <div v-if="objectSearchLoading" class="flex flex-col gap-1 p-1">
          <Skeleton v-for="index in 6" :key="index" class="h-10 w-full" />
        </div>
        <Empty v-else-if="objectSearchError" class="min-h-0 py-6">
          <EmptyHeader><EmptyTitle>Не удалось выполнить поиск</EmptyTitle><EmptyDescription>{{ objectSearchError }}</EmptyDescription></EmptyHeader>
        </Empty>
        <div v-else-if="objectSearchResults.length" class="min-h-0 flex-1 overflow-auto p-1">
          <EntityContextMenu
            v-for="item in objectSearchResults"
            :key="item.id"
            :entity-id="item.id"
            :entity-type="item.metaClassName"
            :edit="item.kind !== 'object'"
            @edit="selectDatabaseObject(item, true)"
          >
            <button
              type="button"
              class="flex min-h-10 w-full items-center gap-2 px-2 text-left hover:bg-accent"
              :title="`${item.name} — ${item.id}`"
              @click="selectDatabaseObject(item, false)"
              @dblclick="selectDatabaseObject(item, true)"
            >
              <Badge variant="outline" class="w-20 justify-center">{{ objectKindLabel(item.kind) }}</Badge>
              <span class="min-w-0 flex-1">
                <span class="block truncate">{{ item.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ item.ownerName || item.metaClassName }}<template v-if="item.packageName"> · {{ item.packageName }}</template>
                </span>
              </span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ item.id }}</span>
            </button>
          </EntityContextMenu>
        </div>
        <Empty v-else class="min-h-0 py-6">
          <EmptyHeader>
            <EmptyTitle>{{ objectSearchQuery.trim() ? 'Совпадений нет' : 'Поиск объектов' }}</EmptyTitle>
            <EmptyDescription>{{ objectSearchQuery.trim() ? 'Измените ID или имя.' : 'Введите ID или часть имени класса, метода, атрибута или другого объекта.' }}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </TabsContent>
    <TabsContent value="classes" class="min-h-0 min-w-0 overflow-hidden">
      <div class="flex h-full min-h-0 min-w-0 flex-col">
      <div v-if="loading" class="flex flex-col gap-1 p-1">
        <Skeleton v-for="index in 6" :key="index" class="h-6 w-full" />
      </div>
      <Empty v-else-if="error" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Не удалось загрузить классы</EmptyTitle><EmptyDescription>{{ error }}</EmptyDescription></EmptyHeader></Empty>
      <Empty v-else-if="loaded && classes.length === 0" class="min-h-0 py-6"><EmptyHeader><EmptyTitle>Классы не найдены</EmptyTitle><EmptyDescription>База данных не вернула доступных классов.</EmptyDescription></EmptyHeader></Empty>
      <template v-else-if="loaded">
        <div class="z-10 shrink-0 border-b bg-background p-1">
          <Input
            v-model="searchQuery"
            type="search"
            class="h-7 bg-background dark:bg-background"
            placeholder="Поиск класса по названию или ID"
            aria-label="Поиск класса по названию или ID"
          />
        </div>
        <div v-if="normalizedSearchQuery" class="flex min-h-0 flex-1 flex-col overflow-auto p-1">
		  <EntityContextMenu v-for="item in searchResults" :key="item.id" :entity-id="item.id" entity-type="Класс" :class-id="item.hasDfm ? item.id : undefined" :view-objects-class-id="!item.virtual && item.dbtablename ? item.id : undefined" copy-shortcut="Ctrl+C">
          <button
            type="button"
            class="flex min-h-7 items-center gap-2 px-2 text-left hover:bg-accent"
            :class="cn(item.id === selectedClassId && (explorerActive
              ? 'bg-primary/15 text-primary hover:bg-primary/20'
              : 'bg-muted text-muted-foreground hover:bg-muted'))"
            :title="`${item.name} — ${item.id}`"
            @click="selectSearchResult(item, false)"
            @dblclick="selectSearchResult(item, true)"
          >
			<HugeiconsIcon v-if="item.hasDfm" :icon="BrowserIcon" data-icon="inline-start" class="text-[var(--vscode-charts-orange)]" />
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ item.id }}</span>
          </button>
		  </EntityContextMenu>
          <Empty v-if="searchResults.length === 0" class="min-h-0 py-6">
            <EmptyHeader><EmptyTitle>Совпадений нет</EmptyTitle><EmptyDescription>Измените название или ID класса.</EmptyDescription></EmptyHeader>
          </Empty>
        </div>
        <div v-else class="min-h-0 min-w-0 flex-1 overflow-auto p-1">
          <div class="w-max min-w-full">
            <ClassTreeNode
              :node="classTree"
              :selected-class-id="selectedClassId"
              :reveal-class-id="revealClassId"
              :explorer-active="explorerActive"
              initially-open
              @select-class="selectTreeClass"
            />
          </div>
        </div>
      </template>
      </div>
    </TabsContent>
  </Tabs>
</template>
