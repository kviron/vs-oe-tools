declare const acquireVsCodeApi: undefined | (() => { postMessage(message: unknown): void });
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
window.addEventListener('message', event => {
 const message = event.data;
 const entry = pending.get(message?.id);
 if (!entry) return;
 pending.delete(message.id);
 if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
});
export const inWebview = Boolean(vscode);
export function requestHost(request: unknown): Promise<unknown> {
 return new Promise((resolve, reject) => {
  if (!vscode) { reject(new Error('VS Code bridge unavailable')); return; }
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('Редактор не ответил; повторите запрос')); }, 120000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  vscode.postMessage({ id, request });
 });
}
export async function mapFetch(url: string, options?: RequestInit): Promise<Response> {
 if (!vscode) return fetch(url, options);
 const name = decodeURIComponent(url.split('/')[3] || '');
 const request = options?.method === 'PUT' ? { operation: 'save', name, ...JSON.parse(String(options.body)) } : name ? { operation: 'read', name } : { operation: 'list' };
 try { return new Response(JSON.stringify(await requestHost(request)), { status: 200 }); }
 catch (error) { return new Response(JSON.stringify({ error: String(error) }), { status: 400 }); }
}
export async function confirmDiscard(): Promise<boolean> {
 return inWebview ? Boolean(await requestHost({ operation: 'confirmDiscard' })) : confirm('Отбросить несохранённые изменения?');
}
export async function newMapName(): Promise<string | undefined> {
 return inWebview ? await requestHost({ operation: 'newName' }) as string | undefined : prompt('Имя карты (латиницей):') || undefined;
}

export async function promptText(promptLabel: string, value = ''): Promise<string | undefined> {
 return inWebview ? await requestHost({ operation: 'prompt', prompt: promptLabel, value }) as string | undefined : window.prompt(promptLabel, value) || undefined;
}
