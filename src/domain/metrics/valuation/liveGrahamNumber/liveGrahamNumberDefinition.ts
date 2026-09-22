import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應 web-nuxt 要求新增——grahamNumber 的即時版本，見
// computeLiveGrahamNumberPit.ts 檔頭說明。逐日型（snapshot），不是季報型，跟 grahamNumber
// 的 group:'period' 不同。
export const liveGrahamNumberDefinition: MetricDefinitionSpec = {
  metricCode: 'liveGrahamNumber',
  name: '葛拉漢數字',
  nameSuffix: '即時',
  unit: '倍',
  formulaNote:
    '= PER(TTM，當下最新收盤價/最新已申報 EPS TTM) × PBR（當下最新收盤價/最新已申報 BVPS）。基本面跟' +
    'grahamNumber 完全相同，股價改用當下最新收盤價，每個交易日更新，跟 grahamNumber（凍結在財報公告' +
    '當天）是刻意並存、互不影響的兩支獨立 metricCode。（2026-09-22 formulaVersion 2：中繼的每股值改用不四捨五入的精確值，只在最後結果四捨五入一次；v1 拿已進位到分的 EPS/BVPS 再算，小 EPS 公司失真。）',
  formulaLatex: '\\mathrm{LiveGrahamNumber} = \\mathrm{PER}_{\\mathrm{TTM}} \\times \\mathrm{PBR}',
  // 2026-09-20 移除原本的 academicSourceUrl（archive.org/details/intelligentinves00grah_1）——
  // 實際打開確認那是 **2005 年版**（不是徽章宣稱的 1949 初版）、而且是 access-restricted 需要
  // 借閱才能看（點過去看不到任何內容），項目本身還標示「FOR LITIGATION USE ONLY」，不適合當
  // 給終端使用者查證的公開連結。referenceUrl 的英文維基 Graham number 條目有完整公式與 22.5
  // 的推導（15 倍本益比 × 1.5 倍股價淨值比），查證管道不受影響。
  referenceUrl: 'https://en.wikipedia.org/wiki/Graham_number',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity', 'paidInShares', 'daily_price.close'],
  currentFormulaVersion: 2,
};
