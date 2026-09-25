import { describe, expect, test } from 'vitest';
import { getCompanyDividendHistory } from '@/application/companies/dividendHistory';
import type { DividendDistributionRow, DividendEventsPort } from '@/application/ports/dividendEvents';
import type { MarketDataPort } from '@/application/ports/marketData';
import type { MetricValueQueryPort, PeriodHistoryRow } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 歷年股利表的口徑用手工 seed 釘住：季配公司年度彙總、payoutRatio 用年報 EPS（eps.FY）、yieldAtExDate 用除息日
// 收盤價、EPS ≤ 0 / 四季不齊 / 查無股價的 null 分支。真實數字（2330）由 contract golden 守形狀。

const day = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

const row = (partial: Partial<DividendDistributionRow> & { rocFiscalYear: number }): DividendDistributionRow => ({
  fiscalQuarter: null,
  cashDividendFromEarnings: null,
  cashDividendFromCapitalReserve: null,
  stockDividendFromEarnings: null,
  stockDividendFromCapitalReserve: null,
  exDividendDate: null,
  exRightsDate: null,
  cashDividendPaymentDate: null,
  announcementDate: null,
  ...partial,
});

const dividendEvents = (rows: DividendDistributionRow[]): Pick<DividendEventsPort, 'listDividendDistributionRows'> => ({
  listDividendDistributionRows: async () => rows,
});

// eps.FY 的原始列（年報 EPS，座標是該年度第四季）。只回應 periodType 'FY'——退回拿 eps.Q 四季相加會直接丟錯，
// 那正是 2026-09-25 拿掉的口徑（年度數字必須來自年報，見 UBIQUITOUS_LANGUAGE.md〈三〉）。
const epsRows = (values: Record<string, number | null>): Pick<MetricValueQueryPort, 'listPeriodMetricHistoryRows'> => ({
  listPeriodMetricHistoryRows: async (_symbol, _metricCode, periodType) => {
    if (periodType !== 'FY') throw new Error(`年度 EPS 必須讀 eps.FY（年報），不是 ${periodType}`);
    return Object.entries(values).map(([fy, value]): PeriodHistoryRow => (
      { fiscalYear: Number(fy), fiscalQuarter: 4, value, nullReason: value === null ? 'missing_input' : null, knowledgeDate: day(`${Number(fy) + 1}-03-15`), knowledgeDateIsFallback: false }
    ));
  },
});

const market = (closes: Record<string, number>): Pick<MarketDataPort, 'getStockPrice'> => ({
  getStockPrice: async (_symbol, asOf) => {
    const key = asOf.toISOString().slice(0, 10);
    return key in closes ? { closePrice: closes[key]!, tradeDate: key } : null;
  },
});

const depsFor = (rows: DividendDistributionRow[], eps: Record<string, number | null>, closes: Record<string, number>) =>
  createTestDeps({
    dividendEvents: dividendEvents(rows) as DividendEventsPort,
    metricValueQueries: epsRows(eps) as MetricValueQueryPort,
    market: market(closes) as MarketDataPort,
  });

describe('getCompanyDividendHistory', () => {
  test('查無分派紀錄 → entries 空陣列，不碰 EPS/股價', async () => {
    const deps = createTestDeps({ dividendEvents: dividendEvents([]) as DividendEventsPort });
    expect(await getCompanyDividendHistory('9999', deps)).toEqual({ symbol: '9999', entries: [] });
  });

  test('季配公司：同一所屬年度四筆彙總成一列，exDividendDate/paymentDate 取最後一次，殖利率是四次加總', async () => {
    const rows = [1, 2, 3, 4].map((q) =>
      row({
        rocFiscalYear: 113,
        fiscalQuarter: q,
        cashDividendFromEarnings: 4,
        exDividendDate: day(`2025-0${q + 2}-15`),
        cashDividendPaymentDate: day(`2025-0${q + 3}-10`),
        announcementDate: day(`2025-0${q + 1}-20`),
      })
    );
    // 2024（民國 113）年報 EPS 40 → payoutRatio = 16/40 = 40%；四個除息日收盤價都 400 → 每次 1%，加總 4%。
    const deps = depsFor(rows, { '2024': 40 }, { '2025-03-15': 400, '2025-04-15': 400, '2025-05-15': 400, '2025-06-15': 400 });

    const { entries } = await getCompanyDividendHistory('2330', deps);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fiscalYear: 2024,
      rocFiscalYear: 113,
      cashDividend: 16,
      stockDividend: 0,
      totalDividend: 16,
      distributionCount: 4,
      exDividendDate: '2025-06-15',
      paymentDate: '2025-07-10',
      eps: 40,
      payoutRatio: 40,
      yieldAtExDate: 4,
      knowledgeDate: '2025-05-20',
    });
    expect(entries[0]!.events.map((e) => e.yieldAtExDate)).toEqual([1, 1, 1, 1]);
  });

  test('年配公司多年：舊 → 新排序；沒有年報時 EPS 為 null、EPS ≤ 0 時 payoutRatio 為 null、查無股價時殖利率為 null', async () => {
    const rows = [
      row({ rocFiscalYear: 112, cashDividendFromEarnings: 2, stockDividendFromEarnings: 0.5, exDividendDate: day('2024-07-01') }),
      row({ rocFiscalYear: 111, cashDividendFromEarnings: 1.5, exDividendDate: day('2023-07-01') }),
      row({ rocFiscalYear: 113, cashDividendFromEarnings: 1, exDividendDate: day('2025-07-01') }),
    ];
    const deps = depsFor(
      rows,
      { '2022': 4 /* 2023 沒有年報 */, '2024': -4 },
      { '2023-07-01': 30 } // 只有 2023 那次有股價
    );

    const { entries } = await getCompanyDividendHistory('1234', deps);
    expect(entries.map((e) => e.fiscalYear)).toEqual([2022, 2023, 2024]);
    expect(entries[0]).toMatchObject({ cashDividend: 1.5, eps: 4, payoutRatio: 37.5, yieldAtExDate: 5 });
    expect(entries[1]).toMatchObject({ cashDividend: 2, stockDividend: 0.5, totalDividend: 2.5, eps: null, payoutRatio: null, yieldAtExDate: null });
    expect(entries[2]).toMatchObject({ eps: -4, payoutRatio: null, yieldAtExDate: null });
  });
});
