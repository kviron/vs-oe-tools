import * as assert from 'node:assert/strict';
// Match the production MCP runtime's CommonJS loading; SDK declarations require
// DOM/ESM types that are outside this extension's Node-only TypeScript project.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
import { registerTools } from '../mcp/tools/registration';
import type { McpToolServer } from '../mcp/toolTypes';

suite('Command MCP protocol', () => {
	test('SDK lists shared schemas and rejects bad enum input before database access', async () => {
		const server=new McpServer({name:'contract-test',version:'1.0.0'});
		const client=new Client({name:'contract-test-client',version:'1.0.0'});
		registerTools(server as unknown as McpToolServer);
		const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
		try{
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const {tools}:{tools:Array<{name:string;inputSchema:{required?:string[]}}>}=await client.listTools();
			assert.equal(new Set(tools.map(tool=>tool.name)).size,tools.length);
			for(const name of ['create_enum_element','update_enum_element','compile_method','get_production_task']){
				assert.ok(tools.some(tool=>tool.name===name),name);
			}
			const create=tools.find(tool=>tool.name==='create_enum_element')!;
			assert.deepEqual([...create.inputSchema.required!].sort(),['classId','fullName','name','ord']);
			const response=await client.callTool({name:'create_enum_element',arguments:{
				classId:10609210,name:'Test',fullName:'Test',ord:0.5,
			}});
			assert.equal(response.isError,true);
		}finally{
			await Promise.allSettled([client.close(),server.close()]);
		}
	});
});
