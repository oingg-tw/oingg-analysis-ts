import type { UpstreamProcessorTriggerPort } from '@/application/ports/upstreamChanges';

// 叫醒上游變動處理程式（Cloud Run Job）。用 metadata server 拿執行帳號的 access token 呼叫 Cloud Run Admin API，
// 不需要新依賴；執行帳號要有那個 Job 的 run.invoker。jobName 沒設（本機）就不叫，由人手動跑處理腳本。
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export const createCloudRunJobTrigger = (jobName: string | null): UpstreamProcessorTriggerPort => ({
  trigger: async () => {
    if (!jobName) return 'not_configured';
    const tokenResponse = await fetch(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!tokenResponse.ok) throw new Error(`metadata server 拿 token 失敗：HTTP ${tokenResponse.status}`);
    const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };
    const response = await fetch(`https://run.googleapis.com/v2/${jobName}:run`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`觸發 ${jobName} 失敗：HTTP ${response.status} ${await response.text()}`);
    return 'triggered';
  },
});
