/** The registration surface used by tool modules, independent of SDK declaration requirements. */
export interface McpToolServer {
	registerTool<Input>(
		name: string,
		config: {
			description: string;
			inputSchema: Record<string, unknown>;
			annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
		},
		handler: (input: Input) => Promise<McpToolResult>,
	): unknown;
}

export interface McpToolResult {
	content: Array<{ type: 'text'; text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}
