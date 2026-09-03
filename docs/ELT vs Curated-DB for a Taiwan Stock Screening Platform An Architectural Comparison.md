# ELT vs. Curated-DB for a Taiwan Stock Screening Platform: An Architectural Comparison

## TL;DR
- **For oingg.com, a hybrid is correct and you have essentially already chosen it: keep an immutable raw landing zone, run an ELT/transformation layer to build and maintain a curated, `as_of`-versioned serving database — do not serve API traffic by transforming raw data on the fly.** The curated-serving pattern is the one financial data platforms with strict point-in-time integrity converge on; pure "load-raw-then-transform-on-read" ELT is the wrong primary serving model for look-ahead-sensitive fundamentals.
- **The two approaches are not mutually exclusive and should not be framed as either/or.** ELT is a *pipeline/ingestion* philosophy (load raw first, transform in-place later); "curated DB" is a *serving-layer* philosophy (pre-compute and persist the modeled dataset consumers read). Modern medallion architecture (bronze/silver/gold) literally uses ELT to *populate* a curated gold layer — that is the pattern you want.
- **For a solo developer, favor operational simplicity: a single Postgres instance (which you already run) can hold both a raw/bronze schema and a curated/gold schema with `as_of` bitemporal versioning, orchestrated by a lightweight scheduler.** Reserve a dedicated warehouse (Snowflake/BigQuery) or a specialized OLAP/serving engine (ClickHouse, DuckDB, ArcticDB) only when data volume, query latency, or concurrency demonstrably exceed what Postgres delivers.

## Key Findings

1. **ELT and "curated DB" answer different questions.** ETL/ELT describes *when and where transformation happens* relative to loading; the "curated database" question is about *what your API reads from* — a pre-modeled serving artifact versus raw/near-raw data transformed at query time. The real design axis for you is **precompute-and-serve vs. transform-on-read**, not ETL vs. ELT.

2. **Point-in-time integrity is the decisive constraint, and it favors a curated, versioned store.** Look-ahead bias — using data in a backtest that was not actually available at the decision date — is, per AnalystPrep's CFA Level II notes, such that "It is noteworthy that this is the most common mistake made when backtesting is conducted." Per ARIA Analyst, "using revised data introduces look-ahead bias of 1-3 percentage points per year for fundamentals-based strategies" (corroborated by work citing Bailey & López de Prado, which puts the inflation at roughly 100–500 basis points annually). Taiwan has a specific complication: its Financial Supervisory Commission announced an IFRS roadmap on May 14, 2009, and required Phase I — 1,436 listed companies — to prepare statements under Taiwan-IFRS from January 1, 2013, with 2012 GAAP statements restated to IFRS for comparison, creating a discontinuity with earlier data. A curated, bitemporally versioned dataset is the standard remedy; on-the-fly transformation of raw data does not by itself give you "what did we know on date X."

3. **The industry pattern for point-in-time financial data is a purpose-built, versioned serving store, not on-demand transformation.** S&P's Compustat Point-in-Time database keeps "all changes to fundamental items and their associated point dates" from 1987, preserving original values plus every subsequent restatement. Taiwan's TEJ offers a Point-in-Time Audited Financial Database with "full version retention" that reconciles pre-2012 GAAP into IFRS-equivalent form. Man Group built ArcticDB, a bitemporal "DataFrame database" on object storage that "versions data automatically on every write, enabling point-in-time queries, reproducible research." These are all *curated, versioned serving layers*.

4. **ELT's genuine strengths map to your ingestion layer, not your serving layer.** Because raw data lands first and is retained immutably, reprocessing and backfill become easy: "If business logic changes, teams can rerun transformations without pulling the data in again." This is exactly why a raw/bronze landing zone is valuable — it is your "replay guarantee." But the transformed *output* should still be materialized into the curated store your API reads.

5. **Query latency for API consumers strongly favors precomputation.** A general-purpose warehouse "will never match the serving store on a known, bounded set of queries: no amount of elastic compute makes a cold general-purpose scan as cheap or as fast as reading a small, sorted, pre-aggregated table built for exactly that query." Per ClickHouse's Ramp case study, quoting Ramp Director of Engineering Ryan Delgado, after moving customer-facing analytics off Postgres (via Debezium→Kafka→ClickHouse, serving 50,000 customers), "Charts that once timed out after 40 seconds were returning in milliseconds." For a stock screener issuing many bounded, repetitive queries, a curated/pre-aggregated serving layer is the right latency strategy.

6. **dbt is the de-facto ELT transformation-layer tool and it can build your curated layer, but its `snapshot` feature has a critical point-in-time caveat.** dbt snapshots "only track changes from the moment you create and start running them" and "can't reconstruct history from before the first snapshot run"; they can also miss changes that happen between runs. For financial point-in-time integrity, you must snapshot at ingestion (capture every vintage of raw filings) rather than relying on downstream snapshots to reconstruct what was known.

7. **For a solo developer, tooling maturity and operational simplicity dominate.** dbt + a scheduler (Airflow/Dagster/cron) is mature and well-documented, but running a full warehouse + orchestrator + BI stack is overkill early. Postgres works well as a combined raw+curated store up to roughly 1–2 TB; beyond that, or under heavy analytical concurrency, a dedicated OLAP/warehouse engine earns its place.

## Details

### 1. Definitions and core architectural differences

**ETL (Extract–Transform–Load)** transforms data in a separate engine *before* loading it into the target; it emerged in the 1970s under resource constraints and uses a schema-on-write approach. **ELT (Extract–Load–Transform)** loads raw data into the target first and transforms it *in-place* afterward, leveraging the destination's compute; it rose with cloud warehouses (Snowflake, BigQuery, Redshift) in the 2010s. The core distinction is timing: "When does data transformation happen?"

The **"curated database" approach** is a serving-layer decision that is orthogonal to that timing question. A curated/serving layer is "data that is in the most consumption-ready state and conforms to organizational standards and data models… partitioned, cataloged, and stored in formats that support performant and cost-effective access by the consumption layer." The alternative — transform-on-read — exposes raw or lightly-staged data and applies business logic in views or at query time.

**Medallion architecture (bronze/silver/gold)**, popularized by Databricks with Delta Lake (open-sourced 2019), reconciles these: bronze is the raw, append-only landing zone ("Preserve fidelity and provide a source of truth for reprocessing"); silver is cleaned/conformed/deduplicated; gold is business-ready curated output. Critically, "Medallion is compatible with both ETL and ELT: Bronze often resembles the Load step in ELT." In other words, **modern ELT is normally used to populate a curated (gold) serving layer** — the two ideas you're comparing are usually combined, not opposed. A minority "end of the Bronze age" critique argues a raw tier that no one validates is where "silent corruption and reprocessing fire drills originate," but for point-in-time financial data the replay/audit value of an immutable raw tier is high.

### 2. Pros and cons across dimensions relevant to a financial data platform

| Dimension | ELT / transform-on-read (raw in warehouse, views/on-demand) | Curated / ETL-to-serving (pre-modeled, materialized serving DB) |
|---|---|---|
| **API query latency** | Weaker: cold general-purpose scans have an architectural latency floor (planning, scheduling, remote storage); depends on warehouse being warm | Stronger: reads a small, sorted, pre-aggregated table built for the exact query; millisecond responses feasible |
| **Storage cost** | Lower duplication if you keep only raw + views; but raw retention grows | Higher: stores raw + curated + version history; storage is cheap, though `as_of` versioning multiplies rows |
| **Data freshness** | Faster to *land* raw data; transforms can lag or be on-demand | Curated layer only as fresh as last pipeline run; batch cadence introduces lag |
| **Reprocess / backfill** | Excellent: immutable raw retained, rerun transforms without re-extracting | Good only if you keep a raw layer to rebuild from; otherwise history is lost |
| **Auditability / point-in-time** | Weak by default: transform-on-read reflects *current* raw state unless you version raw vintages | Strong: designed to persist `as_of`/vintage; the standard for look-ahead-free backtests |
| **Schema evolution** | Flexible: schema-on-read, raw JSON tolerated, model later | Rigid at the curated layer: schema changes require model/migration work; dynamic-schema stores (ArcticDB) mitigate |
| **Operational complexity** | Lower conceptually, but warehouse cost governance and access control needed | Higher: pipeline + serving store + versioning logic to maintain |
| **Tooling maturity** | Very mature: dbt + Fivetran/Airbyte + warehouse | Mature but more bespoke: dbt snapshots, SCD2, temporal tables, or specialized stores |
| **Solo-dev fit** | Good if you already have a warehouse; risk of runaway compute cost | Good on a single Postgres; more upfront modeling but predictable serving |

**Storage cost nuance.** The daily-snapshot ("keep a full snapshot of your dimension for every single day") approach to versioning is "easy to manage and maintain" but incurs "increased, super redundant storage" — acceptable "in the infinite cheap storage/compute world, especially given dimensions being relatively small in relation to facts." Taiwan's investable universe is small: per the TWSE Fact Book 2026 there were 1,063 listed companies in 2025, and per the TPEx 2025 Annual Report the TPEx Mainboard had 874 companies plus 350 on the Emerging Stock Market (≈2,287 total; combined TWSE+OTC market cap was ~US$4.89 trillion per Reuters in May 2026). With quarterly fundamentals over this universe, the versioned curated dataset is small enough that storage cost is a non-issue; correctness dominates.

**Compliance framing.** General ETL-vs-ELT guidance repeatedly notes ETL/pre-load transformation "is ideal for compliance-intensive sectors such as healthcare and fintech," while ELT "needs tight warehouse access control" because raw data lands first. For your use case, the more relevant compliance-analog is *reproducibility*, not PII masking.

### 3. Interaction with `as_of` / point-in-time versioned design

Financial point-in-time correctness is usually modeled **bitemporally**: **valid time** ("the period during which a fact is true in the real world") and **transaction time** ("when the fact was recorded in the system"). For fundamentals, valid time ≈ the fiscal period the statement covers; transaction time ≈ when that (possibly later-restated) figure became known to you. A backtest "as of date X" must query the version whose transaction time ≤ X — capturing exactly the reporting lag and restatements that cause look-ahead bias when ignored.

Implementation options, from simplest to most specialized:
- **SCD Type 2** rows with `effective_from` / `effective_to` / `is_current` — "history is immutable… a permanent snapshot of the past, allowing 'as-was' reporting." The natural key requires a surrogate key because an entity spans multiple rows.
- **Daily full snapshots** of dimensions — lazy, storage-heavy, trivially correct.
- **Database temporal tables** (e.g., Azure SQL/SQL Server system-versioned tables) that track valid+transaction time transparently.
- **Specialized versioned stores** (ArcticDB versions on every write; Compustat/TEJ ship point-in-time natively).

**Where ELT/dbt fits and its trap:** dbt `snapshot` implements SCD2 and is the natural transform-layer tool, but it "only track[s] changes from the moment you create and start running them" and "can't reconstruct history from before the first snapshot run," and can miss intra-run changes with the `timestamp` strategy. **The correct design for point-in-time fundamentals is to capture every vintage at *ingestion*** — snapshot the raw MOPS/TWSE filing each time you fetch it, keyed by fetch/publish date — rather than relying on a downstream snapshot to infer what was known. Because MOPS reports as-published and issues restatements, your raw/bronze layer must be append-only and vintage-stamped; the curated `as_of` layer is then derived deterministically and is fully rebuildable.

### 4. Real-world examples and case studies

- **Man Group — ArcticDB (curated, bitemporal serving store; the flagship quant example).** ArcticDB is a Python-native "DataFrame database" with a C++ engine sitting directly on S3-compatible object storage with **no database servers**; it "versions data automatically on every write, enabling point-in-time queries, reproducible research, efficient daily appends, and historical corrections." Man Group's James Munro: "no database servers, straight to Python users… billions of rows per second"; the core is "an immutable data structure, where you just add versions, rather than modifying previous versions." Chosen for point-in-time auditability, dynamic schemas, a single source of truth across research/risk/execution, and infrastructure cost savings. Open-sourced in 2023 with Bloomberg.
- **S&P Compustat / TEJ (curated point-in-time vendors).** Compustat Point-in-Time preserves original values plus all restatements with point dates since 1987; TEJ's Taiwan PIT database offers full version retention and GAAP→IFRS reconciliation. Both exist precisely because on-the-fly transformation of latest-revised data produces biased backtests.
- **Ramp — ClickHouse curated serving layer in front of Postgres (fintech, low-latency).** Postgres CDC (Debezium) → Kafka → denormalized/enriched records → ClickHouse; charts that "timed out after 40 seconds were returning in milliseconds" for 50,000 customers. Reason: Postgres could not serve low-latency, high-concurrency, customer-facing analytics on high-volume transaction tables.
- **M1 Finance — dbt + Snowflake ELT-in-warehouse (fintech, governed metrics).** "Everything in M1's data warehouse is modeled in dbt," with a dbt Semantic Layer of pre-vetted metrics. Reason: as a regulated fintech, "fast access to accurate data is critical… for strategic decision making and strict regulatory compliance"; dbt gives consistent, tested, documented metrics and governed self-service. This is the archetypal ELT-in-warehouse win — but note it's for *internal analytics*, not look-ahead-sensitive serving.
- **Coinbase / Robinhood — lakehouse (streaming/regulatory).** Coinbase replaced a Kafka→Snowflake ETL pipeline with Spark Structured Streaming into Delta Lake to handle "hundreds of thousands of events per second"; Robinhood built an Apache Hudi lakehouse (CDC on Postgres) that cut data freshness "from 24h to <15 min" and enabled GDPR record-level deletes. These show ELT/lakehouse winning for *high-volume streaming and governance*, not point-in-time fundamentals.
- **Other market-data serving DBs on ClickHouse:** QRT (real-time risk/P&L), Bloomberg (on-prem market analytics), Longbridge (~10x over Postgres). Pattern: sub-second, high-concurrency market-data/risk serving pushes teams to a dedicated OLAP serving store.

The recurring theme: **low-latency, customer-facing, or point-in-time/regulatory workloads → dedicated curated/versioned serving stores; internal BI and governed-metric consistency → warehouse + dbt ELT. Many firms run both.**

### 5. Recommendations and best practices — when to prefer each

- **Prefer transform-on-read ELT** when: consumers are internal analysts doing ad-hoc exploration; query patterns are unpredictable; you already run a cloud warehouse; freshness of *landing* matters more than serving latency; and point-in-time reconstruction is not a hard requirement.
- **Prefer a curated, pre-computed serving DB** when: you serve an external API with bounded, repetitive queries; latency/concurrency matter; and — decisively for you — you require reproducible, look-ahead-free point-in-time answers.
- **Best practice hybrid (recommended for oingg.com):** raw/bronze landing zone (immutable, vintage-stamped) → ELT/transform layer (dbt or plain SQL/Python) → curated/gold `as_of`-versioned serving DB that the query API reads. This gives you ELT's reprocessing/backfill freedom *and* the curated layer's latency and point-in-time guarantees.

## Recommendations

**Stage 1 — Now (single Postgres, solo-dev optimized).**
1. Keep your microservice ingestion services writing **immutable, vintage-stamped raw rows** (bronze) into a `raw` schema in Postgres — every fetch of a MOPS/TWSE/TPEx filing stored with its fetch/publish date, never overwritten. This is your replay guarantee and the foundation of point-in-time correctness.
2. Build the **curated (`as_of`) serving schema** via a deterministic transformation step (plain SQL/Python is fine; adopt dbt if you want tests/lineage/docs). Model fundamentals **bitemporally** (valid time = fiscal period; transaction time = when known), using SCD2-style `effective_from`/`effective_to` + surrogate keys, or Postgres range types.
3. Serve the **query API exclusively from the curated layer**, never by transforming raw data on the fly. Add covering indexes/partitioning on the hot query patterns (screening filters, `as_of` date).
4. Make the pipeline **idempotent and backfillable** so a fixed transformation bug can rebuild the entire curated history from bronze.

**Stage 2 — Adopt dbt for the transform layer** when transformation logic grows complex enough to need version-controlled models, automated tests (uniqueness, not-null, `mutually_exclusive_ranges` to catch overlapping/gapped validity intervals), and auto-generated lineage/docs. **Do the point-in-time capture at ingestion, not via downstream dbt snapshots**, given the "can't reconstruct history from before the first snapshot run" limitation.

**Stage 3 — Introduce a dedicated OLAP/serving engine (ClickHouse, DuckDB, or a warehouse)** only when a concrete threshold is crossed, not preemptively.

**Thresholds that should change the plan:**
- Curated dataset or working set approaches **~1–2 TB**, or analytical queries exceed what a tuned Postgres delivers → evaluate DuckDB (embedded, cheap) or ClickHouse (concurrency) as a read-serving layer, keeping Postgres as the system of record.
- **p95 API latency** on screening queries exceeds your UX budget (a few hundred ms) despite indexing → add a pre-aggregated serving store.
- **Concurrency** from real users causes Postgres contention → offload reads to an OLAP replica.
- You need **cross-vintage, petabyte-scale quant research** or heavy Python/pandas time-series workflows → evaluate ArcticDB.
- If you ever consider a managed warehouse: remember the cost reality that tooling is the cheap part and the operational/people cost dominates for a solo dev — stay lean.

## Caveats
- **Vendor-sourced case studies.** The Ramp, Coinbase, Robinhood, M1, ClickHouse, and ArcticDB examples come substantially from vendor or vendor-adjacent blogs; the named-engineer quotes are attributable, but competitive benchmark claims (e.g., "10x over Postgres," "40s→ms") are directional, not independently audited.
- **Latency numbers are context-specific.** Ramp's and others' figures reflect their data volumes and schemas; your Taiwan dataset is far smaller, so a tuned Postgres may never hit those walls.
- **dbt snapshot limitation is real and easy to get wrong.** Relying on downstream snapshots for point-in-time will silently produce incomplete history; capture vintages at ingestion.
- **Taiwan-specific data issues** (GAAP→IFRS 2013 discontinuity, ROC-calendar dates, MOPS restatements, monthly-revenue vs. quarterly-statement cadence, TTM/Q4-standalone gaps) require explicit handling regardless of architecture; the curated layer is where you encode these rules once.
- **"Freshness vs. correctness" trade-off.** A batch-built curated layer lags real-time; for a fundamentals screener this is acceptable, but any future intraday/price features may need a separate low-latency path.
- I found no published engineering case study of Nasdaq's *internal* platform on dbt; the only Nasdaq–dbt link is participation in a 2025 semantic-layer standards initiative.