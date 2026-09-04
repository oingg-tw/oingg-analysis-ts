import { registry } from '@/adapters/swagger/registry';
import { govBondYield10yResultSchema } from '@/domainMetrics/macro/govBondYield10y/types';

export const registerGovBondYield10yOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/macro/gov-bond-yield-10y',
    summary: '10 年期政府公債次級市場殖利率（最新一個月）',
    description:
      '只回傳最新一筆，不是歷史序列——給估值排行卡片當中性的利率參考基準用，不做投資建議。資料來源跟 /macro/equity-risk-premium ' +
      '同一張表（monthly_gov_bond_yield_10y，來源是央行統計資料庫 EG43M01en，本服務只讀）；要完整歷史序列或窗口計算請改用 /macro/equity-risk-premium。',
    tags: ['Macro'],
    responses: {
      200: {
        description: '查無資料時 yieldPct/asOfMonth 是 null，warnings 說明原因，不會回傳錯誤狀態碼。',
        content: { 'application/json': { schema: govBondYield10yResultSchema } },
      },
    },
  });
};
