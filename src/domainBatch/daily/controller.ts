import { type Request, type Response, type NextFunction } from 'express';
import { runBatchCompute } from '../runner';
import { dailyIndicatorJobs } from './indicatorRegistry';

// 給 GCP Cloud Scheduler 觸發用的 HTTP 入口——跟 domainApi 的 controller.ts 是同一種角色，
// 只是呼叫方是排程器不是 BFF。目前刻意做成「整個批次跑完才回應」的同步呼叫，是這個階段
// 最簡單能動的版本，不是最終設計：10 支指標 x 1000+ 家公司實際會跑一段時間，Cloud Run
// Service 的 request timeout（可設到 60 分鐘）跟 Cloud Scheduler 本身的逾時上限都要另外
// 調整才扛得住；等真的接近這個上限造成逾時失敗，再改成「收到請求先回 202、背景繼續跑」
// 的非同步模式，現在先不用預先做那一層複雜度。
//
// 目前沒有任何驗證機制擋這支端點——跟 domainApi 不一樣（domainApi 已經接上 bff-ts 共用
// 密鑰驗證，見 src/shared/bffAuth.ts），這支是刻意留在 bffAuth 的驗證範圍之外，因為呼叫方
// 是 Cloud Scheduler 不是 bff-ts，不該共用同一把密鑰。正式部署前至少要靠 Cloud Run 的 IAM
// invoker 權限（只有指定的 Scheduler 服務帳號能呼叫）擋住，不能公開曝露。
export const triggerDailyBatchCompute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await runBatchCompute(dailyIndicatorJobs);
    res.status(200).json({ message: 'daily 批次計算完成。' });
  } catch (error) {
    next(error);
  }
};
