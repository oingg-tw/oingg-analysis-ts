// 2026-10-01 興櫃半年頻：從累計（年初至該季）數字推出半年期間的流量——下半年 = 年報累計 − Q2 累計，上半年 = Q2 累計本身。
// 逐欄位相減：任一邊 null → null（缺就是缺，不猜）；但「null 代表那段期間沒發生」的欄位（現金流量表的 dividendsPaid，
// mops-ts 確認過的語意）當 0 相減——不然「上半年沒配、下半年有配」的公司下半年會被算成 null。
// 非 bigint 欄位（reportDate、fieldKey 字串）取較晚那份。
export const subtractCumulative = <T extends { reportDate: Date }>(later: T, earlier: T, zeroWhenNull: readonly (keyof T)[] = []): T => {
  const out = { ...later } as Record<string, unknown>;
  for (const key of Object.keys(later) as (keyof T & string)[]) {
    const a: unknown = later[key];
    const b: unknown = earlier[key];
    if ((typeof a !== 'bigint' && a !== null) || (typeof b !== 'bigint' && b !== null)) continue;
    const zero = zeroWhenNull.includes(key);
    const x: bigint | null = a === null ? (zero ? 0n : null) : (a as bigint);
    const y: bigint | null = b === null ? (zero ? 0n : null) : (b as bigint);
    out[key] = x === null || y === null ? null : x - y;
  }
  return out as T;
};
