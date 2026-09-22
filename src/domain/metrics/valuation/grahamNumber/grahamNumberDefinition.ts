import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

  // 2026-09-11 使用者要求：徽章（門檻/篩選指標）保留每日更新的版本就好——股價/市值這類
  // 徽章比較應該用「今天」的即時市場價格搭配「最新公布財報」的基本面數據，不要用凍結在
  // 財報公告當天的季報快照。徽章移到 liveGrahamNumber（見該資料夾），這支季報型
  // grahamNumber 保留純數字查詢用途，不再掛 badge。
  // 第六批遷移（第三層：guru 分類 9 支重型多因子模型）：範圍刻意限縮成只遷移「最終分數/
  // 輸出」，不拆分內部子變量成獨立 metric_code（Piotroski 的 9 訊號、Beneish 的 8 變量、
  // Ohlson 的 9 變量、Altman 的 X1-X5、Nissim-Penman 的 FLEV/NBC/SPREAD 都是模型內部
  // 機制，不是一般會單獨查詢比較的財務比率）。grahamNumber/altmanZScore/
  // nissimPenmanRnoa 獨立重新實作，不依賴 eps/bvps/interestCoverage/assetTurnover/roe
  // 這些已遷移 metric_code。piotroskiFScore/beneishMScore/ohlsonOScore 第一次用到 YoY
  // 比較——沒有專門的「去年同季」查詢函式，重用既有 getPastNQuarters({rocYear,season},5)[0]
  // 拿去年同季的 year/season，不是新機制。
export const grahamNumberDefinition: MetricDefinitionSpec = {
  metricCode: 'grahamNumber',
  name: '葛拉漢數字',
  unit: '倍',
  // 2026-09-10 使用者要求：公式改成 PER(TTM) × PBR，不要讓股價變成單獨要比較的變量——
  // 原本 sqrt(22.5×EPS×BVPS) vs 股價的寫法，股價是拿來跟這支指標的結果比較用的額外
  // 變量；改成 PER×PBR 之後股價已經內含在 PER/PBR 各自的比率裡，門檻直接是
  // 「grahamNumber < 22.5」的常數比較。數學上完全等價：Price < sqrt(22.5×EPS×BVPS)
  // ⟺ Price² < 22.5×EPS×BVPS ⟺ (Price/EPS)×(Price/BVPS) < 22.5 ⟺ PER×PBR < 22.5
  // （EPS/BVPS/Price 皆為正時）。單位從「元」改成「倍」——不再是每股金額，是兩個比率
  // 相乘的無因次數字。
  formulaNote:
    '= PER(TTM，股價/EPS) × PBR（股價/BVPS）。PER/PBR 獨立重新計算，不依賴 peRatio/' +
    'pbRatio 這兩個 metric_code 已寫入的值。只有 TTM 一種 basis——沿用 peRatio 的 TTM 基準。（2026-09-22 formulaVersion 2：中繼的每股值改用不四捨五入的精確值，只在最後結果四捨五入一次；v1 拿已進位到分的 EPS/BVPS 再算，小 EPS 公司失真。）',
  formulaLatex: '\\mathrm{GrahamNumber} = \\mathrm{PER}_{\\mathrm{TTM}} \\times \\mathrm{PBR}',
  // 出處是葛拉漢《The Intelligent Investor》(1949)，不是期刊論文——archive.org 上該書
  // 掃描本需要借閱帳號（access-restricted），沒有完全公開的版本，仍是合法可查證的出處連結。
  academicSourceUrl: 'https://archive.org/details/intelligentinves00grah_1',
  referenceUrl: 'https://en.wikipedia.org/wiki/Graham_number',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
  currentFormulaVersion: 2,
};
