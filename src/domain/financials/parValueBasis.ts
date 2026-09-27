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

export interface ParChange {
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
// 2026-09-27 回傳換發「日期」（即時每股基準要知道哪天換算），規則同上；null＝到 priceDate 還沒換發。
export const parSwitchDate = (change: ParChange, closesAsc: { date: Date; close: number }[], priceDate: Date): Date | null => {
  const expected = change.newPar / change.oldPar;
  for (let i = 1; i < closesAsc.length; i++) {
    const r = closesAsc[i]!.close / closesAsc[i - 1]!.close / expected;
    if (r > 0.4 && r < 1.6) return closesAsc[i]!.date;
  }
  const start = monthStart(change.ym);
  if (closesAsc.length === 0 || closesAsc[0]!.date >= start) return start;
  const assumed = new Date(start.getTime() + SWITCH_ASSUMED_AFTER_DAYS * 86_400_000);
  return priceDate > assumed ? assumed : null;
};

const isSwitched = (change: ParChange, closesAsc: { date: Date; close: number }[], priceDate: Date): boolean => parSwitchDate(change, closesAsc, priceDate) !== null;

// 已確認的面額變更；一年內兩次以上（5314）視為股本歷史不可信，回空（跟 parBasisFactor 同一條規則）。
export const confirmedParChanges = (rowsAsc: ParRow[]): ParChange[] => {
  const { changes } = confirmedChanges(rowsAsc);
  for (let i = 1; i < changes.length; i++) if (changes[i]!.ym - changes[i - 1]!.ym < 100) return [];
  return changes;
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

// 2026-09-27 跨期比較每股數字時的面額還原（使用者：「算法要盡可能反映內在價值的變化」，IAS 33 對股票分割追溯調整前期每股數字）。
// 回傳 from 之後、to 當月以前（含）生效的已確認面額變更累積「股數倍數」：前期每股數字 ÷ 倍數、前期股數 × 倍數，就換算到 to 的股數基準。
// 跟每股指標讀股本的規則一致（生效年月 ≤ 查詢日的最新一筆），所以股本歷史裡來回跳的面額（5314 10→0.5→10→0.5）連乘會自然抵銷，
// 結果跟兩期實際用到的股數列一致；只有股數沒跟著反比例變動的面額（印錯）不算。
export const shareSplitFactor = (rowsAsc: ParRow[], fromDate: Date, toDate: Date): number =>
  confirmedChanges(rowsAsc)
    .changes.filter((c) => c.ym > ymOf(fromDate) && c.ym <= ymOf(toDate))
    .reduce((factor, c) => factor * (c.oldPar / c.newPar), 1);

// 2026-09-27 規則 B：股本歷史漏記面額變更（3093 2022-12 面額 10→2.5、4763 2025-06 10→1、7780 2026-01 10→1）。
// 面額變更不改股本金額、只改股數，資產負債表（規則 A）看不出來。兩個獨立證據都要成立才補一筆變更：
// 1. company_profile（現況快照）的面額跟股本歷史最新一列不同、實收資本相同（±2%）——排除「漏的其實是增減資」。
// 2. 最新一列生效之後，股價出現「÷(舊面額/新面額)」那一跳（容許 ±40%，比漲跌停 10% 寬、比反向跳動窄）——日期取跳動那天。
// 面額欄寫錯的（6564 股本歷史寫 32、現況 10）股價不會跳 3.2 倍，不會被補成變更。
// 補出的列：生效月＝跳動當月、面額＝現況面額、股數＝實收資本 ÷ 新面額（資本不變）。
// ponytail: 跳動在股價資料起點（2020-11）之前、或換發期間停牌跨過跳動的，找不到就不補（維持現狀）；目前 3 家都找得到。
export const inferUnrecordedParChange = (
  latest: { parValue: number | null; paidInCapital: bigint | null },
  profile: { parValue: number | null; paidInCapital: bigint | null },
  closesSinceLatestAsc: { date: Date; close: number }[]
): ParRow | null => {
  const oldPar = latest.parValue;
  const newPar = profile.parValue;
  if (!oldPar || !newPar || oldPar <= 0 || newPar <= 0 || oldPar === newPar) return null;
  if (!latest.paidInCapital || !profile.paidInCapital || Math.abs(Number(profile.paidInCapital) / Number(latest.paidInCapital) - 1) > 0.02) return null;
  const expected = newPar / oldPar;
  for (let i = 1; i < closesSinceLatestAsc.length; i++) {
    const r = closesSinceLatestAsc[i]!.close / closesSinceLatestAsc[i - 1]!.close / expected;
    if (r > 0.6 && r < 1.4) return { ym: ymOf(closesSinceLatestAsc[i]!.date), parValue: newPar, shares: BigInt(Math.round(Number(latest.paidInCapital) / newPar)) };
  }
  return null;
};

// 2026-09-27 減資恢復交易日（即時每股基準用）：股本歷史記的是登記月，市場上舊股停止交易、換發新股後才以新基準恢復交易。
// 找「停止交易 5 天以上之後」的第一筆收盤價跳動：彌補虧損的減資 ≈ ÷倍數（股數 ×0.8 → 股價 ×1.25）；退還股款 ≈ (停止前收盤 − 每舊股退還現金) ÷ 倍數，
// 退還現金＝面額 × 減少比例（照面額退）。兩種預期取比較接近的，差 10% 內才算（恢復交易當天漲跌停 10%）。
// 只看停止交易後那一筆：退還股款的預期跳幅可能接近 1（例如 ×1.17），一般交易日的漲停就會誤判（單元測試抓到）。
// 減少不到約兩成的（多半是註銷庫藏股、限制員工權利新股，流通股數本來就不含、股價也不跳）跟一般漲跌分不開，不處理。
const RESUMPTION_MIN_GAP_DAYS = 5;
export const capitalReductionResumption = (
  multiplier: number,
  parValue: number,
  closesAsc: { date: Date; close: number }[]
): { date: Date; cashPerOldShare: number } | null => {
  if (!(multiplier > 0) || 1 / multiplier < 1.2) return null;
  const cash = parValue * (1 - multiplier);
  for (let i = 1; i < closesAsc.length; i++) {
    if ((closesAsc[i]!.date.getTime() - closesAsc[i - 1]!.date.getTime()) / 86_400_000 < RESUMPTION_MIN_GAP_DAYS) continue;
    const prev = closesAsc[i - 1]!.close;
    const r = closesAsc[i]!.close / prev;
    const lossOffset = Math.abs(r * multiplier - 1);
    const cashReturnExpected = (1 - cash / prev) / multiplier;
    const cashReturn = cashReturnExpected > 0 ? Math.abs(r / cashReturnExpected - 1) : Infinity;
    if (Math.min(lossOffset, cashReturn) <= 0.1) return { date: closesAsc[i]!.date, cashPerOldShare: cashReturn < lossOffset ? cash : 0 };
  }
  return null;
};
