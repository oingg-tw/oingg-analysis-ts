import { Router } from 'ultimate-express';
import type { AppDeps } from '@/application/deps';
import { ValidationError } from '@/application/errors';
import { listCompanies, getCompanyProfile } from '@/application/companies/directory';
import {
  getCompanyCapitalStockHistory,
  getCompanyRoeHistory,
  getCompanyRoaHistory,
  getCompanyDupontHistory,
  getCompanyMetricHistory,
  getCompanyMetricsHistory,
  getCompanyMonthlyRevenueHistory,
  getCompanyBeta,
} from '@/application/companies/history';
import { getCompanyDividendHistory } from '@/application/companies/dividendHistory';
import { getCompanyFinancialStatement } from '@/application/companies/financialStatement';
import { getCompanyPeerGroup } from '@/application/companies/peerGroup';
import { getCompanyBadges, getCompanyMetricCompleteness, getCompanyPiotroskiBreakdown, getCompanyMetricProvenance } from '@/application/companies/insights';
import { jsonRoute } from '@/http/route';
import {
  getCompaniesQuerySchema,
  getCompanyProfileQuerySchema,
  getCompanyCapitalStockHistoryQuerySchema,
  getCompanyDividendHistoryQuerySchema,
  getCompanyRoeHistoryQuerySchema,
  getCompanyRoaHistoryQuerySchema,
  getCompanyDupontHistoryQuerySchema,
  getCompanyMetricHistoryQuerySchema,
  getCompanyMetricsHistoryQuerySchema,
  getCompanyMonthlyRevenueHistoryQuerySchema,
  getCompanyFinancialStatementQuerySchema,
  getCompanyPeerGroupQuerySchema,
  getCompanyPiotroskiBreakdownQuerySchema,
  getCompanyMetricProvenanceQuerySchema,
  getCompanyBadgesQuerySchema,
  getCompanyMetricCompletenessQuerySchema,
  getCompanyBetaQuerySchema,
} from './schemas';

// 16 支 /companies/* 端點——掛載順序沿用舊 route.ts。provenance 那支需要整份 PitDeps（107 支 resolver 各自挑不同
// port），所以這個工廠直接收 AppDeps。
export const createCompaniesRouter = (deps: AppDeps): Router => {
  const router = Router();

  router.get('/companies', ...jsonRoute({ query: getCompaniesQuerySchema }, ({ query }) => listCompanies(query, deps)));
  router.get('/companies/profile', ...jsonRoute({ query: getCompanyProfileQuerySchema }, ({ query }) => getCompanyProfile(query.symbol, deps)));
  router.get('/companies/capital-stock-history', ...jsonRoute({ query: getCompanyCapitalStockHistoryQuerySchema }, ({ query }) => getCompanyCapitalStockHistory(query.symbol, deps)));
  router.get('/companies/dividend-history', ...jsonRoute({ query: getCompanyDividendHistoryQuerySchema }, ({ query }) => getCompanyDividendHistory(query.symbol, deps)));
  router.get('/companies/roe-history', ...jsonRoute({ query: getCompanyRoeHistoryQuerySchema }, ({ query }) => getCompanyRoeHistory(query, deps)));
  router.get('/companies/roa-history', ...jsonRoute({ query: getCompanyRoaHistoryQuerySchema }, ({ query }) => getCompanyRoaHistory(query, deps)));
  router.get('/companies/dupont-history', ...jsonRoute({ query: getCompanyDupontHistoryQuerySchema }, ({ query }) => getCompanyDupontHistory(query, deps)));
  router.get('/companies/metric-history', ...jsonRoute({ query: getCompanyMetricHistoryQuerySchema }, ({ query }) => getCompanyMetricHistory(query, deps)));
  router.get('/companies/metrics-history', ...jsonRoute({ query: getCompanyMetricsHistoryQuerySchema }, ({ query }) => getCompanyMetricsHistory(query, deps)));
  router.get('/companies/monthly-revenue-history', ...jsonRoute({ query: getCompanyMonthlyRevenueHistoryQuerySchema }, ({ query }) => getCompanyMonthlyRevenueHistory(query, deps)));
  router.get('/companies/financial-statement', ...jsonRoute({ query: getCompanyFinancialStatementQuerySchema }, ({ query }) => getCompanyFinancialStatement(query, deps)));
  router.get('/companies/peer-group', ...jsonRoute({ query: getCompanyPeerGroupQuerySchema }, ({ query }) => getCompanyPeerGroup(query, deps)));
  router.get('/companies/piotroski-breakdown', ...jsonRoute({ query: getCompanyPiotroskiBreakdownQuerySchema }, ({ query }) => getCompanyPiotroskiBreakdown(query, deps)));
  // 順序跟以前一樣：先驗 query（400 + errors），再檢查路徑參數（400 純 `{ message }`）——路徑有 :symbol 時 express
  // 一定會塞值，這個檢查只是防禦性保留。
  router.get(
    '/companies/:symbol/metric-provenance',
    ...jsonRoute({ query: getCompanyMetricProvenanceQuerySchema }, async ({ query }, req) => {
      const symbol = req.params.symbol;
      if (!symbol) throw new ValidationError('symbol is required.');
      return getCompanyMetricProvenance(symbol, query, deps);
    })
  );
  router.get('/companies/badges', ...jsonRoute({ query: getCompanyBadgesQuerySchema }, ({ query }) => getCompanyBadges(query.symbol, deps)));
  router.get('/companies/metric-completeness', ...jsonRoute({ query: getCompanyMetricCompletenessQuerySchema }, ({ query }) => getCompanyMetricCompleteness(query.symbol, deps)));
  router.get('/companies/beta', ...jsonRoute({ query: getCompanyBetaQuerySchema }, ({ query }) => getCompanyBeta(query.symbol, deps)));

  return router;
};
