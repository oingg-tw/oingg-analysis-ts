// 2026-09-26 面額變更前後，股價與股數的「面額基準」對齊（使用者拍板）。
// 問題：股本歷史記的是法定生效月，市場上新股換發交易要晚一段時間。5904 寶雅 2026-06 面額 10→1（股數 ×10），
// 115Q2 每股數字已用新股數，但 06-30 市場上成交的還是舊股（約 667 元）→ 市值 7,100 億（實際約 710 億）、本益比 196。
// 反方向：6949 2026-07 面額 10→0.5，115Q2 每股數字是季末舊股數，若公告日時已換發，股價是新基準 → 差 20 倍。
// 做法：price_for_basis = close × 面額(基準日) ÷ 交易面額(股價日)。
// - 面額(基準日)：基準日當下生效的面額（每股指標用報告日；市值用股價日本身）。
// - 交易面額(股價日)：最近一次面額變更後，股價序列出現過「÷(舊面額/新面額)」那一跳才算換發完成，否則仍是舊面額。
// 只採信「股數也反比例變動」的面額變更（±20%）：股本歷史有印錯的面額（4157 0.03→0.003→0.03、5314 來回跳），
// 不驗證股數會把印錯的面額當成真的變更，對正確的股價亂換算。
// ponytail: 換發日靠日收盤價跳動偵測（容許 ±60%），同月內兩次變更或停牌跨過換發日時可能判斷錯；目前 2020 起約 25 家。
export interface ParRow {
  ym: number; // 生效年*100+月
  parValue: number | null;
  shares: bigint | null;
}

interface ParChange {
  ym: number;
  oldPar: number;
  newPar: number;
}

const confirmedChanges = (rowsAsc: ParRow[]): { initialPar: number | null; changes: ParChange[] } => {
  let current: ParRow | null = null;
  const changes: ParChange[] = [];
  let initialPar: number | null = null;
  for (const row of rowsAsc) {
    if (row.parValue === null || row.parValue <= 0) continue;
    if (current === null) {
      current = row;
      initialPar = row.parValue;
      continue;
    }
    const oldPar: number = current.parValue!;
    if (row.parValue !== oldPar) {
      const expectedShareRatio = oldPar / row.parValue;
      const shareRatio = current.shares && row.shares ? Number(row.shares) / Number(current.shares) : null;
      // 股數沒跟著反比例變 → 視為面額印錯，不當成變更（沿用舊面額）
      if (shareRatio === null || Math.abs(shareRatio / expectedShareRatio - 1) > 0.2) continue;
      changes.push({ ym: row.ym, oldPar, newPar: row.parValue });
    }
    current = { ...row, parValue: row.parValue };
  }
  return { initialPar, changes };
};

const ymOf = (d: Date) => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;

const parAt = (initialPar: number | null, changes: ParChange[], date: Date): number | null => {
  const applicable = changes.filter((c) => c.ym <= ymOf(date));
  return applicable.length > 0 ? applicable.at(-1)!.newPar : initialPar;
};

// closesAsc：最近一次面額變更生效月月初到股價日的收盤價（由舊到新）
export const lastConfirmedParChangeBefore = (rowsAsc: ParRow[], priceDate: Date): ParChange | null =>
  confirmedChanges(rowsAsc).changes.filter((c) => c.ym <= ymOf(priceDate)).at(-1) ?? null;

export const parBasisFactor = (rowsAsc: ParRow[], closesAsc: number[], priceDate: Date, basisDate: Date): number => {
  const { initialPar, changes } = confirmedChanges(rowsAsc);
  if (changes.length === 0) return 1;
  const basisPar = parAt(initialPar, changes, basisDate);
  const last = changes.filter((c) => c.ym <= ymOf(priceDate)).at(-1);
  let tradingPar = parAt(initialPar, changes, priceDate);
  if (last) {
    const expectedPriceRatio = last.newPar / last.oldPar;
    let switched = false;
    for (let i = 1; i < closesAsc.length && !switched; i++) {
      const r = closesAsc[i]! / closesAsc[i - 1]!;
      if (r / expectedPriceRatio > 0.4 && r / expectedPriceRatio < 1.6) switched = true;
    }
    tradingPar = switched ? last.newPar : last.oldPar;
  }
  return basisPar !== null && tradingPar !== null ? basisPar / tradingPar : 1;
};
