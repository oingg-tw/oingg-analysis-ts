import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendYield',
  name: '殖利率',
  unit: '%',
  formulaNote:
    'TWSE/TPEx 官方每日公布的殖利率，直接 passthrough export.daily_valuation.dividend_yield，' +
    '本服務不自己重算——沒有自算對應版本可比較，直接沿用交易所數字最貼近使用者查詢' +
    '「殖利率」時的預期（跟大盤/看盤軟體顯示的數字一致）。' +
    '證交所自 2026-08-28 起對沒有配息的上市公司改為不填殖利率（之前填 0.00），此後上市公司的空白殖利率以 0 計，' +
    '跟之前的序列與上櫃公司的寫法一致。',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E7%8F%BE%E9%87%91%E6%AE%96%E5%88%A9%E7%8E%87',
  tier: 'raw',
  sources: ['證交所／櫃買中心每日評價指標（本益比／股價淨值比／殖利率）'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['daily_valuation.dividend_yield'],
  currentFormulaVersion: 1,
};
