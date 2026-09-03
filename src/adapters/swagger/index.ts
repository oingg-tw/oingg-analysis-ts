import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { join } from 'path';
import { config } from '@/shared/config';

// swagger-jsdoc 在執行期直接讀 .ts 原始檔的文字（parse JSDoc 註解），不是讀編譯後的 .js——
// 所以這裡固定指向 src/domains、src/shared 的原始碼路徑，不管正式環境是用 tsx 直接跑 .ts
// 還是用 tsc build 出 dist/ 的 .js 都一樣（build 出來的 .js 不會保留 JSDoc 註解，指過去也沒用）。
// 用 process.cwd() 而不是 __dirname，理由見 filterCatalogCheck.ts 的說明（import.meta 在
// CommonJS build 底下是編譯期錯誤）。
//
// glob（swagger-jsdoc 內部用的）把 `\` 當跳脫字元，Windows 路徑用 join() 組出來會悄悄比對不到
// 任何檔案，這裡統一換成 `/`。
const toGlobPath = (...segments: string[]) => join(...segments).split('\\').join('/');

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OINGG Ratios API',
      version: '1.0.0',
      description: 'API documentation for the OINGG financial-ratios service',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    // 順序對應 src/domains 底下分類的實作順序，決定 Swagger UI 分組顯示的先後——
    // 每個 tag 對應一個分類資料夾（見 src/domainApi/metrics/README.md 的分類索引），
    // 不要再用單一的 "Ratios" tag 把所有 API 混在一起。
    tags: [
      { name: 'System', description: '伺服器狀態與跨分類的系統性 API，例如可用 filter 分類/指標/欄位清單' },
      { name: 'Profitability', description: '獲利能力與資本配置效率——ROE、ROA、BVPS、EPS、每股營收、毛利率/營業利益率/稅後淨利率' },
      { name: 'Cash Flow', description: '現金流品質與法證會計防雷——每股營業現金流（OCF）、每股自由現金流（FCF）' },
      { name: 'Solvency', description: '財務結構、償債安全與破產預警——負債比率、流動/速動/現金比率、負債權益比、利息保障倍數、淨負債對 EBITDA 比' },
      { name: 'Turnover', description: '營運週轉與資產效率——存貨/應收帳款/總資產/固定資產周轉率、資本支出佔營收比' },
      { name: 'Valuation', description: '估值與市場定價指標——PER、PBR、股利殖利率（直接採用 oingg-twse 現成數字，不是本服務自己算的）' },
      { name: 'Guru', description: '大師策略與複合量化估值模型——葛拉漢數、Graham NCAV（淨流動資產價值）與安全邊際價' },
      { name: 'Portfolio', description: '投資組合風險、超額報酬與量化因子——目前只有 Beta（貝塔係數）' },
    ],
  },
  // Path to the API docs. It's crucial to use absolute paths created with `join`.
  apis: [
    toGlobPath(process.cwd(), 'src/domainApi/**/*.ts'),
    toGlobPath(process.cwd(), 'src/shared/**/*.ts'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
export { swaggerUi };
