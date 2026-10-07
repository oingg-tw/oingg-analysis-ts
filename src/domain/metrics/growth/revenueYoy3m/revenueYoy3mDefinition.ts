import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-07 使用者要求的可排行指標「月營收近三個月累計年增率」——第二支月頻指標（metric_monthly_values）。
// 單月年增率雜訊大（工作天數、出貨時點），三個月累計是市場上常見的平滑做法；跟 revenueGrowthRate（季報單季）
// 不同：這支每月更新、次月 10 日前就知道，比季報早一個多月。
// 去年同期使用者 2026-10-07 選定用「12 個月前各月實際申報的當月營收」（跟 sus 同一份序列），不用公司當月附的
// 「去年同月」比較數（可能經過重編）——兩種做法差在合併、重編過的公司。
export const revenueYoy3mDefinition: MetricDefinitionSpec = {
  metricCode: 'revenueYoy3m',
  name: '近三個月累計營收年增率',
  nameEn: '3-Month Cumulative Revenue YoY',
  unit: '%',
  formulaNote:
    '= (近 3 個月營收合計 − 去年同 3 個月營收合計) / |去年同 3 個月營收合計| × 100。去年同期取 12 個月前各月當時申報的' +
    '單月營收（跟 sus 同一份月營收序列，不用公司附的去年同月比較數）。需要目標月往前連續 15 個月無缺漏，' +
    '任一月缺漏為 insufficient_history；去年合計為 0 為 zero_or_negative_denominator。座標是營收所屬年月，' +
    'knowledge date 是目標月營收的公告日（查無時用次月 10 日申報期限）。',
  formulaLatex:
    '\\mathrm{RevenueYoY}_{3m} = \\frac{\\sum_{i=0}^{2} R_{t-i} - \\sum_{i=0}^{2} R_{t-12-i}}{\\left|\\sum_{i=0}^{2} R_{t-12-i}\\right|} \\times 100',
  referenceUrl: 'https://mopsov.twse.com.tw/mops/web/t05st10_ifrs',
  tier: 'derived',
  sources: ['上市公司月營業收入彙總表（TWSE）', '上櫃公司月營業收入彙總表（TPEx）'],
  group: 'monthly',
  dependsOn: ['current_month_revenue'],
  currentFormulaVersion: 1,
};
