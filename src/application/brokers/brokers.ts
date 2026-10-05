import { z } from 'zod';
import type { AppDeps } from '@/application/deps';

// 2026-10-05 使用者要求（web-nuxt 持股頁「匯入券商成交明細」的券商下拉選單）：全市場證券商總公司名單，只用來顯示與選擇、不參與計算。
// 使用者拍板分工：twse-ts 收錄（export.broker，每日更新），這裡只讀。來源兩份都只有簡稱（元大證券是 9800「元大」），
// 全名沒有就是 null，不從備註拆、不猜。
export const brokerSchema = z.object({
  brokerCode: z.string().meta({ description: '證券商代號（總公司），唯一鍵，例如元大證券 9800' }),
  name: z.string().nullable().meta({ description: '全名；來源（證交所 brokerList／t187ap18）只有簡稱，目前一律 null' }),
  shortName: z.string().meta({ description: '簡稱，例如「元大」，下拉選單顯示這個' }),
});
export const brokersResultSchema = z.object({
  asOfDate: z.string().nullable().meta({ description: '名單最後一次更新（出現在證交所抓取結果）的日期' }),
  brokers: z.array(brokerSchema).meta({ description: '營業中、可受託買賣（業務種類含經紀）的總公司，依代號排序；只做自營的期貨商不列' }),
});
export type BrokersResult = z.infer<typeof brokersResultSchema>;

export const listBrokers = async (deps: Pick<AppDeps, 'marketLists'>): Promise<BrokersResult> => {
  const rows = await deps.marketLists.listActiveBrokers();
  const latest = rows.reduce<Date | null>((max, r) => (max === null || r.last_seen > max ? r.last_seen : max), null);
  return {
    asOfDate: latest ? latest.toISOString().slice(0, 10) : null,
    brokers: rows.map((r) => ({ brokerCode: r.broker_code, name: null, shortName: r.short_name })),
  };
};
