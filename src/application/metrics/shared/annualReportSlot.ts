import type { AnnualIncomeStatement } from '@/application/ports/annualReport';
import type { PitDeps } from '@/application/metrics/deps';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { deriveWeightedAverageShares } from '@/domain/financials/weightedAverageShares';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationSlot, type KnowledgeAnchor } from '@/domain/metrics/computation';
import type { CalcResult } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeValue } from '@/domain/metrics/shared/pickers';
import { resolveKnowledgeDate } from '../knowledgeDate';

// 2026-09-25 年報口徑（FY）的共用前置：eps、每股營收、每股稅前淨利、損益表每股科目都用同一套規則，
// 集中在這裡免得四份各自漂移——
// - 哪一年：第四季的計算寫當年，第一~三季寫前一年（最近一個完整年度）；同一列重寫會 skipped_unchanged，
//   所以回填任何一季都會補到年度值。
// - 座標：(該年度, 第四季)，一年一列。跟其他 FY 指標「每季一列、存截至當季的最近完整年度」不同。
// - knowledge date：年報的公告日（resolveKnowledgeDate 以第四季查）。
// - 每股分母：反推的全年加權平均股數（domain/financials/weightedAverageShares.ts），|EPS| < 0.1 為 null。
// 年報只認年報文件列（AnnualReportPort），不從四季拼——UBIQUITOUS_LANGUAGE.md〈三、期間口徑〉。
export interface AnnualReportContext {
  annual: AnnualIncomeStatement;
  fiscalYear: number; // 西元
  weightedShares: bigint | null;
  anchor: KnowledgeAnchor | null;
}

export const resolveAnnualReportContext = async (
  key: { symbol: string; rocYear: number; season: number; dataType: string; subsidiaryCompanyId: string },
  deps: Pick<PitDeps, 'annualReports' | 'announcements'>
): Promise<AnnualReportContext | null> => {
  const annualRocYear = key.season === 4 ? key.rocYear : key.rocYear - 1;
  const annual = await deps.annualReports.getAnnualIncomeStatement({
    symbol: key.symbol,
    rocYear: annualRocYear,
    dataType: key.dataType,
    subsidiaryCompanyId: key.subsidiaryCompanyId,
  });
  if (!annual) return null;
  const anchor = await resolveKnowledgeDate(key.symbol, [{ rocYear: annualRocYear, season: 4, reportDate: annual.reportDate }], deps.announcements);
  return {
    annual,
    fiscalYear: rocYearToGregorian(annualRocYear),
    weightedShares: deriveWeightedAverageShares(pickNetIncomeValue(annual), annual.basicEps),
    anchor,
  };
};

// 沒有年報 → skipped_no_quarter（不寫列）；有年報但查不到公告日 → skipped_no_knowledge_date。
export const annualReportSlot = (
  context: AnnualReportContext | null,
  base: { symbol: string; metricCode: string; dataType: string; subsidiaryCompanyId: string },
  result: CalcResult
): ComputationSlot => {
  if (!context) return { action: 'skipped_no_quarter' };
  if (!context.anchor) return { action: 'skipped_no_knowledge_date' };
  return computation({
    ...base,
    fiscalYear: context.fiscalYear,
    fiscalQuarter: 4,
    ...periodTypeGroup('FY'),
    ...result,
    knowledgeDate: context.anchor.knowledgeDate,
    knowledgeDateIsFallback: context.anchor.isFallback,
  });
};
