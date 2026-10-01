import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel } from '../../shared/trailingYear';
import { toProvenanceEntryValue, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { BalanceComponent } from '../../shared/provenance/averageBalanceEntries';
import type { resolveTurnoverRatioFamilyData } from './computeTurnoverRatioFamily';

// 2026-10-01 週轉率家族 12 支溯源表共用的 entry 片段。取代已刪除的 resolveTurnoverRatioProvenanceInputs.ts（那份自己查、
// 自己算本季期末分母，2026-09-22 分母改平均後就跟儲存值對不上）——現在資料與計算結果一律來自 compute 的
// resolveTurnoverRatioFamilyData()，這裡只負責把它排成 entries。
export type TurnoverRatioFamilyResolution = NonNullable<Awaited<ReturnType<typeof resolveTurnoverRatioFamilyData>>>;

export const TURNOVER_BALANCES = {
  inventory: { label: '存貨', fieldKey: 'inventories', pick: (bs) => bs.inventory },
  receivable: { label: '應收帳款', fieldKey: 'accounts_receivable_net', pick: (bs) => bs.accountsReceivable },
  ppe: { label: '不動產廠房及設備', fieldKey: 'property_plant_and_equipment', pick: (bs) => bs.propertyPlantEquipment },
  payable: { label: '應付帳款', fieldKey: 'trade_payables_to_trade_suppliers', pick: (bs) => bs.accountsPayable },
  currentAssets: { label: '流動資產', fieldKey: 'current_assets', pick: (bs) => bs.currentAssets },
  currentLiabilities: { label: '流動負債', fieldKey: 'current_liabilities', pick: (bs) => bs.currentLiabilities },
} satisfies Record<string, BalanceComponent>;

const FLOWS = {
  operatingCost: { label: '營業成本', fieldKey: 'operating_costs' },
  operatingRevenue: { label: '營收', fieldKey: 'revenue' },
} as const;

// 近一年（上市櫃四季／興櫃兩個半年）的營業成本或營收逐期列出；usage 是「，用於 DIO」這類補充。
export const ttmFlowEntries = (r: TurnoverRatioFamilyResolution, flow: keyof typeof FLOWS, usage = ''): ProvenanceEntry[] =>
  r.ttmQuarters.map((tq, i) => ({
    role: `近一年 ${FLOWS[flow].label}（${trailingPeriodLabel(tq, r.basis)}${usage}）`,
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    fiscalQuarter: Number(tq.season),
    type: 'statementField',
    statementType: 'incomeStatement',
    fieldKey: FLOWS[flow].fieldKey,
    sourceDescription: null,
    value: toProvenanceEntryValue(r.ttmRecords[i]?.[flow] ?? null),
  }));
