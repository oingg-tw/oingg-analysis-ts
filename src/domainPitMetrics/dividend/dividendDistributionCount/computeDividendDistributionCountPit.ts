import { getDividendDistributionEvents } from '@/models/mops/dividendDistribution';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome } from '../../pitOutcome';

// 2026-09-15 應使用者要求新增——「過去一年配息次數」，用 mops-ts 的股利分派公告
// （export.dividend_distribution，見 src/models/mops/dividendDistribution.ts 的完整
// 說明）反推，不是用現金流量表金額反推（那個只知道有沒有配，不知道配幾次）。
//
// 這支指標的座標系統跟其餘季報型指標不同——不是從季度財報解析出來的，是從公司治理
// 公告事件反推，用最新一次除息交易日當基準日，往前 365 天（不含第 365 天當天，見下方
// count 計算的說明）算窗口內事件數。knowledgeDate
// 直接用那次分派案的 announcement_date（真實公告日，不是季報公告日），沒有
// resolveKnowledgeDate() 那套「用財報期末日頂替」的 fallback 需求——如果
// announcement_date 缺漏（理論上不該發生，能查到分派案代表已經公告過），退回用
// ex_dividend_date 當 knowledgeDate 並標記 isFallback:true。
//
// fiscalYear/fiscalQuarter 這兩個座標欄位借用來標示「基準日落在哪一年哪一季」，用的是
// 除息交易日的西元年+月份反推的日曆季度（不是這次分派案自己的 fiscal_quarter 欄位——
// 那個欄位對年配公司是 null，用它當座標會缺一角；日曆季度對年配/季配公司都一定存在）。

export interface DividendDistributionCountPitOutcome {
  symbol: string;
  ttm: BasisOutcome;
}

// 這支指標的資料源（股利分派公告）不是財報，不會因為個體/合併報表而有不同數字——
// query.year/season 也不適用（不是從季報解析出來的）。仍然接收完整的
// QuarterlyMetricQuery 只是為了跟 buildGeneralTasks() 其餘任務同一種呼叫慣例
// （`(query) => computeAndWriteXxxPit(query)`），內部只用得到 symbol/dataType/
// subsidiaryCompanyId 三欄。
export const computeAndWriteDividendDistributionCountPit = async (query: QuarterlyMetricQuery): Promise<DividendDistributionCountPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const events = await getDividendDistributionEvents(symbol);

  if (events.length === 0) {
    return { symbol, ttm: { action: 'skipped_no_quarter' } };
  }

  const latest = events[0]!; // getDividendDistributionEvents 已經依 exDividendDate DESC 排序
  const windowStart = new Date(latest.exDividendDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - 365);

  // 窗口起點刻意排除（> 不是 >=）——實測抓到真實邊界案例：季配公司（每季約91天配一次）
  // 若最新基準日剛好落在跟某次歷史事件相差恰好 365 天的位置，用 >= 會把「整整一年前的
  // 那一次」也算進來，湊出 5 次而不是符合直覺的 4 次。改成排除起點當天，只算「基準日
  // 往前不滿 365 天」內的事件，季配公司才會穩定算出 4 次。
  const count = events.filter((e) => e.exDividendDate > windowStart && e.exDividendDate <= latest.exDividendDate).length;

  const fiscalYear = latest.exDividendDate.getUTCFullYear();
  const fiscalQuarter = Math.floor(latest.exDividendDate.getUTCMonth() / 3) + 1;

  const knowledgeDate = latest.announcementDate ?? latest.exDividendDate;
  const knowledgeDateIsFallback = latest.announcementDate === null;

  const ttm = await writeMetricValue({
    symbol,
    metricCode: 'dividendDistributionCount',
    ...periodTypeGroup('TTM'),
    fiscalYear,
    fiscalQuarter,
    dataType,
    subsidiaryCompanyId,
    value: count,
    nullReason: null,
    knowledgeDate,
    knowledgeDateIsFallback,
  });

  return { symbol, ttm };
};
