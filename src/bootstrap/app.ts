import express from 'ultimate-express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from '@/shared/logger';
import { swaggerUi, swaggerSpec } from '@/adapters/swagger';
import routes from '@/routes';
import errorHandler from '@/shared/errorHandler';

// 2026-09-17 clean architecture 重構 Phase 0：把「組 express app」從 src/index.ts 抽出來，
// 跟「連 DB / 載快取 / listen」分開——HTTP 契約測試（tests/contract/http/）需要一個不會
// 自己去 listen 固定 port、也不會自己連 DB 的 app 物件，用 supertest 打 ephemeral port。
// 這裡的 middleware 鏈跟抽出前的 index.ts 一模一樣，純搬移不改行為；Phase 4 會再改成
// 從 HttpModule 清單組裝（見 ~/.claude/plans/resilient-baking-quail.md）。
export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging——2026-09-05 從 morgan 換成 pino-http：原本 morgan 只在開發模式開（正式環境
  // 完全沒有任何請求記錄），改用 pino-http 之後正式環境也會記錄，輸出結構化 JSON 讓 Cloud Run
  // 部署後可以直接用 Cloud Logging 依欄位查詢（例如篩某個 route 的 5xx），不用整段文字裡面找。
  //
  // customSuccessMessage 是必要的、不是美化：pino-http 預設判斷「completed」還是「aborted」
  // 靠 Node 原生的 req.readableAborted / res.writableEnded 這兩個屬性，但 ultimate-express
  // 是包 uWebSockets.js 的自訂 Request/Response（見 node_modules 原始碼確認過），從來不會設定
  // 這兩個屬性——結果是預設訊息**每一個成功的請求都會被標成「request aborted」**，log 等級/
  // 錯誤判斷（res.statusCode >= 500 那條路徑）本身沒受影響，只有這個文字判斷是錯的，但錯到會
  // 讓人誤判系統一直在出錯，一定要覆蓋掉。走到這個 callback 代表 pino-http 自己已經判定不是
  // 5xx/沒有 err（那條路走 customErrorMessage），直接回「request completed」就對了。
  app.use(pinoHttp({ logger, customSuccessMessage: () => 'request completed' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  app.use(routes);

  // 一定要是最後一個 middleware，才接得到前面所有路由丟出來的錯誤。
  app.use(errorHandler);

  return app;
};
