import { z } from 'zod';

export const upstreamChangesBodySchema = z.object({
  source: z.enum(['mops', 'tpex', 'twse']).meta({ description: '哪一個上游' }),
  upToId: z.number().int().nonnegative().meta({ description: '這次讓 analysis 處理到該上游 export.row_changes 的哪一個 id（含）；mops 填通過的放行批次的 mops_to_id' }),
  tables: z.array(z.string()).optional().meta({ description: '選填，這次有變動的表名，只用來寫紀錄給人看，處理時不靠它判斷' }),
});

export const upstreamChangesResultSchema = z.object({
  queued: z.boolean().meta({ description: 'false = upToId 沒有比這個來源已收過的大（重送或亂序），什麼都沒做' }),
  queueId: z.string().nullable().meta({ description: '新待辦的 id；queued=false 時是 null' }),
  processorTriggered: z.boolean().meta({ description: '是否已叫醒處理程式；false 不代表遺失——待辦已存下，下一次通知會再叫' }),
});
