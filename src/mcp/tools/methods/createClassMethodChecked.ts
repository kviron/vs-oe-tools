import { z } from '../../schemas';
import { bridgeToolResult } from '../../bridge';
import { loadActiveDatabaseOptions, queryDatabaseRaw } from '../../database';
import { callManagedClientMcpTool, listManagedClientMcpTools, startManagedClientMcp, stopManagedClientMcp } from '../../client/lifecycle';
import { getClientMcpHealth } from '../../client/http';
import type { McpToolServer } from '../../toolTypes';

interface OwnerPackageRow extends Record<string, unknown> {
	packagename: string;
	sysfile: number;
	filename: string;
}

function nativeResult(result: { content: Array<{ text: string }>; isError?: boolean }): Record<string, unknown> {
	const raw = result.content.map(item => item.text).join('\n');
	if (result.isError) { throw new Error(raw || 'Нативный MCP вернул ошибку.'); }
	try { return JSON.parse(raw) as Record<string, unknown>; }
	catch { throw new Error(`Некорректный ответ нативного MCP: ${raw.slice(0, 500)}`); }
}

export function registerTool(server: McpToolServer): void {
	server.registerTool('create_class_method_checked', {
		description: 'Create an East Express method through the native client, bind it to its owner package, write complete source, re-read it, and compile it before returning. Returns the new ID and diagnostics; passed=false means the work is incomplete. Verify get_active_database first.',
		inputSchema: {
			ownerClassId: z.number().int().positive(),
			name: z.string().min(1).max(200),
			code: z.string().min(1).max(1_500_000).describe('Complete anonymous proc/procedure/func/function source without the card name'),
			isStatic: z.boolean().optional(),
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	}, async ({ ownerClassId, name, code, isStatic }: { ownerClassId: number; name: string; code: string; isStatic?: boolean }) => {
		let createdId: number | undefined;
		let started = false;
		try {
			const options = await loadActiveDatabaseOptions();
			const owners = await queryDatabaseRaw<OwnerPackageRow>(
				`SELECT owner.sysfile, file.filename, package.packagename
				 FROM abstract owner JOIN sysfile file ON file.id=owner.sysfile
				 JOIN sysgroups grp ON grp.id=file.sysgroup JOIN syspackages package ON package.id=grp.package
				 WHERE owner.id=$1 AND EXISTS (SELECT 1 FROM classes WHERE id=owner.id)`, [ownerClassId]);
			const owner = owners[0];
			if (!owner || !owner.packagename || owner.filename.toLowerCase() === '#package$') {
				throw new Error(`Класс ${ownerClassId} не привязан к конкретному пакетному файлу.`);
			}
			started = true;
			await startManagedClientMcp();
			const health = await getClientMcpHealth();
			if (health.database?.toLowerCase() !== options.database.toLowerCase()) {
				throw new Error(`Клиентский MCP подключён к ${health.database ?? '<неизвестно>'}, ожидалась ${options.database}.`);
			}
			const names = new Set((await listManagedClientMcpTools()).map(tool => tool.name));
			for (const required of ['class_method_add', 'class_method_change', 'class_member_get']) {
				if (!names.has(required)) { throw new Error(`Клиентский MCP не предоставляет ${required}. Проверьте роль разработчика.`); }
			}
			const created = nativeResult(await callManagedClientMcpTool('class_method_add', {
				Class: String(ownerClassId), MethodName: name, isConstructor: false, isStatic: isStatic ?? false,
				SysPackage: owner.packagename,
			}));
			createdId = Number(created.id);
			if (!Number.isSafeInteger(createdId) || createdId <= 0) { throw new Error('Нативный MCP не вернул ID созданного метода. Проверьте класс перед повтором.'); }
			const binding = await bridgeToolResult({ action: 'bind_objects_to_package', objectIds: [createdId],
				templateObjectId: ownerClassId, expectedDatabase: options.database,
				expectedHost: options.host, expectedPort: options.port });
			if (binding.isError) { throw new Error(binding.content[0]?.text ?? 'Не удалось привязать метод к пакету.'); }
			const changed = nativeResult(await callManagedClientMcpTool('class_method_change', { Member: String(createdId), Code: code }));
			if (Number(changed.id) !== createdId) { throw new Error(`Изменён неожиданный метод ${changed.id}.`); }
			const reread = nativeResult(await callManagedClientMcpTool('class_member_get', { Members: [String(createdId)] }));
			const items = reread.items as Array<{ item?: { code?: string } }> | undefined;
			if (items?.[0]?.item?.code?.replace(/\r\n/g, '\n').trim() !== code.replace(/\r\n/g, '\n').trim()) {
				throw new Error('Контрольное чтение метода не совпало с записанным кодом.');
			}
			const saved = await queryDatabaseRaw<OwnerPackageRow>(
				`SELECT method.sysfile, file.filename, package.packagename
				 FROM abstract method JOIN sysfile file ON file.id=method.sysfile
				 JOIN sysgroups grp ON grp.id=file.sysgroup JOIN syspackages package ON package.id=grp.package
				 WHERE method.id=$1`, [createdId]);
			if (Number(saved[0]?.sysfile) !== Number(owner.sysfile) || saved[0]?.packagename !== owner.packagename) {
				throw new Error(`Метод ${createdId} не подтверждён в пакетном файле ${owner.sysfile}.`);
			}
			const compiled = await bridgeToolResult({ action: 'compile_method', id: createdId,
				expectedDatabase: options.database, expectedHost: options.host, expectedPort: options.port });
			if (compiled.isError) { throw new Error(compiled.content[0]?.text ?? 'Не удалось запустить компиляцию.'); }
			const compilation = (compiled.structuredContent as { result?: { passed?: boolean } })?.result;
			const outcome = { methodId: createdId, name, database: options.database,
				packageName: owner.packagename, sysFileId: owner.sysfile, compilation };
			return { isError: compilation?.passed !== true,
				content: [{ type: 'text' as const, text: JSON.stringify(outcome, null, 2) }], structuredContent: outcome };
		} catch (error) {
			return { isError: true, content: [{ type: 'text' as const,
				text: `${createdId ? `Метод ID=${createdId} уже создан. ` : ''}${error instanceof Error ? error.message : String(error)} Повторное создание не выполняйте до проверки текущего состояния.` }] };
		} finally {
			if (started) { await stopManagedClientMcp().catch(() => undefined); }
		}
	});
}
