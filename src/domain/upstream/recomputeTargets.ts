// 2026-09-30 上游變動通知 → 要重算哪些東西（使用者拍板：上游 POST「處理到第幾筆」、我們存成待辦、處理程式讀各家
// export.row_changes 那一段明細來換算）。這裡是純換算，不碰 DB；處理程式（scripts/processUpstreamChangesPit.ts）照結果重算。
//
// 三家 row_changes 的形狀相同（id, table_name, symbol, key jsonb, change_kind），key 是主鍵裡 symbol 以外的部分：
//   mops 財報類   {year(民國), quarter, data_type, subsidiary_company_id, member?}
//   mops 股本     {effective_year(西元), effective_month}
//   mops 股利     {rights_record_date: 'YYYY-MM-DD'}
//   mops 公告日   {fiscal_year(民國), fiscal_quarter}
//   tpex 日資料   {date: 'YYYY-MM-DD'}；月營收 {year_month: 'YYYY-MM-01'}
//   twse 日資料   {date}；月營收 {year, month}（西元）
//
// 換算規則的共同原則：從「最早受影響的那一季」重算到最新一季（變動會往後傳到 TTM、YoY、連續年數，見
// refreshChangedQuartersPit.ts 檔頭）；認不得的表**不默默跳過**，記進 unmapped 讓人看見（使用者：現階段不能用
// 任何兜底掩蓋正向流程的缺失）。

export type UpstreamSource = 'mops' | 'tpex' | 'twse';

export interface UpstreamRowChange {
  source: UpstreamSource;
  tableName: string;
  symbol: string | null;
  key: Record<string, unknown>;
}

export interface RecomputeTargets {
  quarterlyFrom: Map<string, number>; // symbol → 最早要重算的季（quarterIndex）
  dailyLatest: Set<string>; // 要重算最新一筆逐日型指標（beta、交易所本益比等、live*）的公司
  dailyLatestAll: boolean; // 大盤指數變了：beta 全市場都要重算
  monthlyFrom: Map<string, number>; // symbol → 最早要重算的月（yyyymm，SUS）
  ignored: Map<string, number>; // 已知不是指標輸入的表（例如除權息只用在跨源比對）
  unmapped: Map<string, number>; // 認不得的表或鍵，要人看
}

export const quarterIndex = (rocYear: number, quarter: number): number => rocYear * 4 + (quarter - 1);

const quarterOfDate = (isoDate: string): number | null => {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(isoDate);
  return m ? quarterIndex(Number(m[1]) - 1911, Math.ceil(Number(m[2]) / 3)) : null;
};

// 只是跨源比對或轉發給前端的表，不是任何指標的輸入。列出來是為了跟「認不得」分開——認不得要人看，這些不用。
const NON_METRIC_TABLES = new Set(['ex_right_dividend', 'ex_dividend_notice']);

// 2026-10-08 twse-ts／tpex-ts 的 row_changes.table_name 改成複數（view 改名成 v_＋複數的同一批），舊列也一起改；
// 新舊名都認（切換當下的批次可能混雜），一律轉回單數再判斷。mops 沒改名。
const TWSE_TPEX_SINGULAR: Record<string, string> = {
  daily_prices: 'daily_price',
  daily_valuations: 'daily_valuation',
  daily_taiex_indices: 'daily_taiex_index',
  monthly_revenues: 'monthly_revenue',
  ex_dividend_notices: 'ex_dividend_notice',
  ex_right_dividends: 'ex_right_dividend',
};
const bump = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

export const toRecomputeTargets = (
  rawChanges: UpstreamRowChange[],
  bounds: { historyFloorIndex: number; latestQuarterIndex: number }
): RecomputeTargets => {
  const changes = rawChanges.map((c) => (c.source === 'mops' ? c : { ...c, tableName: TWSE_TPEX_SINGULAR[c.tableName] ?? c.tableName }));
  const targets: RecomputeTargets = { quarterlyFrom: new Map(), dailyLatest: new Set(), dailyLatestAll: false, monthlyFrom: new Map(), ignored: new Map(), unmapped: new Map() };
  const label = (c: UpstreamRowChange) => `${c.source}.${c.tableName}`;
  const clamp = (index: number) => Math.min(Math.max(index, bounds.historyFloorIndex), bounds.latestQuarterIndex);
  const addQuarter = (symbol: string, index: number) => {
    const clamped = clamp(index);
    targets.quarterlyFrom.set(symbol, Math.min(targets.quarterlyFrom.get(symbol) ?? Infinity, clamped));
  };

  // 日資料：最新那一天是正常的每日更新，只影響逐日型指標；比批次裡最新一天還舊的日子是「更正過去的價格」，
  // 季報型指標裡用到那天股價的（知識日期的價格錨點）也要從那一季重算。
  const latestDateByTable = new Map<string, string>();
  for (const c of changes) {
    const date = c.key.date;
    if ((c.tableName === 'daily_price' || c.tableName === 'daily_valuation') && typeof date === 'string' && date > (latestDateByTable.get(label(c)) ?? '')) {
      latestDateByTable.set(label(c), date);
    }
  }

  for (const c of changes) {
    const k = c.key;
    if (NON_METRIC_TABLES.has(c.tableName)) {
      bump(targets.ignored, label(c));
      continue;
    }
    if (c.tableName === 'daily_taiex_index') {
      targets.dailyLatestAll = true;
      continue;
    }
    if (c.symbol === null) {
      bump(targets.unmapped, label(c));
      continue;
    }
    const symbol = c.symbol;

    if (c.tableName === 'daily_price' || c.tableName === 'daily_valuation') {
      const q = typeof k.date === 'string' ? quarterOfDate(k.date) : null;
      if (q === null) {
        bump(targets.unmapped, label(c));
        continue;
      }
      targets.dailyLatest.add(symbol);
      if ((k.date as string) < latestDateByTable.get(label(c))!) addQuarter(symbol, q);
      continue;
    }

    if (c.tableName === 'monthly_revenue') {
      const ym =
        typeof k.year_month === 'string' && /^\d{4}-\d{2}/.test(k.year_month)
          ? Number(k.year_month.slice(0, 4)) * 100 + Number(k.year_month.slice(5, 7))
          : typeof k.year === 'number' && typeof k.month === 'number'
            ? k.year * 100 + k.month
            : null;
      if (ym === null) {
        bump(targets.unmapped, label(c));
        continue;
      }
      targets.monthlyFrom.set(symbol, Math.min(targets.monthlyFrom.get(symbol) ?? Infinity, ym));
      continue;
    }

    if (c.source === 'mops') {
      // 財報類（含銀行/金控/保險明細、權益變動）：鍵裡有民國年＋季。
      if (typeof k.year === 'number' && typeof k.quarter === 'number') {
        addQuarter(symbol, quarterIndex(k.year, k.quarter));
        continue;
      }
      if (c.tableName === 'financial_report_announcement' && typeof k.fiscal_year === 'number' && typeof k.fiscal_quarter === 'number') {
        addQuarter(symbol, quarterIndex(k.fiscal_year, k.fiscal_quarter));
        continue;
      }
      // 股本、股利會改每股分母與股利類指標，也會改即時市值／即時本益比這類逐日型。
      if (c.tableName === 'capital_stock_history' && typeof k.effective_year === 'number' && typeof k.effective_month === 'number') {
        addQuarter(symbol, quarterIndex(k.effective_year - 1911, Math.ceil(k.effective_month / 3)));
        targets.dailyLatest.add(symbol);
        continue;
      }
      if (c.tableName === 'dividend_distribution' && typeof k.rights_record_date === 'string') {
        const q = quarterOfDate(k.rights_record_date);
        if (q !== null) {
          addQuarter(symbol, q);
          targets.dailyLatest.add(symbol);
          continue;
        }
      }
      // 特別股權利會改 IAS 33 普通股分母，影響整段歷史。
      if (c.tableName === 'preferred_stock_right' || c.tableName === 'preferred_stock_redemption_override') {
        addQuarter(symbol, bounds.historyFloorIndex);
        targets.dailyLatest.add(symbol);
        continue;
      }
      // ponytail: company_profile 只有面額／實收資本會影響我們（股本歷史漏記面額變更的補法），但 row_changes 沒有欄位層級，
      // 任何欄位變都會進來；只重算最新一季＋逐日型，不回溯全歷史。要精準得請 mops 給欄位層級或另開 view。
      if (c.tableName === 'company_profile') {
        addQuarter(symbol, bounds.latestQuarterIndex);
        targets.dailyLatest.add(symbol);
        continue;
      }
    }

    bump(targets.unmapped, label(c));
  }

  return targets;
};
