import type {TaskPageInput} from '../../../features/production-tasks/taskPage';
import {commands} from '../../../features/production-tasks/commands';
import {bridgeToolResult} from '../../bridge';
import type {McpToolServer} from '../../toolTypes';
export function registerTool(server:McpToolServer){server.registerTool('get_production_tasks_page',{
 description:'Прочитать страницу задач через выбранный источник OENP. created_from/created_to — включительный диапазон дат ISO; after_id — курсор по убывающему ID. Продолжать с next_after_id, пока has_more. Описания и комментарии не загружаются. Публичный MCP не поддерживает эту операцию.',
 inputSchema:commands.get_production_tasks_page.schema.shape,annotations:{readOnlyHint:true},
},async (input:TaskPageInput)=>bridgeToolResult({action:'get_production_tasks_page',...input},90000));}
