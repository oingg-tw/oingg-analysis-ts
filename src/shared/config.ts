/**
 * Application configuration.
 * It's recommended to read these values from environment variables.
 */
export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  port: process.env.PORT || 3000,
  // 2026-09-05 起，domainApi 只有 bff-ts 會呼叫，兩邊約定的共用密鑰——bff-ts 每次請求帶
  // `X-Api-Key` header，見 src/shared/bffAuth.ts。/batch/compute 是 Cloud Scheduler 用，
  // 走另一條之後才要接的 Cloud Run IAM invoker 機制，不共用這把密鑰（見 domainBatch/controller.ts
  // 的說明），/（健康檢查）跟 /api-docs 也不需要。
  bffApiKey: process.env.BFF_API_KEY || null,
};
