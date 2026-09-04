import { Router, type Request, type Response } from 'ultimate-express';
import { filterCatalog } from './filterCatalog';
import { columnPresets } from './columnPresets';
import { getTableForMetric } from './metricTableRegistry';

const router = Router();

// 2026-09-01 應 bff-ts 要求新增——他們原本手動維護一份對照 information_schema 拼出來的
// analysisMetricTables.ts，每次我們出新指標就要重新查表更新，改成直接讀這裡自動解析出來的
// 表名，這份對照表本身也是 metricTableRegistry.ts 給 screener 內部查詢用的同一份，不會漂移。
// 只加這一個欄位，不改動既有的 categories 結構。
const withTableNames = () =>
  filterCatalog.map((category) => ({
    ...category,
    metrics: category.metrics.map((metric) => ({ ...metric, table: getTableForMetric(metric.key)?.tableName ?? null })),
  }));

router.get('/filters', (req: Request, res: Response) => {
  res.json({ categories: withTableNames(), columnPresets });
});

export default router;
