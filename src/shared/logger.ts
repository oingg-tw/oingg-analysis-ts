import pino from 'pino';
import { config } from './config';

// 統一的 logger——正式環境輸出結構化 JSON（Cloud Run 直接吃進 Cloud Logging，可以依欄位篩選，
// 例如查「這次批次哪些 symbol 失敗」不用再整段文字裡面找），本機開發用 pino-pretty 轉成人類
// 好讀的格式。這支給沒有 HTTP request 上下文可以掛的地方用（例如 domainBatch/runner.ts 的批次
// 進度、src/index.ts 的啟動流程）；HTTP 請求本身的存取記錄走 pino-http（見 index.ts），
// 兩者共用同一個 pino instance 才會是同一份 log stream。
export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
