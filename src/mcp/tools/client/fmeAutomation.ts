import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { z } from '../../schemas';
import type { McpToolServer, McpToolResult } from '../../toolTypes';

const execute = promisify(execFile);
const id = z.number().int().positive().safe();
const action = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('click'), x: z.number().int().min(0).max(32767), y: z.number().int().min(0).max(32767), double: z.boolean().optional() }).strict(),
	z.object({ kind: z.literal('keys'), keys: z.array(z.number().int().min(1).max(255)).min(1).max(10) }).strict(),
	z.object({ kind: z.literal('text'), text: z.string().min(1).max(1000) }).strict(),
	z.object({ kind: z.literal('wheel'), notches: z.number().int().min(-100).max(100).refine((n: number) => n !== 0) }).strict(),
]);
type Action = { kind: 'click'; x: number; y: number; double?: boolean } | { kind: 'keys'; keys: number[] } | { kind: 'text'; text: string } | { kind: 'wheel'; notches: number };
export async function runFmeProbe(input: { pid: number; window?: number; child?: number; action?: Action; snapshot?: boolean }): Promise<{ data: unknown; image?: string }> {
	if (process.platform !== 'win32') { throw new Error('Управление FME доступно только в Windows.'); }
	const script = [resolve(__dirname, '../assets/fme-automation/hwnd-probe.ps1'), resolve(__dirname, '../../../../assets/fme-automation/hwnd-probe.ps1')].find(existsSync);
	if (!script) { throw new Error('Файл управления FME не найден в расширении.'); }
	const dir = await mkdtemp(join(tmpdir(), 'oe-fme-'));
	try {
		const args: Record<string, unknown> = { TargetProcessId: input.pid };
		if (input.window) { args.WindowHandle = input.window; }
		if (input.snapshot) { args.ScreenshotPath = join(dir, 'window.png'); args.ListElements = true; }
		if (input.action) {
			args.ClickChildHandle = input.child; args.AsyncClick = true;
			if (input.action.kind === 'click') { args.ClickX = input.action.x; args.ClickY = input.action.y; args.DoubleClick = !!input.action.double; }
			if (input.action.kind === 'keys') { args.VirtualKeys = input.action.keys; }
			if (input.action.kind === 'text') { args.InputText = input.action.text; }
			if (input.action.kind === 'wheel') { args.WheelNotches = input.action.notches; }
		}
		const command = '$o = ConvertFrom-Json $env:OE_FME_ARGS; $p = @{}; $o.PSObject.Properties | ForEach-Object { $p[$_.Name] = $_.Value }; & $env:OE_FME_SCRIPT @p';
		const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000, maxBuffer: 12 * 1024 * 1024, env: { ...process.env, OE_FME_ARGS: JSON.stringify(args), OE_FME_SCRIPT: script } });
		const data: unknown = JSON.parse(stdout.trim());
		return { data, ...(input.snapshot ? { image: (await readFile(join(dir, 'window.png'))).toString('base64') } : {}) };
	} finally { await rm(dir, { recursive: true, force: true }); }
}
export function registerTool(server: McpToolServer): void {
	const fail = (e: unknown): McpToolResult => ({ isError: true, content: [{ type: 'text', text: String(e) }] });
	server.registerTool('fme_list_processes', { description: 'Найти запущенные процессы FME без чтения параметров входа.', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => { try { if (process.platform !== 'win32') { throw new Error('Windows only'); } const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$OutputEncoding=[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ConvertTo-Json -InputObject @(Get-Process FME -ErrorAction SilentlyContinue | Select-Object Id,Path) -Compress"], { windowsHide: true, timeout: 5000 }); return { content: [{ type: 'text', text: stdout.trim() }] }; } catch (e) { return fail(e); } });
	server.registerTool('fme_list_windows', { description: 'Список видимых окон процесса FME по PID.', inputSchema: { pid: id }, annotations: { readOnlyHint: true } }, async ({ pid }: { pid: number }) => { try { const r = await runFmeProbe({ pid }); return { content: [{ type: 'text', text: JSON.stringify(r.data) }] }; } catch (e) { return fail(e); } });
	server.registerTool('fme_snapshot', { description: 'Снимок и дерево элементов окна FME по актуальному HWND.', inputSchema: { pid: id, window: id }, annotations: { readOnlyHint: true } }, async ({ pid, window }: { pid: number; window: number }) => { try { const r = await runFmeProbe({ pid, window, snapshot: true }); return { content: [{ type: 'text', text: JSON.stringify(r.data) }, { type: 'image', data: r.image!, mimeType: 'image/png' }] }; } catch (e) { return fail(e); } });
	server.registerTool('fme_input', { description: 'Отправить нажатие, текст, клавиши или прокрутку дочернему элементу FME. Отправка не подтверждает результат: проверьте снимок.', inputSchema: { pid: id, window: id, child: id, action }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } }, async ({ pid, window, child, action: a }: { pid: number; window: number; child: number; action: Action }) => { try { const r = await runFmeProbe({ pid, window, child, action: a }); return { content: [{ type: 'text', text: JSON.stringify({ delivery: 'queued', verified: false, result: r.data }) }] }; } catch (e) { return fail(e); } });
}
