import { type Request, type Response, type NextFunction } from 'express';
import { runBatchCompute } from './runner';

// 給 GCP Cloud Scheduler 觸發用的 HTTP 入口——跟 domainApi 的 controller.ts 是同一種角色，
// 只是呼叫方是排程器不是 BFF。目前刻意做成「整個批次跑完才回應」的同步呼叫，是這個階段
// 最簡單能動的版本，不是最終設計：44 支指標 x 1000+ 家公司實際會跑好幾分鐘，Cloud Run
// Service 的 request timeout（可設到 60 分鐘）跟 Cloud Scheduler 本身的逾時上限都要另外
// 調整才扛得住；等真的接近這個上限造成逾時失敗，再改成「收到請求先回 202、背景繼續跑」
// 的非同步模式，現在先不用預先做那一層複雜度。
//
// 目前沒有任何驗證機制擋這支端點——跟本服務所有其他端點一樣還沒做身份驗證（見 README 已知
// 缺口）。正式部署前至少要靠 Cloud Run 的 IAM invoker 權限（只有指定的 Scheduler 服務帳號
// 能呼叫）擋住，不能公開曝露；如果之後這支端點跟 domainApi 掛在同一個 Cloud Run Service，
// IAM invoker 是綁在整個服務上、不能只保護單一路徑，屆時要嘛拆成獨立服務、要嘛在這裡額外加
// 一層共用密鑰檢查（比照 industryCodes.ts 退役前的 TASK_SECRET 模式），不是這次要解決的範圍。
export const triggerBatchCompute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await runBatchCompute();
    res.status(200).json({ message: '批次計算完成。' });
  } catch (error) {
    next(error);
  }
};
