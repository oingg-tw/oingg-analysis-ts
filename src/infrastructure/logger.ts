import pino from 'pino';
import { config } from './config';

// 統一的 logger——正式環境輸出結構化 JSON（Cloud Run 直接吃進 Cloud Logging，可以依欄位篩選，
// 例如查「這次批次哪些 symbol 失敗」不用再整段文字裡面找），本機開發用 pino-pretty 轉成人類
// 好讀的格式。這支給沒有 HTTP request 上下文可以掛的地方用（例如 api/batch/runner.ts 的批次
// 進度、src/index.ts 的啟動流程）；HTTP 請求本身的存取記錄走 pino-http（見 index.ts），
// 兩者共用同一個 pino instance 才會是同一份 log stream。
// 2026-10-11 twse-ts 抓到：pino-http 的 "request completed" 把整個 req.headers 記進 Cloud Logging，含 authorization 的 Bearer
// token、x-upstream-key（三家上游金鑰）、x-api-key（業務中台金鑰）明文。在共用 logger 這層遮掉，所有 log 都適用，不靠各路由記得。
export const LOG_REDACT_PATHS = ['req.headers.authorization', 'req.headers["x-upstream-key"]', 'req.headers["x-api-key"]', 'req.headers.cookie'];

export const logger = pino({
  level: config.logLevel ?? (config.isProduction ? 'info' : 'debug'),
  redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
  // silent 時連 pino-pretty 的 worker thread 都不要開，測試 process 才能乾淨結束。
  transport: config.isProduction || config.logLevel === 'silent'
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
