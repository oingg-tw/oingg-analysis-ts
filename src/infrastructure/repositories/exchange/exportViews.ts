import { Prisma } from '#generated/twse-export-client';
import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';

// 2026-10-08 twse-ts／tpex-ts 的 export view 改名成 v_＋複數，兩邊都不保留舊名（twse 10/08、tpex 10/10 切換）。
// 同一張 view 兩邊的新名字一樣，只是切換時間不同，所以照「這次查的是哪個 client」決定用新名還是舊名：
// 上市、上櫃共用同一段 SQL 的地方（傳 db 進來、dbFor(market)）直接把那個 client 傳進來即可。
// 表名只會來自下面這張寫死的對照表（型別限定），不接受外部輸入。
// Prisma 7 起各 generated client 的 Prisma.raw 可以混用（2026-10-08 實測 tpex 的 raw 給 twse client 查得到資料），
// dailyValuationRanking.ts 檔頭那條「跨 client 會安靜回空」是 Prisma 6 時代的限制。
const RENAMED = {
  daily_price: 'v_daily_prices',
  daily_valuation: 'v_daily_valuations',
  daily_taiex_index: 'v_daily_taiex_indices',
  margin_balance: 'v_margin_balances',
  monthly_revenue: 'v_monthly_revenues',
  company_profile: 'v_company_profiles',
  industry_code: 'v_industry_codes',
  isin_securities: 'v_isin_securities',
  broker: 'v_brokers',
  attention_history_note: 'v_attention_history_notes',
  changed_trading_method: 'v_changed_trading_methods',
  disposed_stock: 'v_disposed_stocks',
  ex_dividend_notice: 'v_ex_dividend_notices',
  material_announcement: 'v_material_announcements',
  stock_pledge_ratio: 'v_stock_pledge_ratios',
  volume_top20: 'v_volume_top20_rankings',
  foreign_shareholding: 'v_foreign_shareholdings',
  tpex_preferred_stock: 'v_tpex_preferred_stocks',
} as const;

export type ExportView = keyof typeof RENAMED;

// ponytail: 過渡期的「哪個 client 已切換」清單；tpex 切完後兩邊都是新名，這支整個拿掉、SQL 直接寫新名。
const SWITCHED = new Set<object>([twseExportPrisma]);

export const exportViewName = (db: object, view: ExportView): string => `"export"."${SWITCHED.has(db) ? RENAMED[view] : view}"`;

export const exportView = (db: object, view: ExportView): Prisma.Sql => Prisma.raw(exportViewName(db, view));
