/** A single Streamable HTTP MCP session used by the local stdio bridge. */
export class UpstreamMcp {
	private sessionId?: string;

	public constructor(private readonly url: string, private readonly token: string) {}

	public async send(message: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			authorization: `Bearer ${this.token}`,
		};
		if (this.sessionId) { headers['mcp-session-id'] = this.sessionId; }
		const response = await fetch(this.url, {
			method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(120_000),
		});
		if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
		this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId;
		if (response.status === 202 || !('id' in message)) { return undefined; }
		const body = await response.text();
		if (response.headers.get('content-type')?.includes('text/event-stream')) {
			const data = body.split(/\r?\n/).filter(line => line.startsWith('data:'));
			if (!data.length) { throw new Error('Пустой ответ MCP.'); }
			return JSON.parse(data[data.length - 1].slice(5).trim()) as Record<string, unknown>;
		}
		return JSON.parse(body) as Record<string, unknown>;
	}

	public async close(): Promise<void> {
		if (!this.sessionId) { return; }
		try {
			await fetch(this.url, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${this.token}`, 'mcp-session-id': this.sessionId },
				signal: AbortSignal.timeout(2_000),
			});
		} catch { /* Session cleanup is best effort. */ }
	}
}

export function safeUpstreamError(error: unknown): string {
	if (!(error instanceof Error)) { return 'неизвестная ошибка'; }
	if (error.name === 'TimeoutError' || error.name === 'AbortError') { return 'истекло время ожидания'; }
	if (/^HTTP \d{3}$/.test(error.message)) { return error.message; }
	const code = (error.cause as { code?: unknown } | undefined)?.code;
	if (typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code)) { return code; }
	return 'сетевая ошибка';
}
