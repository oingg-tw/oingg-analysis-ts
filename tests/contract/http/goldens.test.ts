import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { API_KEY, startApp } from './harness';
import { shape } from './shape';

// HTTP golden（clean architecture 重構 Phase 0）：bff-ts 實際消費的 45 支端點（2026-09-17
// 由 bff-ts 提供的完整清單，其餘端點沒有任何 client 在呼叫）各打一次最小合法請求，把
// `{ status, body 形狀 }` 釘進 __snapshots__/goldens/<slug>.json。輸入固定用 2330（歷史最完整）。
// 形狀遮罩規則見 shape.ts；nullable 欄位仍可能隨上游資料 null↔number 翻轉，接受偶爾 -u，
// nullability 本身由 openapi.test.ts 的 snapshot 釘住。
//
// 刻意不打的：POST /batch/compute/* —— 那支會同步跑完整批次計算（有真實副作用）且每小時
// 限 5 次，「batch 在 bffAuth 之外」這個決策改由 Phase 4 的 HttpModule.auth 標籤單元測試釘住。
interface GoldenCase {
  slug: string;
  method: 'get' | 'post';
  path: string;
  body?: Record<string, unknown>;
}

const cases: GoldenCase[] = [
  { slug: 'metrics', method: 'get', path: '/metrics' },
  { slug: 'screener-post', method: 'post', path: '/screener', body: { filters: [{ field: 'roe.TTM', min: 0, max: null }], columns: [{ field: 'roe.TTM' }], page: 1, pageSize: 5 } },
  { slug: 'screener-ranking', method: 'get', path: '/screener/ranking?field=roe.TTM&direction=desc&limit=5' },
  { slug: 'screener-values', method: 'post', path: '/screener/values', body: { symbols: ['2330', '2317'], columns: [{ field: 'roe.TTM' }] } },
  { slug: 'screener-company-rank', method: 'get', path: '/screener/company-rank?symbol=2330&field=dividendYield.EOD&direction=desc' },
  { slug: 'valuation-ranking', method: 'get', path: '/valuation/ranking?metric=peRatio&order=desc&limit=5' },
  { slug: 'stocks-quote', method: 'get', path: '/stocks/2330/quote' },
  { slug: 'stocks-prices', method: 'get', path: '/stocks/prices?symbols=2330,2317' },
  { slug: 'stocks-daily-price-history', method: 'get', path: '/stocks/2330/daily-price-history?limit=5' },
  { slug: 'stocks-ex-dividend-notices', method: 'get', path: '/stocks/ex-dividend-notices?symbols=2330,2317' },
  { slug: 'stocks-ex-dividend-calendar', method: 'get', path: '/stocks/ex-dividend-calendar?month=2026-09' },
  { slug: 'stocks-foreign-shareholding-history', method: 'get', path: '/stocks/2330/foreign-shareholding-history?limit=5' },
  { slug: 'stocks-summary', method: 'get', path: '/stocks/2330/summary' },
  { slug: 'companies-list', method: 'get', path: '/companies?limit=5&offset=0' },
  { slug: 'companies-profile', method: 'get', path: '/companies/profile?symbol=2330' },
  { slug: 'companies-financial-statement', method: 'get', path: '/companies/financial-statement?symbol=2330&statementType=balanceSheet' },
  { slug: 'companies-badges', method: 'get', path: '/companies/badges?symbol=2330' },
  { slug: 'companies-beta', method: 'get', path: '/companies/beta?symbol=2330' },
  { slug: 'companies-peer-group', method: 'get', path: '/companies/peer-group?symbol=2330&minPeers=5' },
  { slug: 'companies-metric-history', method: 'get', path: '/companies/metric-history?symbol=2330&metricCode=eps&timeframe=TTM&limit=5' },
  { slug: 'companies-metrics-history', method: 'get', path: '/companies/metrics-history?symbol=2330&metricCodes=roe,eps&timeframe=TTM&limit=5' },
  { slug: 'companies-dupont-history', method: 'get', path: '/companies/dupont-history?symbol=2330&limit=5' },
  { slug: 'companies-monthly-revenue-history', method: 'get', path: '/companies/monthly-revenue-history?symbol=2330&limit=5' },
  { slug: 'companies-capital-stock-history', method: 'get', path: '/companies/capital-stock-history?symbol=2330' },
  { slug: 'companies-piotroski-breakdown', method: 'get', path: '/companies/piotroski-breakdown?symbol=2330' },
  { slug: 'companies-metric-provenance', method: 'get', path: '/companies/2330/metric-provenance?metricCode=roe' },
  { slug: 'preferred-stocks-field-catalog', method: 'get', path: '/preferred-stocks/field-catalog' },
  { slug: 'preferred-stocks', method: 'get', path: '/preferred-stocks?limit=5' },
  { slug: 'industries-tree', method: 'get', path: '/industries/tree' },
  { slug: 'industries-flat', method: 'get', path: '/industries/flat' },
  { slug: 'industries-securities-sectors', method: 'get', path: '/industries/securities-sectors' },
  { slug: 'industries-chain-classification', method: 'get', path: '/industries/chain-classification' },
  { slug: 'industries-chain-clusters', method: 'get', path: '/industries/chain-clusters' },
  { slug: 'industries-chain-tree', method: 'get', path: '/industries/chain-tree' },
  { slug: 'securities', method: 'get', path: '/securities?limit=5&offset=0' },
  { slug: 'market-margin-short-ratio-ranking', method: 'get', path: '/market/margin-short-ratio-ranking?limit=5' },
  { slug: 'market-material-announcements', method: 'get', path: '/market/material-announcements?limit=5' },
  { slug: 'market-revenue-ranking', method: 'get', path: '/market/revenue-ranking?metric=yoy&order=desc&limit=5' },
  { slug: 'market-volume-top20', method: 'get', path: '/market/volume-top20' },
  { slug: 'market-disposed-stocks', method: 'get', path: '/market/disposed-stocks?limit=5' },
  { slug: 'market-attention-stocks', method: 'get', path: '/market/attention-stocks?limit=5' },
  { slug: 'market-price-limit-range', method: 'get', path: '/market/price-limit-range' },
  { slug: 'market-price-change-ranking', method: 'get', path: '/market/price-change-ranking?limit=5' },
  { slug: 'market-etf-ranking', method: 'get', path: '/market/etf-ranking?metric=aum&order=desc&limit=5' },
  { slug: 'market-taiex-daily-price', method: 'get', path: '/market/taiex-daily-price?limit=5' },
  { slug: 'etf-screener-filters', method: 'get', path: '/etf-screener/filters' },
  { slug: 'etf-screener-post', method: 'post', path: '/etf-screener', body: { filters: [], columns: [{ field: 'aum' }], page: 1, pageSize: 5 } },
  // 不在 bff-ts 的 45 支清單裡，但 Phase 4 逐模組改寫前一併釘住（macro 兩支是第一個改寫的範本模組）。
  { slug: 'macro-equity-risk-premium', method: 'get', path: '/macro/equity-risk-premium?startYear=2020&startMonth=1&endYear=2025&endMonth=12' },
  { slug: 'macro-gov-bond-yield-10y', method: 'get', path: '/macro/gov-bond-yield-10y' },
];

let harness: Awaited<ReturnType<typeof startApp>>;

beforeAll(async () => {
  harness = await startApp();
}, 60_000);

afterAll(async () => {
  await harness.close();
});

describe('bff-ts 消費的端點：狀態碼 + 回應形狀', () => {
  for (const c of cases) {
    test(`${c.method.toUpperCase()} ${c.path}`, async () => {
      const req = c.method === 'get' ? harness.api.get(c.path) : harness.api.post(c.path).send(c.body);
      const res = await req.set('X-Api-Key', API_KEY);
      const golden = JSON.stringify({ status: res.status, body: shape(res.body) }, null, 2);
      await expect(golden).toMatchFileSnapshot(`./__snapshots__/goldens/${c.slug}.json`);
    }, 30_000);
  }
});

describe('固定案例（精確 body，不是形狀）', () => {
  test('GET / 健康檢查：公開、不需要密鑰', async () => {
    const res = await harness.api.get('/');
    expect(res.status).toBe(200);
    expect(typeof res.body.startupTime).toBe('string');
  });

  test('缺必填參數 → 400，body 是 zod .format() 形狀', async () => {
    const res = await harness.api.get('/companies/metric-history').set('X-Api-Key', API_KEY);
    expect(res.status).toBe(400);
    await expect(JSON.stringify(res.body, null, 2)).toMatchFileSnapshot('./__snapshots__/goldens/_400-missing-query.json');
  });

  test('不帶 X-Api-Key → 401 精確 body', async () => {
    const res = await harness.api.get('/metrics');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Unauthorized: missing or invalid X-Api-Key header.' });
  });

  test('metricCode=beta 走 metric-history → 400（服務層驗證錯誤，只有 message）', async () => {
    const res = await harness.api.get('/companies/metric-history?symbol=2330&metricCode=beta&timeframe=1Y_1D').set('X-Api-Key', API_KEY);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body)).toEqual(['message']);
  });

  // 2026-09-17 Phase 4（薄 controller / validate middleware / errorHandler 接 AppError）之前補的精確 body 案例：
  // 這幾種回應今天是各 controller 手寫的 res.status(...).json(...)，重構後改由 middleware/errorHandler 統一產出，
  // 狀態碼跟 body 一個 byte 都不能變。
  const exactCases: { slug: string; path: string; status: number }[] = [
    { slug: '_404-stocks-quote-unknown-symbol', path: '/stocks/9999/quote', status: 404 },
    { slug: '_404-companies-profile-unknown-symbol', path: '/companies/profile?symbol=9999', status: 404 },
    { slug: '_400-stocks-prices-empty-symbols', path: '/stocks/prices?symbols=', status: 400 },
    { slug: '_400-query-after-params', path: '/stocks/2330/foreign-shareholding-history?limit=0', status: 400 },
    { slug: '_400-screener-company-rank-unknown-field', path: '/screener/company-rank?symbol=2330&field=nope.TTM&direction=desc', status: 400 },
  ];
  for (const c of exactCases) {
    test(`${c.path} → ${c.status} 精確 body`, async () => {
      const res = await harness.api.get(c.path).set('X-Api-Key', API_KEY);
      expect(res.status).toBe(c.status);
      await expect(JSON.stringify(res.body, null, 2)).toMatchFileSnapshot(`./__snapshots__/goldens/${c.slug}.json`);
    });
  }
});
