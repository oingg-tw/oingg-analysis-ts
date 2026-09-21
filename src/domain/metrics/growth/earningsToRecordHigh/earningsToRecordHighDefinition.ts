import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21 使用者提供顧廣平、張家瑜、蔡承祐（2025）〈盈餘動能與盈餘創新高動能〉（東吳經濟商學
// 學報 111 期）並要求納入：論文定義「單季盈餘對歷史最高單季盈餘比率 = 最近公告單季稅後盈餘 /
// 歷史最高單季稅後盈餘（不含當季）」。論文正文用「自 TEJ 有資料日起」的全歷史最高值，但附註 1
// 明載審查者建議改用近三年/近五年最高，且「其盈餘創新高輸家、贏家和動能組合之平均報酬及其檢定
// 結果與未限定之表 3 結果非常近似」——本站採**近三年（12 季，不含本季）**版本，理由：
//   (1) 這是論文自己驗證過等價的變體，不是本站自創；
//   (2) 本站 XBRL 季報全市場覆蓋從 109Q3 起，「全歷史」在資料上撐不起來（2026-09 否決「營收創歷史
//       新高」候選就是這個理由，見 memory project_revenue_all_time_high_rejected），三年窗口剛好落在
//       覆蓋範圍內。
// 12 季只要缺任何一季就回 insufficient_history（不用「有幾季算幾季」——窗口變短「創新高」就失真）。
export const earningsToRecordHighDefinition: MetricDefinitionSpec = {
  metricCode: 'earningsToRecordHigh',
  name: '盈餘創新高比率',
  nameEn: 'Earnings to Record High',
  unit: '%',
  formulaNote:
    '= 本季淨利 / 近三年（前 12 季，不含本季）最高單季淨利 * 100。淨利優先採歸屬母公司口徑，缺漏退回' +
    '整體口徑（比照 pickNetIncome）。前 12 季任一季缺漏為 insufficient_history；前 12 季最高淨利 ≤ 0' +
    '（三年來沒有一季賺錢）為 zero_or_negative_denominator。100 以上代表本季創三年新高。只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{EarningsToRecordHigh} = \\frac{\\mathrm{NetIncome}_t}{\\max_{i=1}^{12} \\mathrm{NetIncome}_{t-i}} \\times 100',
  academicSourceUrl: 'https://business.scu.edu.tw/sites/default/files/2025-12/IJ-01.PDF',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 1,
};
