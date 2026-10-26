import {z} from 'zod';
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Invalid calendar date');
export const taskPageSchema=z.object({created_from:day.optional(),created_to:day.optional(),after_id:z.number().int().positive().safe().optional(),limit:z.number().int().min(1).max(99)});
export type TaskPageInput=z.infer<typeof taskPageSchema>;
/** Validated literals only: OENP readonly query packets do not expose bind parameters. */
export function productionTaskPageSql(input:TaskPageInput, query?: string){
 const value=taskPageSchema.parse(input);if(Boolean(value.created_from)!==Boolean(value.created_to)||value.created_from&&value.created_from>value.created_to!){throw Error('Supply an ordered pair of created_from and created_to');}
 const filters:string[]=[];
 if(value.created_from){filters.push(`T0.CreDate >= CAST('${value.created_from}' AS DATE)`,`T0.CreDate < CAST('${value.created_to}' AS DATE) + 1`);}
 if(value.after_id){filters.push(`T0.ID < ${value.after_id}`);}
 const search = query?.trim();
 if (search) {
  const literal = search.replace(/'/g, "''");
  filters.push(`(position(lower('${literal}') in lower(COALESCE(T0.Description, ''))) > 0`
   + ` OR position('${literal}' in CAST(T0.ID AS VARCHAR(64))) > 0`
   + ` OR position('${literal}' in CAST(T0.DNumber AS VARCHAR(64))) > 0)`);
 }
 return `SELECT T0.ID AS id, COALESCE(CAST(T0.DNumber AS VARCHAR(64)), '') AS number,
 COALESCE(CAST(left(T0.Description, 6000) AS VARCHAR(6000)), '') AS title,
 COALESCE(CAST(DateToStrFmt(T0.CreDate, 'dd.mm.yyyy hh:mm:ss') AS VARCHAR(32)), '') AS created,
 COALESCE(CAST(S.FName AS VARCHAR(250)), '') AS state
FROM WorkDoc T0 LEFT JOIN StateLC S ON S.ID = T0.LCStateID${filters.length?`\nWHERE ${filters.join(' AND ')}`:''}
ORDER BY T0.ID DESC
LIMIT ${value.limit+1}`;
}
