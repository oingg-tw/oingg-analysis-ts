import { describe, expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { runScreener, runScreenerRanking, ScreenerValidationError } from '@/application/screener/service';
import type { IndustryReferenceDataPort } from '@/application/ports/industryReference';
import type { CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { MetricValueQueryPort, SymbolScope } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-09-20 應 bff-ts 要求新增 excludeSectorCodes——釘住 use case 這一層把 sectorCodes / excludeSectorCodes
// 轉成 SymbolScope 的規則：include/exclude 二擇一、兩者同給 400、代碼合法性檢查兩邊共用、空陣列等同沒給。
// SQL 本身（= ANY vs <> ALL）由 screenerQueries 的 Prisma.Sql 組裝負責，這裡只看傳進 port 的 scope 形狀。
// 真實數字的補集關係（無參數 = include + exclude）2026-09-20 已用 dev DB 實測過一次（1378 = 141 + 1237）。

const SECTOR_MEMBERS: Record<string, string[]> = { '24': ['2330', '2454'], '17': ['2881', '2882'] };

const industryReference = (): Pick<IndustryReferenceDataPort, 'isValidSecuritiesSectorCode' | 'listCompaniesBySectorCodes'> => ({
  isValidSecuritiesSectorCode: (code) => code in SECTOR_MEMBERS,
  listCompaniesBySectorCodes: async (codes) => new Set(codes.flatMap((c) => SECTOR_MEMBERS[c] ?? [])),
});

// 把 port 收到的 scope 記下來，回傳空結果（我們只關心 scope 長什麼樣）。
const capturingQueries = (): { port: Pick<MetricValueQueryPort, 'screen' | 'rank'>; captured: { scope: SymbolScope | null }[] } => {
  const captured: { scope: SymbolScope | null }[] = [];
  return {
    captured,
    port: {
      screen: async (_f, _c, _p, _ps, _s, scope) => {
        captured.push({ scope });
        return [];
      },
      rank: async (_r, _d, _l, _c, scope) => {
        captured.push({ scope });
        return [];
      },
    },
  };
};

const companyProfiles = (): Pick<CompanyProfilePort, 'getCompanyNamesForSymbols'> => ({ getCompanyNamesForSymbols: async () => new Map() });

const depsWith = (queries: Pick<MetricValueQueryPort, 'screen' | 'rank'>) =>
  createTestDeps({
    metricValueQueries: queries as MetricValueQueryPort,
    industryReference: industryReference() as IndustryReferenceDataPort,
    companyProfiles: companyProfiles() as CompanyProfilePort,
  });

const base = { filters: [{ field: 'roe.TTM', min: 0, max: null }], columns: [], page: 1, pageSize: 10 };

describe('sectorCodes / excludeSectorCodes → SymbolScope', () => {
  test('都沒給 → scope 為 null（行為跟以前完全一樣）', async () => {
    const { port, captured } = capturingQueries();
    await runScreener(base, depsWith(port));
    expect(captured[0]!.scope).toBeNull();
  });

  test('空陣列等同沒給', async () => {
    const { port, captured } = capturingQueries();
    await runScreener({ ...base, sectorCodes: [], excludeSectorCodes: [] }, depsWith(port));
    expect(captured[0]!.scope).toBeNull();
  });

  test('sectorCodes → include，展開成該類股的公司清單', async () => {
    const { port, captured } = capturingQueries();
    await runScreener({ ...base, sectorCodes: ['24'] }, depsWith(port));
    expect(captured[0]!.scope).toEqual({ include: ['2330', '2454'] });
  });

  test('excludeSectorCodes → exclude，展開成要排除的公司清單（多個代碼聯集）', async () => {
    const { port, captured } = capturingQueries();
    await runScreener({ ...base, excludeSectorCodes: ['24', '17'] }, depsWith(port));
    expect(captured[0]!.scope).toEqual({ exclude: ['2330', '2454', '2881', '2882'] });
  });

  test('兩者同給 → 400，不定義優先順序', async () => {
    const { port } = capturingQueries();
    await assert.rejects(() => runScreener({ ...base, sectorCodes: ['24'], excludeSectorCodes: ['17'] }, depsWith(port)), ScreenerValidationError);
  });

  test('excludeSectorCodes 裡的非法代碼 → 400，錯誤訊息指名是哪個參數', async () => {
    const { port } = capturingQueries();
    await assert.rejects(() => runScreener({ ...base, excludeSectorCodes: ['99'] }, depsWith(port)), (e: Error) => e instanceof ScreenerValidationError && e.message.includes('excludeSectorCodes'));
  });

  test('GET /screener/ranking 走同一套規則', async () => {
    const { port, captured } = capturingQueries();
    await runScreenerRanking({ field: 'roe.TTM', direction: 'desc', limit: 5, columns: [], excludeSectorCodes: ['17'] }, depsWith(port));
    expect(captured[0]!.scope).toEqual({ exclude: ['2881', '2882'] });
  });
});
