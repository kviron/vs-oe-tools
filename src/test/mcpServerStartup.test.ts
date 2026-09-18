import * as assert from 'node:assert';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

suite('MCP server startup', () => {
	test('initializes without command-line flags', async () => {
		const child = spawn(process.execPath, [path.resolve(__dirname, '../../dist/mcp-server.js')], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		try {
			const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('MCP initialization timed out.')), 5_000);
				let output = '';
				let errors = '';
				child.stderr.setEncoding('utf8');
				child.stderr.on('data', chunk => { errors += chunk; });
				child.stdout.setEncoding('utf8');
				child.stdout.on('data', chunk => {
					output += chunk;
					const newline = output.indexOf('\n');
					if (newline < 0) { return; }
					clearTimeout(timeout);
					try { resolve(JSON.parse(output.slice(0, newline)) as Record<string, unknown>); }
					catch (error) { reject(new Error(`Invalid MCP response: ${output}\n${errors}`, { cause: error })); }
				});
				child.once('error', reject);
				child.once('exit', code => {
					if (code && output.length === 0) { reject(new Error(`MCP exited with code ${code}: ${errors}`)); }
				});
				child.stdin.write(`${JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2025-06-18',
						capabilities: {},
						clientInfo: { name: 'zero-flags-smoke', version: '1.0.0' },
					},
				})}\n`);
			});
			assert.equal(response.jsonrpc, '2.0');
			assert.equal(response.id, 1);
			assert.equal((response.result as { serverInfo?: { name?: string } }).serverInfo?.name, 'vc-ve-tools-database');
		} finally {
			child.kill();
		}
	});
});
