# Applying dbt-Style Layered Modeling (staging / intermediate / marts) to a Prisma + Postgres + Node.js Stock-Data Platform

## TL;DR
- **Adopt dbt's *conventions* (layer separation, `stg_`/`int_`/`mart_` naming, "data only flows forward, each layer rebuildable from the one below") but implement them with Postgres schemas + raw SQL transformation functions rather than the dbt tool.** Use `raw`/`staging`/`intermediate`/`marts` Postgres schemas, let Prisma own only the curated `marts` (and the query API's read models), and keep staging/intermediate as append-only tables or views populated by your TypeScript ETL services and versioned with a raw-SQL migration tool alongside Prisma Migrate.
- **Point-in-time correctness is the non-negotiable core: store an explicit `announcement_date`/`knowledge_date` (`TIMESTAMPTZ`) on every fact, keep every restatement as its own append-only row, and answer backtests with a single `WHERE announcement_date <= :T` predicate plus `DISTINCT ON`.** Postgres has no native transaction-time support even in versions 18/19, so you must model the knowledge dimension yourself.
- **The biggest risks for a solo dev are: business logic leaking into staging, skipping the intermediate layer, non-idempotent transforms that break reprocessing, and lineage confusion across multiple independent ingestion microservices.** Enforce discipline with naming, schema boundaries, deterministic (logical-date-driven) transforms, and a lightweight lineage/run-metadata table.

## Key Findings

### 1. dbt's layered conventions are portable — they're discipline, not tooling
dbt's own "How we structure our dbt projects" guide and the wider community converge on three layers:
- **Staging (`stg_`)**: one model per source object, 1:1 with source; only renaming, type casting, basic cleaning, light filtering (e.g., removing soft-deletes). **No joins, no aggregations, no business logic.** dbt community guidance is explicit that aggregations and complex joins "change the grain" and belong downstream — staging "should be boring, and that's good."
- **Intermediate (`int_`)**: purpose-built transformation steps that join staging models, apply reusable business logic, change grain (group/pivot/fan-out), and isolate complex logic. dbt docs describe it as "molecules" between the "atoms" of staging and the "proteins/cells" of marts; it is **not exposed to end users**.
- **Marts (`mart_`/`fct_`/`dim_`)**: final, consumption-ready business entities, organized by domain (finance/, marketing/…). Marts should trust that inputs are already clean.

This maps 1:1 onto the **medallion architecture** (Bronze/Silver/Gold = raw/cleaned/business-ready), which is the same idea under different names. As the SkyDeLake write-up puts it: "Don't get attached to 'Bronze / Silver / Gold' as the only valid names… What matters is not the names but the discipline: each layer has a clear purpose, data only moves forward (never backward), and each layer can be fully reconstructed from the one before it." That reconstructability — "reprocess from Bronze" — is the single most valuable property.

Folder/naming conventions that survive without dbt (from dbt docs, ModelDock, and analyticsengineering.com):
- `stg_<source>__<entity>` (e.g., `stg_twse__daily_quotes`), `int_<entity>__<verb>` (e.g., `int_prices__adjusted`), and marts named for business concepts (e.g., `fct_daily_prices`, `dim_securities`). The `__` double-underscore separates source/entity from descriptor.
- Map each layer to a **schema** (Postgres schema per layer) so you can apply different access controls, retention, and storage policies per layer — datadef.io recommends "separate databases or schemas so you can apply different access controls, storage policies, and retention rules to each layer."

### 2. Where Prisma should (and shouldn't) live
Prisma is an application ORM, not a transformation framework. Key constraints found:
- Prisma **multi-schema** support (PostgreSQL) is production-ready: list schemas in the `datasource` block and tag models with `@@schema`. This lets one Prisma client span `staging`, `intermediate`, and `marts` schemas if you want.
- Prisma **does not manage views well and does not support materialized views natively**. Views require the `views` preview feature + a manual `migrate dev --create-only` step to paste raw SQL, and Prisma "does not allow any mutations on views." Materialized views are not introspected at all. Multiple practitioners (Christopher Vachon, Atomic Object) ended up building a **custom `views/` folder + a deploy script** that applies view SQL after Prisma migrations run.
- Prisma Migrate can coexist with raw SQL: you can `migrate dev --create-only` and hand-edit, or run a separate raw-SQL migration tool. Prisma also has **no down/rollback** ("does not currently roll back a migration without resetting the database").

**Recommendation that emerged:** Let Prisma be the source of truth for **marts** (the curated tables/read-models your query API and business layer consume) and any operational app tables. Treat **raw/staging/intermediate** as data-engineering assets managed by **raw SQL migrations** (and/or views/materialized tables created by your ETL code), not by the Prisma schema. This avoids fighting Prisma over views, materialized views, and the append-only bitemporal tables that don't fit the ORM's mutable-row model.

### 3. Point-in-time / bitemporal correctness (the heart of avoiding look-ahead bias)
Two temporal dimensions must be modeled:
- **Valid time** (effective/application time): when a fact is true in the real world (the fiscal period a financial statement pertains to).
- **Transaction/knowledge time**: when the database *learned* the fact (the earnings **announcement/publish date**).

The canonical backtest question — "what did we think the price was last Tuesday, based on what we knew at the time?" — requires **both**. Critically, **PostgreSQL has no native transaction-time support even in Postgres 18/19**. This is confirmed by the PostgreSQL 18 release notes and by Gülçin Yıldırım Jelínek (Xata): PG18's `WITHOUT OVERLAPS`/`PERIOD` cover application (valid) time only — "On the transaction time side (system-managed history and automatic versioning), PostgreSQL still does not provide native support." PostgreSQL 19 Beta 1 (released June 4, 2026; Beta 3 on Aug 13, 2026) adds `UPDATE/DELETE ... FOR PORTION OF` for valid time; `GENERATED ALWAYS AS ROW START/END` / SQL system versioning is **not** supported. For system time, the `periods` extension (github.com/xocolatl/periods) exists, but the pragmatic path is to model the knowledge dimension yourself and filter it explicitly.

Concrete marts design (append-only, every restatement is its own row):
```sql
CREATE TABLE marts.fct_financials (
    id                BIGINT GENERATED ALWAYS AS IDENTITY,
    company_id        INT         NOT NULL,
    fiscal_period     DATE        NOT NULL,        -- valid time: what it describes
    announcement_date TIMESTAMPTZ NOT NULL,        -- transaction/knowledge time: when known
    is_restatement    BOOLEAN     NOT NULL DEFAULT false,
    metric_eps        NUMERIC,
    metric_revenue    NUMERIC,
    loaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX idx_fin_company_ann
  ON marts.fct_financials (company_id, announcement_date DESC, fiscal_period DESC);
CREATE INDEX idx_fin_ann_brin
  ON marts.fct_financials USING BRIN (announcement_date);  -- for huge append-only history
```

The as-of query (no look-ahead) — the recommended `DISTINCT ON` pattern (Crunchy Data endorses `DISTINCT ON` as the idiomatic Postgres tool for "one row per group by ordering"):
```sql
SELECT DISTINCT ON (company_id)
       company_id, fiscal_period, metric_eps, metric_revenue, announcement_date
FROM   marts.fct_financials
WHERE  announcement_date <= :as_of_ts     -- knowledge-time filter: no peeking into the future
  AND  fiscal_period      <= :as_of_ts
ORDER  BY company_id, fiscal_period DESC, announcement_date DESC, id DESC;  -- id = tiebreaker
```
For a rebalance calendar, a `LEFT JOIN LATERAL … LIMIT 1` per (company, rebalance_date) is the idiomatic per-entity variant:
```sql
SELECT r.company_id, r.rebalance_date, f.fiscal_period, f.metric_eps
FROM   rebalance_calendar r
LEFT JOIN LATERAL (
    SELECT f.*
    FROM   marts.fct_financials f
    WHERE  f.company_id        = r.company_id
      AND  f.announcement_date <= r.rebalance_date   -- only data known by that date
    ORDER  BY f.fiscal_period DESC, f.announcement_date DESC
    LIMIT 1
) f ON true;
```

Storage guidance (from TEJ's Taiwan point-in-time database and S&P Global Market Intelligence via Eagle Alpha) — directly relevant since oingg.com targets TWSE/TPEx:
- Store announcement time as `TIMESTAMPTZ` with full precision. Per TEJ's "Point-in-Time Audited Financial Database": "Since 2013 (based on the cover date of reports), announcement times are recorded down to hours, minutes, and seconds. This granularity even allows backtesting accuracy to extend to intraday price reactions." (TEJ's coverage also spans "all companies ever listed since 2005, including delisted firms," which is how it also eliminates survivorship bias.)
- **Never UPDATE in place** — keep each restatement as a new row so the original figure is preserved. TEJ documents a concrete Taiwan case: a firm corrected treasury shares "from 25,637 shares to 500,000 shares" via MOPS on August 14, 2025, and notes "Any backtest prior to 2025/08/14 would still read the old figure of 25,637 shares" — the exact behavior you want, and impossible if you overwrite. The stakes are large: per S&P Global Market Intelligence (via Eagle Alpha, May 6, 2024), GUD Holdings "shifted from the 92nd to the 27th percentile post-restatement," and Ildong Holdings "went from a top 5% ranking to the 88th percentile after restatement."
- Avoid the "add a blanket N-month reporting lag" anti-pattern — a real stored `announcement_date` is strictly better (AnalystPrep notes artificial lag "introduces stale information").

Tooling for temporal integrity in Postgres:
- **Range types** (`tstzrange`, `daterange`) + **`btree_gist` exclusion constraints** to prevent overlapping validity periods.
- **`pg_bitemporal`** (GitHub: scalegenius/pg_bitemporal, by Hettie Dombrovskaya & Chad Slaughter) — a PL/pgSQL framework using *doubled* exclusion constraints (one for effective range, one for asserted range) plus functions for bitemporal insert/update/correction. The closest off-the-shelf tool to a full bitemporal store.
- On Postgres 18+, `WITHOUT OVERLAPS` temporal primary keys (valid time only).

**Propagating `as_of` across layers:** carry the source-provided timestamps (announcement/publish, and an ingestion `loaded_at`) from raw → staging → intermediate → marts without ever collapsing them to "latest." Each layer preserves versions; only the *query* at read time picks the as-of slice.

### 4. Common pitfalls in TypeScript/Node.js layered ETL
- **Business logic creeping into staging** (raw columns and filters like `WHERE amount > 0` should live in silver/staging, aggregates in marts). "Skipping staging models → raw columns sneak into marts" (Alexendra Scott / Medium).
- **Skipping the intermediate layer**, producing giant unmaintainable mart queries ("SQL spaghetti").
- **Non-idempotent / non-deterministic transforms**: using `NOW()`/`CURRENT_TIMESTAMP`/random inside transforms breaks reprocessing. Best practice: pass a **logical execution date** from the orchestrator; prefer replace-over-append (partition replacement or MERGE/upsert with deterministic keys) so re-runs are safe. This matters doubly for backtesting: a non-deterministic transform silently corrupts historical point-in-time state.
- **Lineage/schema confusion across multiple independent ingestion services**: each TWSE ingestion microservice writing to `raw`/`staging` independently makes it hard to know "where did this data come from and where does it go." Recommended: separate ingestion from transformation from serving ("each section should fail independently and recover independently; avoid mixing logic across layers"), version schemas, validate schema on ingest, and track freshness/volume/lineage metadata centrally.
- **Under-monitoring**: "Data loads succeed but contain an incomplete subset of records… Output tables are technically valid but semantically incorrect." Add freshness checks and volume/anomaly detection.

### 5. Established patterns & tooling for "dbt-style layering without dbt"
- **Medallion architecture** is the dominant vendor-neutral articulation (Databricks, AWS modern data architecture "raw + standardized" layers, ER/Studio). It's explicitly "not a tool… an organisational pattern."
- **SQLMesh** (Tobiko Data, open-source) is the most credible dbt alternative if you later want a framework: it supports **native Python models**, compile-time SQL validation, column-level lineage, virtual environments, and interval-based incremental models with automatic backfills — and it can read existing dbt projects. Tobiko's Databricks-partnered benchmark (updated June 7, 2025) claims "SQLMesh outperforms dbt by 9x in both speed of execution and compute cost" (dbt's Fusion engine is separately cited as ~30× faster at *parsing*, which is client-side, not warehouse run time — treat both as directional). Worth knowing as an escape hatch, though it's Python-based.
- **OpenLineage** (open standard; reference impl Marquez; integrates with DataHub/Amundsen) for lineage across heterogeneous microservices — you can emit lineage events from custom pipelines.
- **Raw-SQL migration tools alongside Prisma**: **dbmate**, **Sqitch**, **Flyway**, **golang-migrate**, **Atlas** (declarative). A documented pattern pairs **dbmate** (raw SQL migrations for the data-engineering layers/views) with **Prisma Migrate** (app/marts schema), plus a CI check that `prisma generate` produces no drift.
- **TypeScript ETL** is viable: LogRocket documents an end-to-end TS pipeline extracting APIs, transforming with typed interfaces + runtime validation, loading to Postgres via Prisma, scheduled with node-cron. TypeScript's static typing "promote[s] code organization and maintainability in ETL architecture."

### 6. Postgres schema-per-layer implementation & views-vs-tables
- **Schema per layer**: `raw`, `staging`, `intermediate`, `marts` schemas within one database. Prisma multi-schema can reference them; or keep the engineering layers outside Prisma entirely.
- **Views vs materialized tables**: staging is often **views** (cheap, always fresh — dbt materializes staging as views by default) while intermediate/marts that are expensive or queried often are **materialized tables**. dbt community warns "Using only views → performance issues on large datasets," so for backtesting-scale scans, materialize marts. Postgres materialized views are an option but Prisma won't manage them — create/refresh them from your ETL code or SQL migrations.
- **Reprocessing**: because raw is immutable/append-only, you can always rebuild staging→intermediate→marts from raw without re-hitting TWSE.

## Details

### Recommended concrete architecture for oingg.com

**Database schemas (one Postgres DB):**
```
raw/          -- landing zone; exactly as received from each TWSE/TPEx ingestion service
              -- append-only, immutable; + metadata cols (source, ingested_at, source_file/url, batch_id)
staging/      -- stg_twse__daily_quotes, stg_twse__financials, stg_tpex__daily_quotes ...
              -- 1:1 with raw; cast types, rename to snake_case, dedupe, validate. NO business logic.
intermediate/ -- int_prices__adjusted, int_securities__conformed, int_financials__pit
              -- joins, corporate-action adjustments, cross-source conformance, grain changes
marts/        -- fct_daily_prices, fct_financials, dim_securities, screener read-models
              -- point-in-time correct, consumption-ready; OWNED BY PRISMA
```

**Ownership split:**
- **Prisma owns**: `marts.*` (+ any app/operational tables and the query-API read models). These are the typed models your Node/TS business layer queries.
- **Raw SQL migrations own**: `raw/`, `staging/`, `intermediate/` DDL, plus any views/materialized views and bitemporal exclusion constraints Prisma can't express. Use dbmate (or Sqitch) with numbered SQL files; run them in your deploy before/after `prisma migrate deploy` as appropriate.

**Transformation code (TS microservices):**
- One module per model, mirroring dbt's one-file-per-model discipline: `transforms/staging/stg_twse__daily_quotes.ts`, `transforms/intermediate/int_prices__adjusted.ts`, `transforms/marts/fct_daily_prices.ts`. Each exports a pure function that takes a **logical run date** and writes to its target table idempotently (delete-by-partition-then-insert, or upsert on a deterministic key).
- Keep each transform's SQL in a co-located `.sql` file executed via the `pg` driver (or Prisma `$executeRaw`), so the transformation logic is reviewable SQL, not buried ORM calls.

**Idempotency & determinism rules:**
- Never call `NOW()`/random in a transform; pass `runDate` explicitly. Derive surrogate keys deterministically from content.
- Prefer partition-replacement (`DELETE WHERE as_of_date = :runDate; INSERT …`) so re-runs and backfills are safe.

**Lineage/run metadata (lightweight):**
- A `meta.pipeline_runs` table (service, model, layer, run_date, rows_in, rows_out, started/finished, status) gives you freshness + volume anomaly detection and a poor-man's lineage across your independent ingestion services. Consider OpenLineage later if it grows.

### Point-in-time propagation, concretely
- **raw**: store the raw payload + `ingested_at` + the source's own publish/announcement timestamp if present.
- **staging**: normalize the announcement/publish timestamp into a typed `announcement_date TIMESTAMPTZ`; keep every version.
- **intermediate**: `int_financials__pit` conforms announcement dates, joins securities, but still keeps all versions.
- **marts**: `fct_financials` as above; the screener/backtest API always filters `announcement_date <= :as_of` and uses `DISTINCT ON` (or LATERAL) to pick the as-of-known version. Prices similarly carry a trade date (valid) and, for adjustments, the ex-date/announcement of corporate actions so adjusted series are point-in-time correct.

### When to reach for a real framework
If the hand-rolled TS approach starts to strain (dependency ordering, backfills, environment isolation, testing), **SQLMesh** is the strongest fit given its native Python models, interval-based incrementals with automatic safe backfills, built-in column-level lineage, and dbt-project compatibility — you could introduce it for the transformation layers while keeping Prisma for the app. dbt Core itself remains an option (it works on plain Postgres) if you're willing to run SQL+Jinja.

## Recommendations

**Stage 1 — Establish the skeleton (now):**
1. Create four Postgres schemas: `raw`, `staging`, `intermediate`, `marts`. Adopt `stg_`/`int_`/`fct_`/`dim_` naming with `source__entity` convention.
2. Split migration ownership: Prisma Migrate for `marts` + app tables; adopt **dbmate** (raw SQL) for `raw`/`staging`/`intermediate` and for views/materialized views/bitemporal constraints. Add a CI step asserting no Prisma drift.
3. Make `raw` strictly append-only and immutable, with ingestion metadata columns. This buys you reprocessability.

**Stage 2 — Bake in point-in-time correctness:**
4. Add `announcement_date TIMESTAMPTZ` (knowledge time) + `fiscal_period`/trade date (valid time) to every fact; keep every restatement as a new row; index `(entity_id, announcement_date DESC, …)` + BRIN on the date for big tables.
5. Standardize the as-of read pattern (`WHERE announcement_date <= :T` + `DISTINCT ON`) in your query API. Write a test that asserts a query at time T never returns rows with `announcement_date > T` — this is your look-ahead-bias regression guard.
6. Enforce non-overlap where appropriate with `btree_gist` exclusion constraints; evaluate `pg_bitemporal` if you want a maintained framework for corrections/inactivations.

**Stage 3 — Harden the pipeline:**
7. Make every transform deterministic (logical run date in, idempotent write out). Add a `meta.pipeline_runs` table for freshness/volume monitoring.
8. Enforce layer discipline in code review: no joins/aggregations/business logic in `stg_`; no cleaning in marts; never skip intermediate for multi-step logic.
9. Materialize expensive marts as tables (not views); use views for thin staging.

**Benchmarks/thresholds that change the plan:**
- If transform DAG ordering, backfills, or environment isolation become painful → adopt **SQLMesh** (or dbt Core) for the transformation layers while keeping Prisma for the app/marts read models.
- If you add many independent ingestion services and lose track of data flow → adopt **OpenLineage/Marquez**.
- If bitemporal correction logic (restating history) gets complex/error-prone → adopt **pg_bitemporal** or upgrade to Postgres 18+ temporal features (valid-time only; you still hand-roll knowledge time).
- If mart query latency for backtests degrades → materialize + partition by date and lean on BRIN/composite indexes.

## Caveats
- **Postgres has no native transaction-time (`FOR SYSTEM_TIME AS OF`) support even in versions 18/19** — the announcement/knowledge dimension is always DIY. PG18's `WITHOUT OVERLAPS`/`PERIOD` and PG19's `FOR PORTION OF` cover only valid time; SQL system versioning (`GENERATED ALWAYS AS ROW START/END`) is not supported (the `periods` extension can emulate it). Confirm your actual Postgres version before relying on any native temporal syntax; on ≤17 use `btree_gist` exclusion constraints or `pg_bitemporal`.
- Several implementation specifics (view management, materialized views) reflect **Prisma limitations that are actively evolving** — verify against your Prisma version; the "views preview feature" and custom `views/` deploy-script pattern are community workarounds, not first-class support.
- dbt's layer definitions are **conventions**, not laws; a low-volume single-source pipeline can legitimately collapse bronze+silver or skip intermediate — the three-layer split "earns its complexity mainly when reprocessing raw history, auditing lineage, or supporting multiple downstream consumers."
- SQLMesh/dbt performance claims come from vendor benchmarks (Tobiko's is Databricks-partnered) and community blogs (some dated 2025–2026) — the "9x faster/cheaper" and "~30x faster parsing" figures are directional, not validated for your Postgres workload.
- Bitemporal modeling roughly multiplies storage and adds real complexity — per Mike Brody (Exago) in Dataversity's "Bitemporal Data Modeling": "Adding four date values to every data point effectively quintuples the size of your database, and that's just the tip of the iceberg." This is justified here by the backtesting correctness requirement, but scope it to the facts that actually get restated (financials, corporate actions) rather than every row.