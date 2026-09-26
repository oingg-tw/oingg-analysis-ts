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

// closesAsc：最近一次面額變更生效月前 120 天到股價日的收盤價（由舊到新）。
export const lastConfirmedParChangeBefore = (rowsAsc: ParRow[], priceDate: Date): ParChange | null =>
  confirmedChanges(rowsAsc).changes.filter((c) => c.ym <= ymOf(priceDate)).at(-1) ?? null;

const monthStart = (ym: number) => new Date(Date.UTC(Math.floor(ym / 100), (ym % 100) - 1, 1));
const SWITCH_ASSUMED_AFTER_DAYS = 180;

// 換發判斷（2026-09-26 第二版，第一版在 8476／7803 誤判「未換發」）：
// - 窗口內找到「÷(舊面額/新面額)」那一跳 → 已換發。窗口從生效月前 120 天起算：換發前常停止交易一段時間（8476 換發前最後一筆
//   成交在 11 月前、跳動在 2024-11-11），市場換發也可能早於股本歷史記的月份（5314 在 2025-03-31 跳、紀錄在 2025-07）。
// - 沒找到，但股價序列沒涵蓋到變更之前（7803 股價 2026-05 才有）→ 無從觀察，視為已換發。
// - 沒找到，但距生效已超過 180 天 → 視為已換發（新股不會半年都還沒換發）。
const isSwitched = (change: ParChange, closesAsc: { date: Date; close: number }[], priceDate: Date): boolean => {
  const expected = change.newPar / change.oldPar;
  for (let i = 1; i < closesAsc.length; i++) {
    const r = closesAsc[i]!.close / closesAsc[i - 1]!.close / expected;
    if (r > 0.4 && r < 1.6) return true;
  }
  const start = monthStart(change.ym);
  if (closesAsc.length === 0 || closesAsc[0]!.date >= start) return true;
  return (priceDate.getTime() - start.getTime()) / 86_400_000 > SWITCH_ASSUMED_AFTER_DAYS;
};

export const parBasisFactor = (rowsAsc: ParRow[], closesAsc: { date: Date; close: number }[], priceDate: Date, basisDate: Date): number => {
  const { initialPar, changes } = confirmedChanges(rowsAsc);
  if (changes.length === 0) return 1;
  // 一年內兩次以上面額變更（5314 10→0.5→10→0.5）＝股本歷史本身不可信，不換算（維持原始成交價），不要在亂的資料上疊換算。
  for (let i = 1; i < changes.length; i++) if (changes[i]!.ym - changes[i - 1]!.ym < 100) return 1;
  const basisPar = parAt(initialPar, changes, basisDate);
  const last = changes.filter((c) => c.ym <= ymOf(priceDate)).at(-1);
  const tradingPar = last ? (isSwitched(last, closesAsc, priceDate) ? last.newPar : last.oldPar) : parAt(initialPar, changes, priceDate);
  return basisPar !== null && tradingPar !== null ? basisPar / tradingPar : 1;
};
