import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '@/shared/config';

// Since this is an ES Module, __dirname is not available.
// We can recreate it using import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// glob (used internally by swagger-jsdoc) treats `\` as an escape character, so
// Windows-style paths from `join()` silently match zero files there. Normalize to `/`.
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
    // 每個 tag 對應一個分類資料夾（見 src/domains/README.md 的分類索引），
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
    toGlobPath(__dirname, '../../domains/**/*.ts'),
    toGlobPath(__dirname, '../../shared/**/*.ts'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
export { swaggerUi };
