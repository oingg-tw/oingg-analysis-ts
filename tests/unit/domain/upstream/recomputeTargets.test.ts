import { describe, expect, test } from 'vitest';
import { quarterIndex, toRecomputeTargets, type UpstreamRowChange } from '@/domain/upstream/recomputeTargets';

// 釘住會安靜算錯的地方：民國／西元年不混用、同一家取最早的季、日資料「最新一天」不回溯季報但「更正舊日」要、
// 歷史下限與最新一季的夾住、認不得的表要進 unmapped 而不是被吞掉。
const bounds = { historyFloorIndex: quarterIndex(109, 3), latestQuarterIndex: quarterIndex(115, 2) };
const mops = (tableName: string, symbol: string | null, key: Record<string, unknown>): UpstreamRowChange => ({ source: 'mops', tableName, symbol, key });

describe('toRecomputeTargets', () => {
  test('mops 財報類取同一家最早的季；早於歷史下限的夾到下限', () => {
    const t = toRecomputeTargets(
      [
        mops('quarterly_income_statement_xbrl', '2330', { year: 113, quarter: 3, data_type: '2', subsidiary_company_id: '' }),
        mops('equity_change_xbrl', '2330', { year: 112, quarter: 4, data_type: '2', subsidiary_company_id: '', member: 'TotalEquityMember' }),
        mops('bank_income_statement_detail_xbrl', '2801', { year: 108, quarter: 3, data_type: '2', subsidiary_company_id: '' }),
      ],
      bounds
    );
    expect(t.quarterlyFrom.get('2330')).toBe(quarterIndex(112, 4));
    expect(t.quarterlyFrom.get('2801')).toBe(bounds.historyFloorIndex);
    expect(t.unmapped.size).toBe(0);
  });

  test('股本是西元年、股利是日期：都換成民國季，並觸發逐日型', () => {
    const t = toRecomputeTargets(
      [mops('capital_stock_history', '3041', { effective_year: 2025, effective_month: 5 }), mops('dividend_distribution', '1101', { rights_record_date: '2026-07-20' })],
      bounds
    );
    expect(t.quarterlyFrom.get('3041')).toBe(quarterIndex(114, 2));
    expect(t.quarterlyFrom.get('1101')).toBe(quarterIndex(115, 2)); // 2026-07 是 115Q3，超過目前最新一季 115Q2，夾到 115Q2
    expect([...t.dailyLatest].sort()).toEqual(['1101', '3041']);
  });

  test('日資料：最新一天只算逐日型；比最新一天舊的是更正，要從那一季重算', () => {
    const t = toRecomputeTargets(
      [
        { source: 'tpex', tableName: 'daily_price', symbol: '6488', key: { date: '2026-09-30' } },
        { source: 'tpex', tableName: 'daily_price', symbol: '8069', key: { date: '2026-09-30' } },
        { source: 'tpex', tableName: 'daily_price', symbol: '8069', key: { date: '2025-03-14' } },
      ],
      bounds
    );
    expect([...t.dailyLatest].sort()).toEqual(['6488', '8069']);
    expect(t.quarterlyFrom.has('6488')).toBe(false);
    expect(t.quarterlyFrom.get('8069')).toBe(quarterIndex(114, 1));
  });

  test('月營收兩種鍵形狀都認得；大盤變動 → beta 全市場', () => {
    const t = toRecomputeTargets(
      [
        { source: 'tpex', tableName: 'monthly_revenue', symbol: '6488', key: { year_month: '2026-08-01' } },
        { source: 'twse', tableName: 'monthly_revenue', symbol: '2330', key: { year: 2026, month: 7 } },
        { source: 'twse', tableName: 'daily_taiex_index', symbol: null, key: { date: '2026-09-30' } },
      ],
      bounds
    );
    expect(t.monthlyFrom.get('6488')).toBe(202608);
    expect(t.monthlyFrom.get('2330')).toBe(202607);
    expect(t.dailyLatestAll).toBe(true);
  });

  test('除權息只拿來比對，記 ignored；認不得的表與鍵記 unmapped，不吞掉', () => {
    const t = toRecomputeTargets(
      [
        { source: 'tpex', tableName: 'ex_right_dividend', symbol: '8440', key: { ex_right_date: '2026-09-30' } },
        mops('audit_scope_xbrl', '2330', { foo: 1 }),
        mops('capital_stock_history', '2330', { effective_year: '2025' }),
      ],
      bounds
    );
    expect(Object.fromEntries(t.ignored)).toEqual({ 'tpex.ex_right_dividend': 1 });
    expect(Object.fromEntries(t.unmapped)).toEqual({ 'mops.audit_scope_xbrl': 1, 'mops.capital_stock_history': 1 });
    expect(t.quarterlyFrom.size).toBe(0);
  });
});
