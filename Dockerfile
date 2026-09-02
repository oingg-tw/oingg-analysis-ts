# 這個映像檔同時給兩種 Cloud Run 資源用，靠不同的啟動指令切換身分，不是兩個各自獨立的映像檔：
#   - Cloud Run「服務」（常駐 HTTP API）：預設的 CMD，跑 dist/src/index.js
#   - Cloud Run「工作」（排程觸發、跑一次就結束）：由該 Job 資源設定覆寫指令，跑
#     dist/scripts/syncCuratedDatasets.js（對應 `pnpm run sync:curated`，見 package.json）
#
# builder/runtime 兩個階段一律用同一個 base image tag——Prisma 產生的 query engine 是對應
# 「產生當下」那台機器的原生執行檔（schema.prisma 沒特別設 binaryTargets，預設等於
# build 環境本身），builder 跟 runtime 只要作業系統/libc/CPU 架構一致，複製過去就能直接跑，
# 不需要額外設定跨平台 binaryTargets。
#
# 一定要用 trixie（Debian 13）以上，不能用預設的 node:22-slim（Debian 12/bookworm）——
# 實測 ultimate-express 底層的 uWebSockets.js 原生執行檔要求 GLIBC_2.38 以上，bookworm
# 只有 2.36，容器起來直接在 require ultimate-express 那一步炸掉（跟 Prisma 無關，是另一個
# 原生依賴），這不是隨便挑的 tag。

FROM node:22-trixie-slim AS builder
WORKDIR /app

# node:22-trixie-slim 沒有內建 openssl——實測 prisma generate 會報「Prisma failed to detect the
# libssl/openssl version to use」，猜測用 openssl-1.1.x 頂著（generate 本身照樣能跑完，這只是
# 警告不是錯誤），但 runtime 階段真的要連線查詢時，query engine 執行檔實際連結的 libssl
# 版本如果跟這台機器上真正裝的不一樣，會直接載入失敗——不能只在 build 時看到警告就放著。
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# pnpm-workspace.yaml 的 allowBuilds 要在 install 之前就位，否則 pnpm 會擋掉
# @prisma/client / prisma 這些套件的 postinstall（見該檔案內容），連帶讓 prisma generate 不會執行。
# 版本要跟 package.json 的 "packageManager" 一致——pnpm 對 pnpm-workspace.yaml 的驗證規則
# 不同版本間有差異（實測：pnpm 9 對「只有 allowBuilds、沒有 packages 欄位」的寫法會直接報
# 「packages field missing or empty」拒絕安裝，pnpm 11 沒有這個問題），版本不對齊會在這裡炸掉。
RUN npm install -g pnpm@11.24.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm run build

# prisma/schema.prisma（根目錄那份，沒設自訂 output）產生的預設 client 不在 generated/ 裡，
# 是裝進 node_modules/.prisma/client（實際上因為 pnpm 的隔離式 node_modules，物理位置在
# @prisma/client 套件自己的資料夾底下）——這份東西沒辦法像 generated/ 那樣單獨複製出來，
# 一開始想在 runtime 階段重新 `pnpm install --prod` 導致這份預設 client 沒被產生（因為用了
# --ignore-scripts 跳過 postinstall，而不跳過的話 runtime 缺 prisma CLI 這個 devDependency
# 又會裝不起來）——實測直接炸「Cannot find module '.prisma/client/default'」。
# 改成直接把這個已經裝好、已經 build 完、已經 generate 完的 node_modules 原封不動搬到
# runtime，用 `pnpm prune --prod` 事後砍掉 devDependencies（不會動到已經產生好的檔案，
# 純粹是移除用不到的套件），不再讓 runtime 自己重新安裝一次。
# --ignore-scripts：prune 會重新跑 lifecycle script，這時候 devDependencies 已經被砍掉了，
# 我們自己的 postinstall（呼叫 prisma CLI）會直接報「prisma: not found」——不需要重新跑，
# 上面 `pnpm install`/`pnpm run build` 該產生的東西都已經產生好了。
RUN pnpm prune --prod --ignore-scripts

# ---- runtime ----
FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# 見 builder 階段同一行的說明——這裡才是真正要緊的地方：query engine 執行期載入需要 libssl，
# 沒裝的話即使 build 成功、image 也會在第一次真的查資料庫時才爆炸（載入失敗），不會在
# build 階段就被抓到。
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/dist ./dist
# package.json 一定要留著——Node.js 執行期解析 "#generated/*" 這個 subpath import
# （見 package.json 的 "imports" 欄位）要靠它，不是單純的 metadata。
COPY --from=builder /app/package.json ./package.json
# filterCatalogCheck.ts/metricTableRegistry.ts 在執行期直接讀 prisma/analysis/schema.prisma
# 的原始文字（用來檢查 filterCatalog.ts 跟 schema 是否一致，不是走 Prisma Client 查詢），
# 這是啟動時就會做的檢查，不是只在 `prisma generate` 那個 build 步驟用得到，執行期沒有這個
# 檔案會直接啟動失敗。
COPY prisma ./prisma
# swagger-jsdoc 在執行期直接讀 src/**/*.ts 原始檔解析 JSDoc 註解（不是讀編譯後的 .js），
# 見 src/adapters/swagger/index.ts 的說明——執行期一定要留著原始碼，不是編譯疏漏。
COPY src ./src

# Cloud Run 會自動注入 PORT（服務預設 8080），src/shared/config.ts 已經在讀 process.env.PORT，
# 不用額外處理。健康檢查固定打 GET / （src/domains/system/root.ts），不要用 /healthz——
# 那是 Cloud Run 保留路徑，會被平台攔截，打不到我們自己的 handler。
EXPOSE 8080

# 預設身分是 API 服務；Cloud Run Job 那邊會覆寫成
# ["node", "dist/scripts/syncCuratedDatasets.js"]。
CMD ["node", "dist/src/index.js"]
