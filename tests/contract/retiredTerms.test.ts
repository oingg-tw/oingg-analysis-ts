import { expect, test } from 'vitest';
import { buildOpenApiDocument } from '@/bootstrap/openapi';
import { createHttpModules } from '@/bootstrap/httpModules';
import { appDeps } from '@/bootstrap/deps';

// 2026-10-10 全生態系詞彙表（UBIQUITOUS_LANGUAGE.md）的防退化：對外文件裡出現退役詞就失敗。
// 2026-10-11 並存期提前結束（使用者決定）：退役名稱一律不能出現，不論有沒有標 deprecated。
// 新增退役詞時，跟詞彙表第二節的「退役的同義詞」欄一起改。
const RETIRED_NAMES = new Set(['basis', 'token', 'periodType', 'season', 'direction', 'sortOrder', 'paidInShares', 'industryName', 'financialReportType', 'rocFiscalYear', 'metricKey', 'reportDate', 'isEmerging', 'marketType', 'marketCode', 'preferredStockShares']);
// fieldKey 不在清單：舊 filterCatalog 的 metricKey.fieldKey 已整套刪除，現在 fieldKey 只剩溯源表項目一種意思（XBRL account_code），
// 詞彙表第八節有寫。業務中台 screener 裡殘留的 metricKey／fieldKey 是他們那邊的改名項目。
const isRetired = (name: string): boolean => RETIRED_NAMES.has(name) || name.endsWith('Percent');

type Hit = { name: string; deprecated: boolean; at: string };
const collect = (node: unknown, path: string, hits: Hit[]): void => {
  if (Array.isArray(node)) return node.forEach((n, i) => collect(n, `${path}[${i}]`, hits));
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.parameters)) {
    for (const p of obj.parameters as Record<string, unknown>[]) {
      const name = String(p.name);
      const deprecated = p.deprecated === true || (p.schema as Record<string, unknown> | undefined)?.deprecated === true;
      if (isRetired(name)) hits.push({ name, deprecated, at: `${path} 參數` });
    }
  }
  if (obj.properties && typeof obj.properties === 'object') {
    for (const [name, prop] of Object.entries(obj.properties as Record<string, Record<string, unknown>>)) {
      if (isRetired(name)) hits.push({ name, deprecated: prop.deprecated === true, at: `${path}.properties.${name}` });
    }
  }
  for (const [k, v] of Object.entries(obj)) collect(v, `${path}.${k}`, hits);
};

test('退役詞一律不能出現在對外文件', () => {
  const document = buildOpenApiDocument(createHttpModules(appDeps), { port: 3000 });
  const hits: Hit[] = [];
  collect(document, '', hits);
  const violations = hits.map((h) => `${h.name}（${h.at}）`);
  expect(violations).toEqual([]);
});

test('守門本身會抓：沒標 deprecated 的退役參數與欄位', () => {
  const hits: Hit[] = [];
  collect({ paths: { '/x': { get: { parameters: [{ name: 'basis', schema: {} }, { name: 'periodType', schema: { deprecated: true } }], responses: { 200: { properties: { yoyChangePercent: {}, timeframe: {} } } } } } } }, '', hits);
  expect(hits.filter((h) => !h.deprecated).map((h) => h.name)).toEqual(['basis', 'yoyChangePercent']);
});
