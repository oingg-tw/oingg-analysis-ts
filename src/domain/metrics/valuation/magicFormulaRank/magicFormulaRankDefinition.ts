import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-15：Joel Greenblatt 神奇公式（Magic Formula Investing，《The Little Book
// That Beats the Market》，2005）——把 greenblattRoc（資本報酬率）跟
// greenblattEarningsYield（盈餘收益率）分別在全市場橫斷面排名（數值越高名次越前面），
// 兩個名次相加得出合併名次，數字越小代表兩項指標同時表現越好。這不是單一公司能獨立
// 算出來的指標（原始定義本來就是「跟全市場其他公司比較」），跟這個 codebase 其餘
// compute*Pit.ts 逐一公司獨立計算的模式不同，是批次全市場橫斷面計算，見
// scripts/backfillMagicFormulaRankPit.ts 的完整實作說明——沒有對應的 computeAndWrite
// 單一公司函式。
//
// 排除金融保險業（跟 greenblattRoc/greenblattEarningsYield 兩支底層指標排除範圍一致，
// isFinancialIndustryCompany）；沒有設市值門檻（原書 $50-100M 是美股脈絡，台股上市櫃
// 公司規模本來就遠比美股全市場小很多，先不加門檻，如果之後發現極小盤股的數字異常擠進
// 排行前段，再考慮加門檻）。任一底層指標算不出來的公司直接不參與排名（不寫入
// magicFormulaRank，不是寫 value:null）——只要這個 metricCode 存在一列，值恆為真實
// 整數名次，沒有 nullReason 的情境。
export const magicFormulaRankDefinition: MetricDefinitionSpec = {
  metricCode: 'magicFormulaRank',
  name: '神奇公式合併名次',
  nameEn: 'Magic Formula Combined Rank',
  unit: '名次',
  formulaNote:
    '= greenblattRoc(TTM) 全市場排名（數值越高名次越前面）+ greenblattEarningsYield(TTM) ' +
    '全市場排名（數值越高名次越前面）。合併名次越小（例如 2）代表兩項指標同時排名都很前面，' +
    '是「便宜又賺錢」的公司；只計算兩項指標皆非 null 的公司，排除金融保險業，沒有市值門檻。' +
    '每次全市場批次重算，不是逐一公司獨立算出來的。',
  formulaLatex: '\\mathrm{MagicFormulaRank} = \\mathrm{Rank}(\\mathrm{GreenblattRoc}) + \\mathrm{Rank}(\\mathrm{GreenblattEarningsYield})',
  academicSourceUrl: 'https://www.wiley.com/en-us/The+Little+Book+That+Still+Beats+the+Market-p-9780470624159',
  referenceUrl: 'https://www.investing.com/academy/analysis/what-is-magic-formula-investing/',
  tier: 'composite',
  sources: ['本服務已算出的 greenblattRoc/TTM', '本服務已算出的 greenblattEarningsYield/TTM'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['greenblattRoc', 'greenblattEarningsYield'],
  currentFormulaVersion: 1,
};
