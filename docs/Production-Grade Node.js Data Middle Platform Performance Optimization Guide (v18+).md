# Production-Grade Node.js Data Middle Platform Performance Optimization Guide (v18+)

## TL;DR
- **Fix the event loop first, then scale horizontally.** The single highest-leverage move for a Node.js data middle platform is keeping CPU-bound work off the main thread (worker threads / offload) and running one process per core (cluster/PM2), which real benchmarks show delivers roughly 2–4x throughput; everything else (caching, pooling, query tuning) compounds on top.
- **Most "Node is slow" incidents are actually I/O and data-access problems**, not CPU: unbounded concurrency, missing connection pools, N+1 queries, OFFSET pagination, and missing caches. Cursor pagination alone dropped a 1M-row Postgres page from 704 ms to 41 ms (~17x), and Redis cache-aside routinely removes the majority of DB reads.
- **Measure before and after every change.** Instrument event-loop delay/utilization (perf_hooks) always-on in production; use clinic.js/0x/`--inspect` under representative load to find the hot path; take before/after heap snapshots to catch leaks. Tune only what you can prove.

## Key Findings

1. **The event loop is the bottleneck you can't see.** Node.js is single-threaded for JavaScript execution. One synchronous operation — a large `JSON.parse`, a crypto loop, a regex on a huge string — blocks *all* requests. Offload CPU work to worker threads and never do sync file/crypto work on the request path.
2. **Cluster and worker threads solve different problems.** Cluster (or PM2 cluster mode) forks one process per core for I/O-bound HTTP scaling and crash isolation; worker threads run CPU-bound compute in-process with shared memory. Use cluster for throughput/availability, workers for compute.
3. **Connection pooling is the single most impactful data-layer optimization.** Creating a connection per request adds 20–100 ms of overhead each. Pool sizing must account for `pool_size × number_of_instances` against the database's `max_connections`.
4. **N+1 is the most common ORM/GraphQL performance killer.** DataLoader (per-request batching + caching) collapses hundreds of per-row queries into a single `WHERE id IN (...)`.
5. **Cursor/keyset pagination beats OFFSET at scale**, both for performance (17x measured on 1M rows) and correctness (no row skipping when data changes).
6. **Caching is a three-layer architectural decision**, not a bolt-on: in-process LRU for hot reference data, Redis for shared state, CDN for public responses. Cache-aside is the default; always set TTLs with jitter and build invalidation alongside writes.
7. **undici is dramatically faster than axios/node-fetch** for outbound HTTP because of keep-alive connection pooling.
8. **GC tuning has measurable but workload-dependent payoff.** Raising `--max-semi-space-size` reduces premature promotion to old space; set `--max-old-space-size` to ~75% of the container memory limit for stability.

## Details

### 1. Event Loop Optimization
The event loop, powered by libuv, cycles through phases (timers, pending callbacks, poll, check, close) executing queued callbacks. Blocking it starves every concurrent request.

**Rules:**
- Never use sync APIs (`fs.readFileSync`, `crypto.pbkdf2Sync`, synchronous `zlib`) on the request path. Use `fs.promises` and async variants.
- Chunk large CPU loops with `setImmediate` to yield to the loop, or offload to a worker.
- Avoid firing hundreds of parallel DB queries — that also floods the loop with I/O callbacks.
- Watch the Node.js 18 default: `Buffer`/stream `highWaterMark` behavior means more data is buffered before backpressure signals.

**Always-on monitoring** (low overhead) using `perf_hooks`:
```ts
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const p99ms = h.percentile(99) / 1e6;   // ns -> ms
  const eluUtil = performance.eventLoopUtilization().utilization;
  if (p99ms > 50 || eluUtil > 0.9) {
    console.warn(JSON.stringify({ evtLoopP99ms: p99ms, elu: eluUtil }));
  }
}, 5000);
```
**Thresholds:** event-loop delay p99 > 50 ms is a warning; ELU sustained above 80% is a warning and above 90% means the loop is effectively blocked and tail latency will spike — move CPU work to a worker thread or external service. Note a known caveat: `monitorEventLoopDelay` stats can be skewed toward small measurements because no samples are taken *during* a long synchronous block.

### 2. Worker Threads
Use for CPU-bound work: encryption/PBKDF2, image processing, compression, WASM, ML inference, big JSON transforms. Prefer a **fixed worker pool** (size ≈ CPU count − 1) over spawning a worker per request. AppSignal's engineering blog measured a **4x speedup**: "We've made performance 4x faster when calculating the 30th Fibonacci number using a fixed worker pool (set by default to the number of available CPUs minus one) instead of a worker thread per request."

```ts
// pool usage with piscina (production worker-pool library)
import Piscina from 'piscina';
import os from 'node:os';
const pool = new Piscina({
  filename: new URL('./worker.js', import.meta.url).href,
  maxThreads: Math.max(1, os.cpus().length - 1),
});
const result = await pool.run({ payload });   // runs off the main thread
```
Use `SharedArrayBuffer` / transfer lists to avoid copying large buffers. Add backpressure: reject or return 429 when the pool queue is saturated. Never block the event loop inside a BullMQ processor — offload there too.

### 3. Clustering & Load Balancing
Node's single thread leaves cores idle. The `cluster` module (or PM2 cluster mode) forks one worker per core sharing the same port; the OS/PM2 load-balances connections.

**Measured throughput gains from clustering (all named benchmarks):**
- Pankaj Baagwan's benchmark: **788 → 1,426 req/sec (~80% increase)** for a CPU-intensive workload, with mean latency dropping from 119.4 ms to 65 ms.
- Better Stack: request rate rose from **4,411 to 9,928 req/sec** (~2.25x), processing 109,000 vs 49,000 total requests.
- LogRocket (Geshan Manandhar): **27 RPS → 102 RPS** (~4x) on an 8-core server.

The gain is workload-dependent and never perfectly linear. Requirements for clustering:
- **Stateless design** — move sessions/caches to Redis; in-memory state doesn't persist across workers.
- **Graceful shutdown** — trap `SIGTERM`/`SIGINT`, drain connections, then exit. PM2 `reload` gives zero-downtime rolling restarts.
- For I/O-bound apps, `instances: -1` (cores − 1) leaves a core for the OS/Nginx.

```js
// ecosystem.config.js
module.exports = { apps: [{ name: 'api', script: 'dist/server.js',
  exec_mode: 'cluster', instances: 'max', max_memory_restart: '512M' }] };
```
**Topology:** Nginx (TLS termination, reverse proxy, cross-host load balancing) → multiple hosts, each running PM2 cluster mode across cores. For WebSockets, use sticky sessions + a Redis adapter (e.g. socket.io-redis) so broadcasts reach all workers.

### 4. Async Patterns & Concurrency Control
`Promise.all` gives parallelism but **no limit** — mapping 1,000 items to 1,000 concurrent DB/API calls exhausts pools, hits rate limits, and floods the loop. Use bounded concurrency:
```ts
import pLimit from 'p-limit';
const limit = pLimit(10);                    // max 10 in flight
const results = await Promise.all(items.map(i => limit(() => process(i))));
```
`p-map` and `p-queue` offer similar control; combine with retries + randomized jitter for resilient concurrency. Use `Promise.allSettled` when partial failure is acceptable.

### 5. Connection Pooling
Each new Postgres connection costs a TCP handshake (~0.5–1 ms same-DC, 20–80 ms cross-region) plus TLS (1–2 round trips) plus auth — roughly 20–100 ms total. At 1,000 RPS, per-request connections add tens of seconds of cumulative latency; pooling can handle 10–50x more throughput.

```ts
import { Pool } from 'pg';
export const pool = new Pool({
  max: 20, min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
pool.on('error', (err) => console.error('idle client error', err)); // prevents crash
```
**Sizing formulas cited in practice:**
- Starting point `(CPU cores × 2) + 1`, then tune with metrics.
- Practical cloud rule: **10–20 per instance** for small/medium apps.
- Multi-instance safe allocation: `per_service_pool = floor(pg_max_connections × 0.8 / num_instances)`.
- **Critical gotcha:** total connections = `pool_size × instances`. 6 instances × 20 = 120 > default Postgres `max_connections=100`.

For very high instance counts, front Postgres with **PgBouncer** (transaction pooling). Expose pool stats (`idleCount`, `totalCount`, `waitingCount`) in health checks and return 503 when exhausted. Always drain the pool on shutdown.

### 6. Database Query Optimization
**`EXPLAIN (ANALYZE, BUFFERS)`** is the primary tool. Ignore `cost` (an estimate); read `actual time`. `shared hit` = cache; `shared read` = disk. Compare estimated vs actual rows to catch stale statistics (run `ANALYZE`).

- **Index heavily-filtered columns**, but note indexes aren't free: they slow every INSERT/UPDATE/DELETE. One production team had 40+ unused indexes consuming 30 GB and slowing writes ~20%. Find unused indexes via `pg_stat_user_indexes WHERE idx_scan = 0`.
- Use **covering/index-only scans** by including selected columns in the index.
- Don't index tables under ~10k rows or very low-cardinality columns.
- Run `VACUUM`/`ANALYZE` regularly; autovacuum triggers around 10% table churn.

### 7. The N+1 Problem
Fetching a list (1 query) then related data per row (N queries) turns a request into hundreds of round trips. In GraphQL, use **DataLoader** — it batches all `.load(key)` calls within one event-loop tick into a single query and caches per request:
```ts
const userLoader = new DataLoader(async (ids: readonly string[]) => {
  const rows = await db.users.findMany({ where: { id: { in: ids as string[] } } });
  return ids.map(id => rows.find(u => u.id === id)); // must preserve order
});
```
**Rules:** always instantiate DataLoader **per request** (global instances leak memory and mix users' data); combine batching with pagination (avoid gigabyte `IN` clauses); batch permission checks too, or authorization reintroduces N+1. Correct implementation cuts query counts by 95%+. In non-GraphQL code, eager-load with JOINs or a single `WHERE id IN (...)`.

### 8. Pagination
- **OFFSET/LIMIT**: simple, supports random page access and total counts, but `OFFSET 100000` *reads and discards* 100k rows — O(N) degradation past ~10k rows, plus row-skipping when data changes.
- **Cursor/keyset**: filters on the last-seen indexed value (`WHERE id > $cursor ORDER BY id LIMIT n`), so performance stays flat regardless of depth. Milan Jovanović's 1M-row PostgreSQL test measured offset `Execution Time: 704.217 ms` versus cursor `40.993 ms` — "A whopping 17x performance improvement." His composite-index tuple comparison (`WHERE (date, id) <= (@date, @lastId)`) cut a related query from 298.955 ms to `Execution Time: 0.668 ms`. Stacksync independently reports a **17x speedup** and sub-millisecond keyset performance vs 87 ms OFFSET at page 50,000.

Use OFFSET for small/static datasets and admin UIs needing page numbers; use cursor for large, changing datasets, feeds, infinite scroll, and ETL scans. Always index the cursor column.

### 9. Caching Strategies
Three layers:
1. **In-process LRU** (e.g. `lru-cache`): sub-millisecond, per-process; for hot, read-heavy reference data (config, lookup tables). Not shared across workers.
2. **Redis** (via `ioredis`): shared across processes/servers, survives deploys; for session data and shared state.
3. **CDN** with `Cache-Control` + `stale-while-revalidate`: eliminates origin load for public endpoints.

**Cache-aside (default):**
```ts
async function getUser(id: string) {
  const key = `user:${id}`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const user = await db.users.findUniqueOrThrow({ where: { id } });
  await redis.set(key, JSON.stringify(user), 'EX', 300); // TTL
  return user;
}
```
**Patterns:** cache-aside (flexible, resilient), write-through (fresh but slower writes — good for sessions/permissions), write-behind (fastest writes, durability risk), read-through.

**Production discipline:**
- Always set TTLs; add **jitter** to prevent synchronized miss storms.
- On writes, prefer **DEL over SET** to avoid read/write races (versioned keys are a safer lever than deletes).
- Use `allkeys-lru` eviction.
- Prevent **stampedes** with a mutex/lock or probabilistic early expiration on hot keys *before* they bite.
- **Never** use `redis.keys()` in production — it's O(N) and blocks Redis; use SCAN or tag-based invalidation.
- Monitor hit rate from day one; a hit rate below 50% on cache-aside usually means TTL too short, key space too large, or data too volatile to cache.

### 10. Stream Processing & Backpressure
Streaming lets a 512 MB server process a 10 GB file. The alternative — buffering the whole payload — causes memory exhaustion and latency spikes. **Backpressure** is the mechanism where a full consumer signals the producer to slow down (via `highWaterMark` and the `drain` event / `write()` returning false).

**Critical caveat:** streams do **not** automatically save you. If you ignore the backpressure signal, Node keeps buffering to the heap until OOM. Use `pipeline()` (which propagates errors and backpressure) or `for await` over async iterators, never manual `.on('data')` without pause handling:
```ts
import { pipeline } from 'node:stream/promises';
await pipeline(
  fs.createReadStream('in.csv.gz'),
  createGunzip(),
  transformStream,
  fs.createWriteStream('out.json'),
);
// or memory-safe row processing:
for await (const chunk of fs.createReadStream('huge.log', { highWaterMark: 1 << 20 })) {
  await db.batchInsert(parse(chunk)); // for-await respects backpressure
}
```
Watch pool interaction: 20 slow streaming exports can saturate a pool of 20 while memory stays flat but new requests stall.

### 11. HTTP Keep-Alive & Compression
**Outbound:** Use **undici** (the Node.js team's HTTP/1.1 client) with connection pooling and keep-alive. Undici's own benchmark (50 TCP connections, pipelining depth 10) reports **axios ~5,708 req/sec, http keep-alive ~9,193, undici request ~18,340, undici stream ~18,245**, with undici dispatch highest (~22k–25k depending on Node version/benchmark run). Swapping axios → `undici.request` can yield 2–4x higher throughput on I/O-bound services.

```ts
import { Agent, request } from 'undici';
const agent = new Agent({ connections: 128, keepAliveTimeout: 10_000, pipelining: 1 });
```
**Compression:** Enable Brotli (with gzip fallback via `Accept-Encoding`) for text/JSON responses. DebugBear's measurements found gzip achieved a 65% file-size reduction while Brotli reached 70% on the same asset, and Akamai's benchmark (cited by IO River) reported median savings of ~82% with Brotli vs ~78% with gzip. Compression adds CPU but reduced network I/O usually more than pays for it. For static assets, pre-compress once at build time at max level and serve cached. Don't compress tiny payloads (overhead can grow them) or already-compressed binaries. Consider offloading compression to Nginx/CDN to keep CPU off the Node event loop.

### 12. Batch Processing & Job Queues
Offload email, image/video processing, report generation, and data sync to **BullMQ** (Redis-backed, built on Redis Streams, native TypeScript, exactly-once-ish semantics, retries, priorities, rate limiting):
```ts
import { Queue, Worker } from 'bullmq';
const connection = { host: process.env.REDIS_HOST, port: 6379, maxRetriesPerRequest: null };
const q = new Queue('email', { connection });
await q.add('welcome', { userId }, {
  attempts: 3, backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000, removeOnFail: 5000, // bound Redis memory
});
new Worker('email', async job => { /* ... */ }, { connection, concurrency: 8 });
```
**Production checklist:** set `removeOnComplete/removeOnFail` (unbounded jobs eat GBs of Redis); make jobs **idempotent** (retries can double-run); tune concurrency starting at ~`floor(cpuCount/2)`; separate queues by priority so batch jobs don't starve real-time ones; use worker threads for CPU-bound job bodies; deploy Bull Board behind auth; alert on failed-job spikes and queue depth. For bulk DB writes, batch inserts rather than per-row.

### 13. Memory Leak Detection
Node is long-lived and single-process, so leaked references accumulate across *every* request until V8 exhausts the container limit. Common causes: unbounded caches, orphaned event listeners, closures over large objects, long-lived async contexts.

**Detection workflow:**
1. Trend memory in production — log `process.memoryUsage()` (heapUsed, rss) every 30 s. Growth of ~5–10 MB/hour with no plateau signals a leak.
2. Capture **heap snapshots** programmatically (built into Node v12+):
```ts
import { writeHeapSnapshot } from 'node:v8';
app.post('/admin/heap-snapshot', requireAdminAuth, (_req, res) => {
  res.json({ file: writeHeapSnapshot() }); // baseline + post-load
});
```
3. Load two snapshots (baseline + after load) into Chrome DevTools Memory tab, use **comparison mode / "objects allocated between snapshots"**, sort by **Size Delta** and **Retained Size** — constantly growing deltas are the leak. `clinic heapprofiler` automates this.

### 14. Garbage Collection Tuning
V8 uses generational, stop-the-world GC: fast **Scavenge** collects the young generation (new space); slower **Mark-Sweep-Compact** collects old space and pauses the whole app. The goal is to let a full request/response cycle be collected by Scavenge without promotion to old space.

**Two flags do most of the work:**
- `--max-semi-space-size` (young generation, MB): raising it (e.g. 16→64) gives Scavenge more room, reducing premature promotion and expensive major collections. **Measured payoffs:** Platformatic reported that "simply changing this configuration lowered the P99 latency by 5%, improved the number of req/s by 7%, and improved the overall throughput by 7%. Make sure to benchmark your application, as your mileage may vary." A Node.js core issue (nodejs/node #42511) found "The total throughput increased about 18%" with `--max_semi_space_size=128` on the web-tooling-benchmark, with the author noting the improvement is workload-dependent; Akamas reported up to 45% faster execution and 68% lower CPU (Node 18, no code changes). Node's own docs caution that the throughput improvement depends on your workload.
- `--max-old-space-size` (MB): cap at **~75% of the container memory limit** so V8 does full GC before the OS OOM-kills the process.

Use `--trace-gc` to log GC pauses/durations under load, then tune. Benchmark under representative load; lock proven flags into your image. Use `--expose-gc` + `global.gc()` only for debugging, never in production logic.

### 15. Profiling Tools
- **`monitorEventLoopDelay` / `eventLoopUtilization` (perf_hooks):** always-on, low-overhead production metrics.
- **clinic.js suite:**
  - `clinic doctor` — health overview; categorizes CPU vs I/O vs memory and recommends next tool.
  - `clinic flame` (wraps 0x) — CPU flame graph; widest bars = synchronous hot path blocking the loop.
  - `clinic bubbleprof` — async timing; finds serial async that should be parallel (DB/network waits).
  - `clinic heapprofiler` — memory.
- **0x:** single-command flame graph (`npx 0x -- node server.js` or attach `-P <pid>`); production notes in its docs.
- **`node --inspect`:** Chrome DevTools for CPU profiles and heap snapshots.
- **`perf` (Linux):** `perf record -e cycles:u -g -- node --perf-basic-prof --interpreted-frames-native-stack app.js`.

**Recommended loop:** alert on p99 latency or event-loop delay > 50 ms → `clinic doctor` to categorize → `clinic flame`/`0x` (CPU) or `bubbleprof` (async) under representative load → apply targeted fix (offload CPU to workers, parallelize async, fix leak) → re-run same load test to validate → add `perf_hooks` timing for ongoing monitoring. A real fintech case documented by Clinic users found 70% of CPU time in a synchronous `crypto.pbkdf2` implementation via clinic flame.

### 16. Architectural Patterns: BFF & API Gateway
- **API Gateway:** single entry point handling routing, TLS, auth, rate limiting across microservices.
- **BFF (Backend for Frontend):** a dedicated backend per client surface (web, iOS, Android) that aggregates and reshapes data from multiple services into exactly what that client needs — reducing over-fetching and payload size (e.g. `thumbnailUrl` + `shortDescription` for mobile vs full fields for web). Node.js is ideal because its non-blocking I/O excels at fan-out aggregation and it shares the frontend's language.

You can run both: the gateway handles routing/TLS, the BFF handles aggregation. Without a BFF, a frontend issues 6–10 parallel requests, juggles auth headers, and stitches responses client-side; the BFF moves that server-side where it's faster and observable. **Best practices:** split BFFs early (one shared BFF for web+mobile accumulates optional params and becomes an "API gateway with extra steps"); version BFFs per-client and deploy alongside the client (no `/v1/` URL versioning needed); cache and handle auth at the BFF layer; add rate limiting since the BFF calls third-party APIs. Modern meta-frameworks (Next.js, Nuxt, Remix, SvelteKit) often embed the BFF in the frontend repo.

## Recommendations

**Stage 1 — Measure and stabilize (week 1):**
- Add always-on `perf_hooks` event-loop delay + ELU metrics and `process.memoryUsage()` logging. Set alerts: event-loop delay p99 > 50 ms, ELU > 80%, heap growth > 5–10 MB/hr.
- Audit for sync calls on the request path and unbounded `Promise.all`. Add `p-limit` where needed.
- Verify every DB access goes through a **pool** with an `error` handler and graceful shutdown. Confirm `pool_size × instances ≤ max_connections × 0.8`.
- **Change trigger:** if event-loop p99 is fine but latency is high, the problem is downstream (DB/cache/HTTP), not CPU — go to Stage 3 first.

**Stage 2 — Scale horizontally (week 2):**
- Enable PM2 cluster mode (`instances: -1` for I/O-bound), make the app stateless (sessions/cache → Redis), and put Nginx in front. Expect ~2–4x throughput on multi-core.
- **Change trigger:** if a single worker still pegs one core on compute, add a worker-thread pool (piscina) rather than more processes.

**Stage 3 — Data layer (weeks 2–3):**
- Run `EXPLAIN (ANALYZE, BUFFERS)` on your slowest queries; add indexes on filtered columns, drop unused indexes.
- Kill N+1 with DataLoader (per-request) or JOIN/`IN` batching.
- Migrate deep pagination from OFFSET to cursor/keyset (expect up to ~17x on large tables).
- Add cache-aside with Redis for read-heavy endpoints; add in-process LRU for hot reference data. Target and monitor hit rate; set TTLs with jitter.
- **Change trigger:** cache hit rate < 50% → re-examine TTL/key design before adding more cache.

**Stage 4 — Refine (week 4+):**
- Swap outbound axios/node-fetch → undici with a pooled Agent.
- Enable Brotli+gzip compression (or offload to Nginx/CDN).
- Move heavy async work to BullMQ with idempotent jobs, bounded retention, and priority queues.
- Convert large file/DB exports to streaming with `pipeline()`.
- GC tuning **last, and only with measurement:** benchmark `--max-semi-space-size` (try 64) and set `--max-old-space-size` to ~75% of the memory limit. Keep only flags you can prove help.
- **Change trigger:** `--trace-gc` shows frequent major collections → raise semi-space size; OOM kills → lower old-space cap or fix leaks first.

**Framework choice:** For greenfield TypeScript services, prefer **Fastify** (schema-based validation via JSON Schema/Ajv, faster JSON serialization via fast-json-stringify, native TS, ~40–80% higher throughput than Express in real workloads with DB+middleware). Keep Express for existing codebases where the bottleneck is the database — migration won't pay off.

## Caveats
- **Benchmark numbers are directional, not guarantees.** The cluster (80%, 2.25x, 4x), pagination (17x), undici, worker-thread (4x), and GC (7%, 18%, 45%) figures come from specific hardware, workloads, and (for the pagination figure) a .NET→Postgres harness. Your mileage will vary; always benchmark your own workload under representative load.
- **Synthetic "Hello World" framework benchmarks overstate real gains.** Fastify's headline ~5.6x over Express (Better Stack: 114,195 vs 20,309 req/sec) shrinks to ~40–80% once a database, auth, and business logic dominate — often negligible for apps well under 10k RPS.
- **The undici "dispatch" figure varies** by Node version and whether it's the "getting" vs "sending data" benchmark (~22k–25k). Cite the version-pinned source.
- **Some sourcing is anecdotal.** Claims like "Redis cut p99 from 600 ms to 30 ms (95%)" and various worker-thread "10x" figures come from individual Medium authors, not controlled benchmarks; treat as illustrative. The AppSignal 4x worker-pool figure and the Platformatic/Node-core GC figures are the better-attributed ones.
- **Many how-to sources are vendor or SEO content** (OneUptime, various Medium/DEV posts). Core mechanics are corroborated across multiple sources and the Node.js docs, but treat specific claims critically and prefer primary docs where precision matters.
- **GC/flag tuning can backfire.** Setting `--max-old-space-size` too high can push the whole system into swap or OOM-kill; too low crashes on legitimate load. Tune against your container limit with monitoring.
- **Current as of September 1, 2026**; targets Node.js v18+ but references patterns valid through current LTS. Verify flag names against your exact Node version (e.g. `--max-new-space-size` was renamed to `--max-semi-space-size`).