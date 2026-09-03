# **Enterprise Data Middle Office Architecture: Node.js Engineering Patterns and Production Best Practices**

## **Architectural Foundations: Node.js within the Data Middle Office**

The enterprise data middle office, historically developed from the data middle platform paradigm, establishes a centralized architectural foundation designed to eliminate cross-departmental data silos, standardize business assets, and expose reusable, service-oriented data capabilities to upper-tier applications1. Originating from the structural concept of a "big middle platform, small front end," this design decouples core enterprise data assets and computation engines from dynamic front-end user experiences3. Within large-scale commercial deployments, organizations frequently implement a dual middle office architecture4. In this dual model, the business middle office abstracts operational business processes such as transaction processing and customer relationship operations, while the data middle office aggregates operational data, performs analytical transformations, and exposes standardized data services back to the business domain4.  
Enterprise data architecture organizes storage and computing into distinct tiers4. The operational data store (ODS) ingests raw data from diverse operational databases, clickstream logs, and external feeds4. The data warehouse detail (DWD) and data warehouse service (DWS) layers subsequently clean, normalize, and aggregate this data into dimensional models and unified business indicators1. Massively parallel processing (MPP) engines such as ClickHouse and distributed computing environments such as Apache Spark and Apache Flink manage petabyte-scale storage, complex multi-table joins, and stateful streaming analytics1.

                                \[ Downstream Consumers \]  
                      (Web Frontends, Mobile Apps, Microservices, BI)  
                                           │  
                                           ▼  
             ┌───────────────────────────────────────────────────────────┐  
             │       Node.js Data Middle Office Tier (DaaS Layer)        │  
             │   \- Protocol Translation & Schema Federation (BFF)        │  
             │   \- High-Concurrency Asynchronous I/O Aggregation         │  
             │   \- XFetch Probabilistic Cache Stampede Prevention        │  
             │   \- Thread Pool & Zero-Copy Worker Computations           │  
             │   \- Attribute-Based Access Control & Field-Level Masking  │  
             │   \- Context-Propagated OpenTelemetry & Trace Correlation  │  
             └─────────────────────────────┬─────────────────────────────┘  
                                           │  
                        ┌──────────────────┴──────────────────┐  
                        ▼                                     ▼  
         \[ Transactional Systems \]             \[ Analytical & Streaming Engines \]  
       (PostgreSQL, MySQL, Redis)          (ClickHouse, Apache Kafka, Apache Flink)

Within this pipeline, Node.js does not replace distributed analytical processing engines5. Attempting to execute heavy multi-table aggregations or parse gigabyte-scale datasets directly on the single-threaded V8 execution context triggers severe event loop starvation and out-of-memory errors7. Node.js functions as a high-concurrency Data-as-a-Service (DaaS) integration tier and backend-for-frontend (BFF) orchestration engine6. Built on an event-driven, non-blocking input/output model managed by libuv, Node.js concurrently handles thousands of client requests, federates disparate upstream analytical queries, validates unified domain models, transforms response payloads, and streams structured data back to clients with minimal latency overhead7.

| Architectural Concern | Analytical Processing Engines (e.g., ClickHouse, Flink, Spark) | Node.js Data Middle Office Tier (DaaS Layer) |
| :---- | :---- | :---- |
| **Primary Workload Profile** | Vectorized scanning, massive multi-table analytical aggregations, petabyte distributed batch transformations5 | High-concurrency I/O federation, schema adaptation, payload serialization, API composition9 |
| **Concurrency Characteristics** | Low-to-moderate query concurrency with high compute, memory, and disk usage per execution thread6 | High concurrent connection handling with minimal per-request CPU and memory footprints10 |
| **Runtime Topology** | Multi-threaded, vectorized C++ or distributed JVM runtimes5 | Single-threaded JavaScript event loop backed by non-blocking OS system calls and C++ worker threads7 |
| **Data Scope & Lifecycle** | Deep historical storage, multi-stage data marts, append-only logs, and persistent state stores5 | Ephemeral query aggregation, intermediate serialization, request-scoped contexts, and multi-tier active caches9 |
| **Interfacing Protocols** | Specialized binary protocols, columnar block formats, and low-level internal network sockets6 | REST, GraphQL, gRPC, HTTP/2, JSON Lines (NDJSON), and Server-Sent Events (SSE)12 |

## **Structural System Design and Modular Architecture**

Building a resilient data middle office in Node.js requires structural decoupling between dynamic consumer interfaces and analytical backend engines1. Applying Clean Hexagonal Architecture (Ports and Adapters) alongside Domain-Driven Design (DDD) ensures that the service aggregation layer remains maintainable, testable, and isolated from underlying infrastructure shifts.

### **Clean Hexagonal Architecture**

In a Hexagonal implementation, the central domain core encapsulates business entities, data models, and aggregation contracts, remaining isolated from external frameworks, database drivers, and network protocols. Domain Entities define unified enterprise data structures such as enterprise customer profiles, real-time inventory balances, and consolidated operational metrics. Use Cases coordinate analytical workflows by requesting data across disparate ports, merging transactional metadata with analytical warehouse records, and enforcing business calculation rules.  
The application perimeter comprises inbound and outbound adapters. Inbound adapters translate transport protocols—such as Fastify route handlers, gRPC service stubs, or Kafka event listeners—into domain-level execution commands13. Outbound adapters implement interfaces defined by domain ports, encapsulating technical integrations with specific infrastructure clients including ClickHouse query drivers, PostgreSQL connection pools, Redis cluster clients, and AWS S3 storage adapters11. This boundary allows engineers to refactor physical database topologies or swap analytical storage engines without changing domain calculations or client interfaces.

### **Domain-Driven Design and Data Asset Federation**

Rather than structuring API services around raw database tables or physical storage locations, DDD organizes the middle office into bounded contexts that map to core business domains, such as Enterprise Billing, Supply Chain Logistics, or Customer Risk Assessment. Within each context, data services encapsulate specific analytical models and prevent unmanaged cross-context joins at the storage level.  
When exposing these services to multiple downstream channels, the middle office federates bounded contexts through an API Gateway tier using schema federation or unified gRPC interfaces2. This gateway pattern resolves client queries by dispatching targeted requests to the appropriate domain data services, consolidating partial payloads into a coherent response, and preventing downstream web or mobile teams from directly querying core warehouse infrastructure2.

### **Command Query Responsibility Segregation (CQRS)**

Because the middle office operates at the intersection of high-frequency operational updates and large-scale analytical reads, Command Query Responsibility Segregation (CQRS) is essential15. Command pipelines route state-altering operations—such as updating customer status or ingesting real-time tracking events—through transactional relational engines and append-only event brokers like Apache Kafka15.  
Read pipelines are isolated from transactional write paths15. Inquiries are directed toward denormalized materialized views, low-latency columnar projections, or distributed caching layers designed for fast multi-tenant reads6. Node.js coordinates this lifecycle by publishing write-side domain events, listening for update projections, and servicing incoming read queries from optimized read-only data marts6.

## **High-Throughput Streaming, Pipelines, and Ingestion Mechanics**

Data middle offices continuously ingest tracking logs, transactional change-data-capture (CDC) streams, and external data feeds5. Maintaining throughput while preventing memory exhaustion requires stream-based backpressure management and appropriate message broker integrations7.

### **Backpressure and Pipeline Safety**

The legacy .pipe() method in Node.js introduces operational vulnerabilities in mission-critical data pipelines because it fails to forward errors across stream boundaries and can leave socket or file descriptors open following unexpected stream termination7. Production runtimes mandate the modern node:stream/promises module using the pipeline API, which guarantees bidirectional error forwarding and cleans up unmanaged system resources upon failure7:

TypeScript  
import { pipeline } from 'node:stream/promises';  
import { Transform } from 'node:stream';  
import type { Readable, Writable } from 'node:stream';

interface IngestionChunk {  
  rawEvent: Buffer;  
  receivedAt: number;  
}

const normalizeTransform \= new Transform({  
  objectMode: true,  
  transform(chunk: IngestionChunk, encoding, callback) {  
    try {  
      const sanitized \= transformRawRecord(chunk.rawEvent);  
      callback(null, sanitized);  
    } catch (err) {  
      callback(err instanceof Error ? err : new Error(String(err)));  
    }  
  },  
});

export async function processIngestionStream(  
  source: Readable,  
  destination: Writable  
): Promise\<void\> {  
  await pipeline(source, normalizeTransform, destination);  
}

Stream processing mechanics rely on internal buffer thresholds determined by highWaterMark. When a destination sink encounters I/O latency, its internal write buffer saturates, causing its .write() invocation to return false. A conforming upstream readable source intercepts this backpressure indicator and pauses byte intake at the OS network buffer level (SO\_RCVBUF) using TCP zero-window packets. This prevents memory bloat in the Node.js V8 heap and ensures the process operates with a steady, bounded memory footprint under variable ingestion loads7.

### **Broker Integration: KafkaJS versus node-rdkafka**

Selecting a message broker client in a high-throughput Node.js data platform involves evaluating operational ease against raw processing throughput8. The two primary options in the Node.js ecosystem, kafkajs and node-rdkafka, use fundamentally different architectural models8.  
kafkajs provides a pure JavaScript implementation that installs without native build chains or C++ compilation dependencies, simplifying continuous integration and container deployment8. However, because all network socket framing, broker protocol serialization, and payload decompression occur directly on the single-threaded V8 event loop, high-volume event streams can exhaust CPU capacity8. When processing large message volumes, heavy event loop utilization can prevent timely transmission of consumer group heartbeats to the Kafka coordinator, triggering accidental consumer evictions and expensive partition rebalances8. Furthermore, backpressure handling in kafkajs requires manual intervention within the eachBatch handler, requiring developers to inspect worker loads and explicitly pause and resume assigned partitions8.  
Conversely, node-rdkafka wraps the native C/C++ librdkafka library8. Network I/O, socket multiplexing, and compression algorithms (such as Snappy, LZ4, and Zstandard) execute on background OS threads outside the JavaScript thread8. It maintains an internal native memory queue, automatically pausing network reads from brokers whenever internal queues hit their configured limits (queue.buffering.max.messages)8. This native queueing protects the Node.js heap from sudden data spikes without requiring manual consumer throttling in application code8.

| Architecture Metric | kafkajs | node-rdkafka |
| :---- | :---- | :---- |
| **Runtime Implementation** | 100% Pure JavaScript (Runs on V8 engine)8 | Native C/C++ wrapper over librdkafka \[cite: 8, 12\] |
| **Event Loop Resource Usage** | High during large batches; protocol decoding runs on main loop8 | Low; network protocol management and decompression run on OS threads8 |
| **Backpressure Control** | Manual; requires explicit partition-level pause() and resume() calls8 | Automatic; managed natively via configured buffer queue thresholds8 |
| **Deployment Complexity** | Low; installs clean standard packages into container images8 | Higher; requires dynamic linking, Python, and C++ compilation toolchains8 |
| **Decompression Codecs** | Pluggable JavaScript and WebAssembly modules8 | High-throughput native hardware-optimized implementations8 |
| **Target Workload Profile** | Low-to-moderate throughput, edge microservices, and serverless functions8 | High-throughput CDC pipelines, event ingestion hubs, and continuous ETL streams8 |

### **Batching, Idempotency, and Failure Containment**

To optimize downstream warehouse ingestion, write pipelines should batch events to maximize network efficiency and database compression12. Producers must be configured with idempotent: true, which attaches transactional producer identifiers and monotonic sequence numbers to outgoing batches, allowing broker clusters to discard duplicates produced during network retries12.  
Downstream consumers must implement idempotency checks using transactional outboxes or distributed key-value filters to handle at-least-once message delivery15. If processing fails after exhausted exponential backoff attempts, failed records must be directed to a Dead-Letter Queue (DLQ) topic along with debugging metadata, allowing ingestion pipelines to continue running without blocking partition consumption12.

## **Multi-Tiered Caching and Data Layer Optimization**

Because a data middle office balances high-concurrency client reads against slower analytical databases, caching architecture directly determines system availability and throughput6. A standard cache-aside implementation can expose the platform to cache stampedes (thundering herds): when a popular cache entry expires, thousands of concurrent requests miss the cache simultaneously, sending high query volumes to the underlying database and exhausting its connection pool23.

### **Probabilistic Early Expiration (The XFetch Algorithm)**

To eliminate cache stampedes without using distributed locks that introduce latency bottlenecks, data services can implement the XFetch probabilistic early recomputation algorithm23. XFetch uses an optimal probabilistic model to determine whether an incoming read request should proactively recompute and refresh a cached item in the background before it reaches its hard expiration timestamp23.  
The decision to initiate an asynchronous background refresh is evaluated using the following inequality:  
![][image1]  
In this formula, ![][image2] represents the current Unix timestamp in milliseconds. The variable ![][image3] captures the compute latency (delta duration) required by the underlying analytical database to run the analytical aggregation24. The constant ![][image4] functions as an aggressiveness multiplier (![][image5]); higher ![][image4] values increase the likelihood of early background recomputations24. The variable ![][image6] represents a uniform pseudorandom value sampled from the continuous real interval between zero and one, defined as ![][image7]. The parameter ![][image8] defines the absolute Unix timestamp when the cache key fully expires.  
As the current time approaches the expiration timestamp, the value of ![][image9] scales the computation duration ![][image3], increasing the statistical probability that a read request will satisfy the inequality24. The single incoming request that evaluates to true launches an unblocking background worker to run the analytical query and update the cache23. All other concurrent requests continue receiving the existing cached value immediately23. This approach ensures that hot analytical assets are continuously and transparently refreshed before expiration, protecting backend databases from traffic surges23.

TypeScript  
interface CacheContainer\<T\> {  
  data: T;  
  delta: number;  
  expiry: number;  
}

export async function xfetch\<T\>(  
  key: string,  
  ttlMs: number,  
  computeFn: () \=\> Promise\<T\>,  
  beta \= 1.0  
): Promise\<T\> {  
  const cachedJson \= await redisClient.get(key);  
  const now \= Date.now();

  if (cachedJson) {  
    const entry: CacheContainer\<T\> \= JSON.parse(cachedJson);  
      
    // Probabilistic early expiration condition evaluation  
    if (now \- (entry.delta \* beta \* Math.log(Math.random())) \> entry.expiry) {  
      // Launch non-blocking background recomputation  
      (async () \=\> {  
        const start \= Date.now();  
        const freshData \= await computeFn();  
        const delta \= Date.now() \- start;  
        const newEntry: CacheContainer\<T\> \= {  
          data: freshData,  
          delta,  
          expiry: Date.now() \+ ttlMs,  
        };  
        await redisClient.set(key, JSON.stringify(newEntry), 'PX', ttlMs \* 2);  
      })().catch(err \=\> {  
        logger.error({ err, key }, 'Failed probabilistic background refresh');  
      });

      return entry.data;  
    }  
    return entry.data;  
  }

  // Cold cache miss resolution  
  const start \= Date.now();  
  const freshData \= await computeFn();  
  const delta \= Date.now() \- start;  
  const newEntry: CacheContainer\<T\> \= {  
    data: freshData,  
    delta,  
    expiry: now \+ ttlMs,  
  };  
  await redisClient.set(key, JSON.stringify(newEntry), 'PX', ttlMs \* 2);  
  return freshData;  
}

### **Invalidation Topologies: Secondary Sets and Stale-While-Revalidate**

Simple cache key naming falls short when caching aggregated views that combine multiple operational entities24. To handle complex invalidations, the platform uses secondary index sets in Redis24.  
When caching an analytical response that spans multiple records—such as a corporate vendor report covering a specific vendor and regional territory—the service writes the primary cache key to secondary index sets (e.g., tags:vendor:9918 and tags:region:eu-west)24.  
When a write operation modifies vendor state, an invalidation worker queries the relevant tag set, retrieves all associated cache keys, and removes them using pipelined non-blocking UNLINK commands24. This guarantees that cached metrics across disparate aggregation endpoints remain synchronized with underlying operational state changes24.

### **Analytical Database Connection Management**

A frequent cause of production instability in Node.js data layers is socket exhaustion caused by misconfigured database connection pools11. Unlike relational database management systems that support hundreds of concurrent lightweight queries, analytical columnar stores like ClickHouse prioritize running queries across internal multi-threaded execution cores6. Submitting high volumes of concurrent queries directly to analytical nodes can saturate their thread pools and degrade performance11.

* **ClickHouse HTTP Protocol:** Node.js drivers communicating via HTTP must configure persistent connection agents with bounded socket limits (maxSockets: 32, keepAliveMsecs: 60000). Instantiating new client drivers per request leads to socket exhaustion (accumulating TIME\_WAIT sockets at the operating system level) and overwhelms ClickHouse connection pools11.  
* **PostgreSQL Connection Pool Sizing:** Applications using pg.Pool must calculate total pool size relative to the overall horizontal deployment:

![][image10]  
If this product exceeds the database server's configured max\_connections limit, the database will reject incoming connections. Node.js applications should maintain small pool allocations (typically 10 to 20 connections per pod) and route traffic through an intermediate connection pooler, such as PgBouncer operating in transaction pooling mode, to support scalable client connections without database degradation.

## **Event Loop Optimization, Thread Pools, and Memory Governance**

The Node.js runtime coordinates asynchronous tasks using non-blocking operating system notifications via libuv, but it relies on an internal worker thread pool for synchronous operations7. Running a high-volume data middle office requires calibrating these internal threads and memory boundaries to avoid event loop starvation7.

### **Libuv Thread Pool Sizing**

Network operations across TCP and HTTP sockets use asynchronous operating system polling mechanisms (such as Linux epoll, macOS kqueue, and Windows IOCP), operating without threads from the internal libuv pool7. However, several core Node.js APIs depend on the internal thread pool, including filesystem access (node:fs), cryptographic operations (node:crypto hashing, pbkdf2, random generation), payload compression (node:zlib), and default DNS hostname lookups (dns.lookup)7.  
The default libuv pool size is four worker threads7. In high-throughput data gateways—where services continuously stream files, verify API signatures, compress response payloads, and query backend hosts—four threads can easily cause internal queuing and request latency7. To address this, production environments must set UV\_THREADPOOL\_SIZE before the process initializes7:

Bash  
export UV\_THREADPOOL\_SIZE=64  
node dist/main.js

Applications should also use the dns.resolve\* family of functions instead of dns.lookup7. The dns.resolve\* APIs perform asynchronous DNS queries over network sockets, completely bypassing the libuv thread pool and preserving pool capacity for file I/O and cryptographic operations7.

### **Offloading CPU Workloads via Piscina Worker Pools**

Transforming large analytical query results—such as computing client-specific percentiles, parsing spatial geometries, or transcoding large CSV datasets—blocks the single-threaded V8 event loop7.  
To keep the event loop responsive to incoming network I/O, intensive computations must be delegated to background worker threads using worker pool managers such as piscina26. Piscina maintains a persistent pool of initialized worker\_threads, eliminating the latency and system overhead of spawning processes on demand27:

TypeScript  
import Piscina from 'piscina';  
import { resolve } from 'node:path';  
import { availableParallelism } from 'node:os';

const logicalCores \= availableParallelism();

export const aggregationWorkerPool \= new Piscina({  
  filename: resolve(\_\_dirname, 'workers/transform-engine.js'),  
  minThreads: Math.max(1, Math.floor(logicalCores / 4)),  
  maxThreads: Math.max(1, logicalCores \- 1), // Reserve one CPU core for the main event loop  
  maxQueue: 500,                            // Reject tasks when queue saturates to apply backpressure  
  idleTimeout: 30000,  
});

### **Zero-Copy Memory Transfers using Transferable Objects**

Passing data between the main execution context and background worker threads using standard messaging relies on the structured clone algorithm28. This algorithm deep-copies the entire object graph, introducing an ![][image11] latency overhead that can consume substantial memory when processing large datasets28.  
To achieve zero-copy performance across thread boundaries, services must use Transferable Objects via ArrayBuffer28. Transferring an ArrayBuffer in the transferList parameter transfers the underlying memory pointer directly to the target thread, instantly detaching and emptying it in the originating thread28:

TypeScript  
// Main Execution Context: Zero-Copy Transfer  
const rawDataBuffer \= fetchUnderlyingBinaryBuffer(); // Returns ArrayBuffer  
const processedResult \= await aggregationWorkerPool.run(  
  { payload: rawDataBuffer },  
  { transferList: \[rawDataBuffer\] } // Ownership transferred; zero-copy execution  
);

### **Memory Management and Large Payload Handling**

Parsing multi-megabyte JSON payloads using native JSON.parse or JSON.stringify forces the V8 engine to allocate large contiguous memory buffers, which can trigger garbage collection pauses and risk process crashes7.  
Data middle offices handling large payloads should process streams using incremental tokenizing libraries such as stream-json or bfj to keep memory usage low26.  
Additionally, microservice containers should configure explicit V8 memory limits via \--max-old-space-size=4096. This threshold should be set to approximately 75% of the container's Kubernetes memory limit, reserving the remaining 25% for operating system processes, native C++ bindings, and Buffer allocations outside the V8 heap.

## **Enterprise Governance, Access Control, and Data Security**

As the centralized integration layer across corporate analytical databases, the data middle office must enforce data governance, authentication, and compliance controls across all service interfaces1.

### **Contextual Attribute-Based Access Control (ABAC)**

While static Role-Based Access Control (RBAC) handles coarse administrative permissions, enterprise data platforms require Attribute-Based Access Control (ABAC) to evaluate access dynamically2. The ABAC engine evaluates access decisions at request time by combining subject attributes, resource classification metadata, requested operations, and environmental context:  
![][image12]  
Subject attributes include user roles, organizational hierarchies, and tenant identifiers; resource attributes define data sensitivity, such as confidential or PII classifications; and environmental variables encompass caller subnets, client application types, and access timestamps21. In a Node.js data gateway, ABAC policies execute as pre-validation middleware, inspecting authenticated claims before requests reach analytical query builders or downstream storage adapters.

### **Dynamic PII Redaction and Field-Level Data Masking**

Personally Identifiable Information (PII)—including government identification numbers, credit card details, addresses, and corporate email contacts—must be protected to comply with global privacy frameworks21. The middle office applies dynamic data masking based on the caller's authorization context:

* Full redaction replaces all characters with fixed masks (e.g., masking account numbers to \*\*\*\*-\*\*\*\*-1234).  
* Cryptographic pseudonymization uses HMAC-SHA-256 with an HSM-managed rotating key to allow cross-system analytical correlation without exposing underlying raw identities.  
* Format-preserving encryption encrypts sensitive values while preserving their original character length and data shapes, allowing legacy downstream systems to process records without validation failures.

At the application logging layer, structured loggers such as pino must be configured with explicit redaction paths to prevent sensitive fields from leaking into centralized log aggregation systems33:

TypeScript  
import pino from 'pino';

export const secureLogger \= pino({  
  redact: {  
    paths: \[  
      'req.headers.authorization',  
      'req.headers.cookie',  
      '\*.socialSecurityNumber',  
      '\*.creditCardNumber',  
      '\*.emailAddress'  
    \],  
    censor: '\[REDACTED\_SENSITIVE\_DATA\]',  
  },  
});

### **Distributed Rate Limiting via Sliding Window Algorithms**

To protect analytical databases and internal storage tiers from uncontrolled query spikes, the middle office enforces distributed rate limiting using rate-limiter-flexible backed by Redis or Valkey clusters16.

TypeScript  
import { RateLimiterRedis } from 'rate-limiter-flexible';  
import Redis from 'ioredis';

const redisRateLimitCluster \= new Redis({  
  enableAutoPipelining: true,  
  maxRetriesPerRequest: 2,  
});

export const distributedRateLimiter \= new RateLimiterRedis({  
  storeClient: redisRateLimitCluster,  
  keyPrefix: 'middle\_office\_throttle',  
  points: 1000,          // Maximum allowed consumption points  
  duration: 60,          // Rolling window period in seconds  
  blockDuration: 120,    // Cooldown lockout duration for policy violations  
  execEvenly: true,      // Smooths request spikes across the active window  
});

Unlike fixed-window counters that allow traffic bursts across window boundaries, sliding window algorithms evaluate rolling request rates across dynamic timestamps, providing consistent traffic governance across distributed application instances37.

## **Distributed Observability, Fault Tolerance, and Resilience**

Operating as an enterprise API aggregation layer requires unified distributed tracing, low-overhead structured logging, and robust failure containment13.

### **Distributed Tracing via OpenTelemetry and AsyncLocalStorage**

Because Node.js multiplexes asynchronous operations on a single execution thread, tracing distributed operations across async contexts cannot rely on thread-local storage13. OpenTelemetry for Node.js uses AsyncLocalStorage from the native node:async\_hooks module to preserve trace contexts across asynchronous callbacks and promise chains13.  
Context propagates across service boundaries using standardized W3C Trace Context headers, primarily traceparent43. The traceparent header encapsulates four specific positional fields separated by hyphens: a two-character hexadecimal version, a 32-character hexadecimal trace identifier, a 16-character parent span identifier, and an eight-character flag field indicating trace sampling options43.  
Incoming HTTP, gRPC, and Kafka messages have their trace contexts extracted by the OpenTelemetry SDK, registered within the active AsyncLocalStorage store, and propagated to downstream analytical and database operations40.

| Trace Field | Specification Format | Functional Role in Tracing Infrastructure |
| :---- | :---- | :---- |
| **Protocol Version** | 2 Hexadecimal digits (e.g., 00\)43 | Specifies W3C context protocol version43 |
| **Trace Identifier** | 32 Hexadecimal digits (16 bytes)43 | Unique global identifier for an end-to-end distributed transaction across all microservices43 |
| **Parent Span Identifier** | 16 Hexadecimal digits (8 bytes)43 | Uniquely identifies the calling operation within the transaction hierarchy43 |
| **Trace Flags** | 8-bit bitmap (2 Hexadecimal digits)43 | Configures sampling decisions, such as 01 to record and forward trace data43 |

### **High-Performance Structured Logging Correlated with Spans**

Synchronous log serialization introduces event loop latency when processing high message volumes13. The production standard for high-throughput Node.js logging is pino, which serializes JSON strings asynchronously directly to the stdout stream13.  
To correlate application logs with distributed traces, a custom pino mixin extracts the current traceId and spanId from the active OpenTelemetry context on every log entry13:

TypeScript  
import pino from 'pino';  
import { trace } from '@opentelemetry/api';

export const observabilityLogger \= pino({  
  mixin() {  
    const activeSpan \= trace.getActiveSpan();  
    if (\!activeSpan) return {};  
      
    const context \= activeSpan.spanContext();  
    return {  
      trace\_id: context.traceId,  
      span\_id: context.spanId,  
      trace\_sampled: context.traceFlags \=== 1,  
    };  
  },  
});

This correlation allows operators to navigate directly from metric alerts to specific distributed traces and inspect the corresponding log entries emitted during an incident43.

### **Fault Tolerance via Circuit Breakers and Graceful Degradation**

To prevent cascading service failures when analytical backends slow down or become unavailable, external queries must be wrapped in circuit breakers using libraries like opossum15:

TypeScript  
import CircuitBreaker from 'opossum';

const breakerConfig: CircuitBreaker.Options \= {  
  timeout: 4000,                 // Terminate execution if upstream query exceeds 4 seconds  
  errorThresholdPercentage: 50,  // Trip the breaker if 50% of recent executions fail  
  resetTimeout: 20000,           // Wait 20 seconds before testing service recovery  
  rollingCountTimeout: 10000,    // Statistical rolling window for metrics tracking  
};

export const warehouseBreaker \= new CircuitBreaker(executeHeavyAggregation, breakerConfig);

// Graceful degradation fallback  
warehouseBreaker.fallback(() \=\> retrieveStaleAggregatedProjection());

warehouseBreaker.on('open', () \=\> observabilityLogger.warn('Warehouse circuit breaker tripped OPEN'));  
warehouseBreaker.on('halfOpen', () \=\> observabilityLogger.info('Warehouse breaker entered HALF-OPEN state'));  
warehouseBreaker.on('close', () \=\> observabilityLogger.info('Warehouse breaker reset to CLOSED state'));

The circuit breaker operates across three functional states:

* In the closed state, application health is normal. Requests pass directly to the analytical database50.  
* In the open state, triggered when execution failures cross the configured threshold, the breaker immediately short-circuits requests and runs fallback logic (such as returning cached stale data), protecting the analytical database from traffic overload46.  
* In the half-open state, entered after the cooldown timeout expires, the breaker routes a small test fraction of traffic to the database to check availability49. If these requests succeed, the breaker returns to the closed state; if failures persist, it returns to the open state for another cooldown window49.

## **Architectural Directives and Engineering Reference**

Deploying Node.js within an enterprise data middle office requires matching the runtime's asynchronous capabilities to appropriate data orchestration workloads6. The technical specifications below outline configuration baselines and design choices for production environments:

| Engineering Dimension | Implementation Pattern | Production Configuration / Standard |
| :---- | :---- | :---- |
| **Structural Architecture** | Clean Hexagonal Architecture and CQRS Models15 | Isolate core domain calculation models from underlying storage drivers15 |
| **Streaming Ingestion** | Native bindings via librdkafka (node-rdkafka)8 | Set native memory buffers via queue.buffering.max.messages; enable idempotent: true \[cite: 8, 18\] |
| **Data Pipelines** | Native stream orchestration7 | Use node:stream/promises (pipeline) to enforce backpressure and descriptor cleanup7 |
| **Cache Stampede Prevention** | Probabilistic Early Expiration (XFetch)23 | Formula: ![][image13] with aggressiveness ![][image14] \[cite: 24\] |
| **Cache Invalidation** | Granular multi-entity secondary tag indexes24 | Manage invalidations via Redis Sets; use asynchronous non-blocking UNLINK \[cite: 24\] |
| **Analytical Sockets** | Connection pooling and persistent HTTP agents11 | ClickHouse: HTTP Keep-Alive (maxSockets: 32\)14; PG: Small pools (10–20 connections) with PgBouncer |
| **CPU Workload Offloading** | Worker thread pooling via piscina \[cite: 27, 28\] | Sized to ![][image15]; use ArrayBuffer in transferList for zero-copy memory transfers28 |
| **Libuv Tuning** | Environment thread pool configuration7 | Set UV\_THREADPOOL\_SIZE=647; use dns.resolve\* for asynchronous non-blocking DNS resolution |
| **Access Governance** | Attribute-Based Access Control (ABAC)2 | Dynamically evaluate user, resource, and environment attributes prior to query construction |
| **Data Privacy** | Field-level masking and dynamic redaction21 | Implement pseudonymization algorithms; configure logging redaction using pino.redact \[cite: 34\] |
| **Observability** | Context-correlated distributed tracing13 | OpenTelemetry SDK using AsyncLocalStorage13; structured JSON logging via Pino13 |
| **Resilience Design** | State-managed circuit breakers via opossum \[cite: 47, 52\] | Fail-fast timeouts, half-open canary tests, and graceful degradation fallbacks46 |

Applying these engineering practices enables a Node.js data middle office to serve as a scalable, low-latency Data-as-a-Service integration tier while insulating core enterprise analytical storage systems from high concurrent application demand1.

#### **Works cited**

> 1. What is a data middle platform?-Transwarp, [https://www.transwarp.cn/en/bd/76](https://www.transwarp.cn/en/bd/76)  
> 2. Ln{Fusion} 數據中台 \- LnData 麟數據科技, [https://www.lndata.com/en/data-middle-platform](https://www.lndata.com/en/data-middle-platform)  
> 3. The Application and Technical Standards of Data Middle Platform, [https://www.computer.org/csdl/proceedings-article/iucc/2024/119900a585/281qv9vZtss](https://www.computer.org/csdl/proceedings-article/iucc/2024/119900a585/281qv9vZtss)  
> 4. Research on the dual middle platform architecture of enterprise, [https://ojs.as-pub.com/index.php/ESTA/article/download/8476/4310/](https://ojs.as-pub.com/index.php/ESTA/article/download/8476/4310/)  
> 5. The Best Practice of Cloud-Native Full-Stack Data Warehouses in, [https://www.alibabacloud.com/blog/598382](https://www.alibabacloud.com/blog/598382)  
> 6. GBASE Deployment at a Major State-Owned Bank \- 南大通用, [https://www.gbase.cn/en/news/3433](https://www.gbase.cn/en/news/3433)  
> 7. Node.js interview questions and answers \- GoodSpace AI, [https://goodspace.ai/interview-questions/nodejs](https://goodspace.ai/interview-questions/nodejs)  
> 8. kafkajs vs node-rdkafka | Choosing a Kafka Client for Node.js, [https://npm-compare.com/kafkajs,node-rdkafka](https://npm-compare.com/kafkajs,node-rdkafka)  
> 9. What are the features of Unified Service-Data Resource Platform, [https://help.aliyun.com/en/drp/user-guide/unified-services/](https://help.aliyun.com/en/drp/user-guide/unified-services/)  
> 10. The Ultimate Node.js Backend Mastery Guide: Zero to Production Hero, [https://dev.to/yakhilesh/the-ultimate-nodejs-backend-mastery-guide-zero-to-production-hero-174a](https://dev.to/yakhilesh/the-ultimate-nodejs-backend-mastery-guide-zero-to-production-hero-174a)  
> 11. clickhouse integration airflow — 3 Ways to Connect in 2026 \- Tinybird, [https://www.tinybird.co/blog/clickhouse-integration-airflow](https://www.tinybird.co/blog/clickhouse-integration-airflow)  
> 12. JSONL for Data Streaming & Pipelines, [https://jsonl.rest/use-cases/data-streaming/](https://jsonl.rest/use-cases/data-streaming/)  
> 13. Best Node.js Logging Libraries 2026 — PkgPulse Guides, [https://www.pkgpulse.com/guides/best-nodejs-logging-libraries-2026](https://www.pkgpulse.com/guides/best-nodejs-logging-libraries-2026)  
> 14. ClickHouse C\# client, [https://clickhouse.com/docs/integrations/language-clients/csharp/overview](https://clickhouse.com/docs/integrations/language-clients/csharp/overview)  
> 15. Advanced Microservices Architecture Design Patterns with Node.js, [https://www.zartis.com/advanced-microservices-architecture-design-patterns-with-node-js/](https://www.zartis.com/advanced-microservices-architecture-design-patterns-with-node-js/)  
> 16. Valkey Glide · animir/node-rate-limiter-flexible Wiki \- GitHub, [https://github.com/animir/node-rate-limiter-flexible/wiki/Valkey-Glide](https://github.com/animir/node-rate-limiter-flexible/wiki/Valkey-Glide)  
> 17. Data Middle Platform\_Building a Data Foundation to ... \- 数新智能, [https://www.datacyber.com/en/solution/DataCenter](https://www.datacyber.com/en/solution/DataCenter)  
> 18. Kafka Deep Dive for System Design Interviews, [https://www.hellointerview.com/learn/system-design/deep-dives/kafka](https://www.hellointerview.com/learn/system-design/deep-dives/kafka)  
> 19. Architecting High-Throughput CDC Pipelines: MySQL, Kafka, [https://www.staksoft.com/insights/backend-development/architecting-high-throughput-cdc-pipelines-mysql-kafka-typescript](https://www.staksoft.com/insights/backend-development/architecting-high-throughput-cdc-pipelines-mysql-kafka-typescript)  
> 20. Kafka topic partitions are paused for downstream consumer due to, [https://stackoverflow.com/questions/78110804/kafka-topic-partitions-are-paused-for-downstream-consumer-due-to-backpressure-o](https://stackoverflow.com/questions/78110804/kafka-topic-partitions-are-paused-for-downstream-consumer-due-to-backpressure-o)  
> 21. How to Design a Notification System: A Complete Guide, [https://dev.to/madhur\_banger/how-to-design-a-notification-system-a-complete-guide-4509](https://dev.to/madhur_banger/how-to-design-a-notification-system-a-complete-guide-4509)  
> 22. A Complete Beginner Guide for Cache Penetration, Stampede, [https://philosophyotaku.medium.com/a-complete-beginner-guide-for-cache-penetration-stampede-avalanche-ecadd7f16009](https://philosophyotaku.medium.com/a-complete-beginner-guide-for-cache-penetration-stampede-avalanche-ecadd7f16009)  
> 23. Preventing Cache Stampede: Locking & Probabilistic Recomputation, [https://paths.grasp.study/modules/d58d9c88-5bb8-47dc-9400-6d9db4929e70/lessons/0c6154dd-a979-47d7-ae69-a6a150c8196a](https://paths.grasp.study/modules/d58d9c88-5bb8-47dc-9400-6d9db4929e70/lessons/0c6154dd-a979-47d7-ae69-a6a150c8196a)  
> 24. Advanced Redis Caching Strategies for APIs \- Mohd Baquir Qureshi, [https://baquir.is-a.dev/blogs/advanced-redis-caching-strategies-for-apis](https://baquir.is-a.dev/blogs/advanced-redis-caching-strategies-for-apis)  
> 25. Probabilistic Early Expiration in Go \- Dizzy zone, [https://dizzy.zone/2024/09/23/Probabilistic-Early-Expiration-in-Go/](https://dizzy.zone/2024/09/23/Probabilistic-Early-Expiration-in-Go/)  
> 26. awesome-stars/README.md at master \- GitHub, [https://github.com/mooyoul/awesome-stars/blob/master/README.md](https://github.com/mooyoul/awesome-stars/blob/master/README.md)  
> 27. piscinajs/piscina: A fast, efficient Node.js Worker Thread Pool, [https://github.com/piscinajs/piscina](https://github.com/piscinajs/piscina)  
> 28. Offloading CPU Work with Piscina: A Practical Guide to Node.js, [https://www.querystack.tech/post/offloading-cpu-work-with-piscina-a-practical-guide-to-nodejs-worker-thread-pools-0fb554](https://www.querystack.tech/post/offloading-cpu-work-with-piscina-a-practical-guide-to-nodejs-worker-thread-pools-0fb554)  
> 29. Worker Threads : Multitasking in NodeJS | by Manik Mudholkar, [https://medium.com/@manikmudholkar831995/worker-threads-multitasking-in-nodejs-6028cdf35e9d](https://medium.com/@manikmudholkar831995/worker-threads-multitasking-in-nodejs-6028cdf35e9d)  
> 30. Workers in Node.js: How to write a sudoku-solving server | Nearform, [https://nearform.com/insights/workers-in-node-js-how-to-write-a-sudoku-solving-server/](https://nearform.com/insights/workers-in-node-js-how-to-write-a-sudoku-solving-server/)  
> 31. workerpool vs piscina vs threads | Worker Thread Management for, [https://npm-compare.com/piscina,threads,workerpool](https://npm-compare.com/piscina,threads,workerpool)  
> 32. npm rank \- GitHub Gist, [https://gist.github.com/anvaka/8e8fa57c7ee1350e3491/08a54be7bd3120bf6353c68d64eb23e91b5542ee](https://gist.github.com/anvaka/8e8fa57c7ee1350e3491/08a54be7bd3120bf6353c68d64eb23e91b5542ee)  
> 33. Definitive Guide to Production Grade Observability in the Nodejs, [https://www.reddit.com/r/node/comments/1o3z1bw/definitive\_guide\_to\_production\_grade/](https://www.reddit.com/r/node/comments/1o3z1bw/definitive_guide_to_production_grade/)  
> 34. Pino Logger Tutorial: A Complete Guide for Node.js \- Dash0, [https://www.dash0.com/guides/logging-in-node-js-with-pino](https://www.dash0.com/guides/logging-in-node-js-with-pino)  
> 35. GitHub \- animir/node-rate-limiter-flexible, [https://github.com/animir/node-rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)  
> 36. Top 50 Node.js Interview Questions in 2026 (With Answers and Code), [https://gitgood.dev/blog/top-50-nodejs-interview-questions-2026](https://gitgood.dev/blog/top-50-nodejs-interview-questions-2026)  
> 37. Understanding and implementing rate limiting in Node.js, [https://blog.logrocket.com/rate-limiting-node-js/](https://blog.logrocket.com/rate-limiting-node-js/)  
> 38. I Built a Distributed Rate Limiter From Scratch in Node.js \- Medium, [https://levelup.gitconnected.com/i-built-a-distributed-rate-limiter-from-scratch-in-node-js-heres-what-production-taught-me-e2a383976d4f](https://levelup.gitconnected.com/i-built-a-distributed-rate-limiter-from-scratch-in-node-js-heres-what-production-taught-me-e2a383976d4f)  
> 39. Designing Resilient APIs: Retry Strategies, Circuit Breakers, and, [https://abisoye.dev/blog/designing-resilient-apis/](https://abisoye.dev/blog/designing-resilient-apis/)  
> 40. Structured Logging & Distributed Tracing with Pino and, [https://saikat.com.bd/blog/structured-logging-distributed-tracing](https://saikat.com.bd/blog/structured-logging-distributed-tracing)  
> 41. Node.js Logging in 2026: Pino vs Winston Production Guide, [https://www.hirenodejs.com/blog/nodejs-logging-pino-vs-winston-2026](https://www.hirenodejs.com/blog/nodejs-logging-pino-vs-winston-2026)  
> 42. 日志与监控：可观测性体系建设 \- CSDN博客, [https://blog.csdn.net/lxcxjxhx/article/details/161612218](https://blog.csdn.net/lxcxjxhx/article/details/161612218)  
> 43. Logs Traces Metrics Correlation: A Practical Guide for SREs, [https://openobserve.ai/blog/logs-traces-metrics-correlation/](https://openobserve.ai/blog/logs-traces-metrics-correlation/)  
> 44. autotel \- NPM, [https://npmjs.com/package/autotel](https://npmjs.com/package/autotel)  
> 45. I tried setting up correlation between traces and logs in CloudWatch, [https://dev.classmethod.jp/en/articles/cloudwatch-application-signals-trace-log-correlation/](https://dev.classmethod.jp/en/articles/cloudwatch-application-signals-trace-log-correlation/)  
> 46. nodeshift/opossum: Node.js circuit breaker \- fails fast ⚡️ \- GitHub, [https://github.com/nodeshift/opossum](https://github.com/nodeshift/opossum)  
> 47. Circuit Breakers: Fail Gracefully \- DEV Community, [https://dev.to/wittedtech-by-harshit/circuit-breakers-fail-gracefully-106b](https://dev.to/wittedtech-by-harshit/circuit-breakers-fail-gracefully-106b)  
> 48. Circuit Breaker Pattern: What It Is, How It Works, and When to Use It, [https://buildbeyondbackend.com/blog/circuit-breaker-pattern/](https://buildbeyondbackend.com/blog/circuit-breaker-pattern/)  
> 49. LLM API circuit breaker patterns: Python, Node, Go | Ciralgo, [https://ciralgo.com/timeouts-and-circuit-breakers/](https://ciralgo.com/timeouts-and-circuit-breakers/)  
> 50. Reliable Redis Connections in Node.js: Lazy Loading, Retry Logic, [https://medium.com/@backendwithali/reliable-redis-connections-in-node-js-lazy-loading-retry-logic-circuit-breakers-5d8597bbc62c](https://medium.com/@backendwithali/reliable-redis-connections-in-node-js-lazy-loading-retry-logic-circuit-breakers-5d8597bbc62c)  
> 51. Fail fast with Opossum circuit breaker in Node.js \- Red Hat Developer, [https://developers.redhat.com/blog/2021/04/15/fail-fast-with-opossum-circuit-breaker-in-node-js](https://developers.redhat.com/blog/2021/04/15/fail-fast-with-opossum-circuit-breaker-in-node-js)  
> 52. Resilience Patterns in TypeScript: Circuit Breaker \- Buti, [https://nobuti.com/thoughts/resilience-patterns-circuit-breaker](https://nobuti.com/thoughts/resilience-patterns-circuit-breaker)

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAZCAYAAAC2JufVAAAB7UlEQVR4Xu2UMUiVURTHT2iQUJQUVlQIbkVDUSBBgYOKUwQRKIlr0mYQQS1vcSkCcYqgKSIQNxUClweCRc3RUkOguBUEDRaR/987977v8PE9cHBw+H7wg3fvO/fdc88995nV1NTU7H8Oy7NyVJ6XB+VVeUueC3GR4/KOfCyvyK7w3TF5OnhEngxj1nbLvjB3qLUywOab8r98KV/Lu/KJ/C1vF6F2QE7JT3JI9stnclWeSjH3rfi9r+bJL8t/8o98Ks/I9RRD7GBrZQkqtSG/mJ8KOOGaXLHiJCPyp7yRxkBlF+SS7ElzF83jGmnMYd7IpvnNAHsumleuEkr4Xc6HORY3k3wmMRL8LE+0o5xH8q+8nsY59oM8ap7sO/PKc91w07yqHclJ8eOZclJU8FsYR1jHVTwIc/fktrxmXjlag5sglso9T/Md2U1SVIcq0U+97SgnJ0UvZgbklpyVM3LM/Cao3iX5wioaPLKbpHgxb817j36IsDE9FE+e4/ld+o1DDctf5glNFKHV5EbniWfKScFl+UNOpjHQqB/lnPm1RMbNK0jSQIWpNBWkkh2ZNn+qLEY2YFM2z3N85pRwQb43f+avzK/0ofkrLMPT5/v8AKBhXkEquefwJ0nzVyWToXJUJ/650kflh1JTU1PTiR1FnWQTfHYMPAAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAaCAYAAACO5M0mAAAA5klEQVR4Xu3RMQtBURQH8CMpSpSBDBYpsSqlTCYGZovdJ6AYZZfBbvABZDEYjCYx+AAWJovNgv955z3OvVaDwb9+5d3zf8999xH9VPIwhg4UIWiOJVmYkBTm8ICu0XBTh6H7209yQ+Q9ficHW8jYAzshWMIKotbsIy24wwB81sxJDGawgB3coGQ0kCRsSI6En9IkeeOeLvFgRFL09sUvdYGpV+Kk4UzmefE/HMl6Yo1kP2W1xjefoKHWnOIVCmqNCwdIqDVKuYtV95rPkj9f+9VQqcCeZPNr6ENAF3T428YhbA/++V6edoEhw7l7aiQAAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAZCAYAAADqrKTxAAABEElEQVR4Xu3SsUtCURTH8RMamBoKReAQQrY5OJkU0dDW0KJzLuKfUFG0NQeBi4MNLQn9Azo4+C/Y2h/g0Bbt9T3v1vO+8zJcA3/wWc693nvfOYr826ziCKfYMGu/popntNDEBPXIDpMynpDzapcYIePVwqyhi11Tv8YYWVMPso8LU9ODhrjHilkLcoNDpFBAHg1x31T09oXR93ZwgCk+v31gz9sXyQ7uxD1Bb9Cb0rhFH8nZ1llO0LZFcXPSm/XQWK7EzcdG5/OOil3QU3SY66a+jVdxT4x1Tp/2hppX01b3MJDooMNoq8/EDfARD3jBubgfx/LT6k0ksCXuDxp7jh+/1QtnXqv/zDFKtrjMAvkCasYizmLdJLUAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAaCAYAAAD1wA/qAAACRUlEQVR4Xu2WTUgVURiG3yjBfkyhCCIj+wGRoBahokSLcNPCjbmL3ES0DIISo1Yi4UKIVBRTwY2RtowUDBJp0bbAjW7atYg2UasgfV+/O3bm3Blnxi4XL8wDD/fe78zP+fnO+S6Qk1N2qug12kmPeW0VQzOdo3doD/1Mu0JXlI+j9D6doE/pyXBzPBfpLK11Yr30PT3sxMrBGdgk3qXV9AZdoy3uRVEcpOP0ghd/TJfpES/uohfJUnGATtI3he8BA3QR1tdY2ugjL6YbdONzus9rczlHl+ggSrOn9LxvsGxwUYr/ple8eIgn9CpsZpWLdfQmbHm1zElooJfoAp2iZ8PNmeigf1E8EB0+G/SWF99G+T9M22EzoYvlL6TIyQga6XxBfc9K0OG4gfjxbbSUQ7BZ1UpoRQ7RfvoK4TzNglZFq7NCW7Fzerqoo1EdThyITgSdDj66USukgf4PmphRpB/QA0R3OHEgfbD64aPN9ZNe9ht2gQ6BMfqRNoSbiojrcFx8i2B/HPcbyAu6iui2tGg1RugHpFsNoUPnD4o7HAwkskArbVTJa7z4aboO2ydpXu6j/fGSvoWdZlmecYp+hU2kyz36gzZ58S20P77DZitA9UMFaQHhKp9EqY5gPUcT+An/3q//f5rw2MNH9eM2rHrPwDrwhT5EQgV10Is1EUofpVHq/0Q7oAG8o69hkz0N21/17kUB7v7YT0/ANmWWNBB60TOUpqq7qE+q4t2FT/2OxK0fFU1c/ag4rtPzfjAnJydnT7IJSW1e4lgUXq0AAAAASUVORK5CYII=>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAaCAYAAACD+r1hAAAA1klEQVR4Xu3RvwqBURjH8Ucog5IMkskkk0EGZbW4AsUus0HJYDEqF0BmJVcgidE1GJSSwWIw+z7O8TpvMjP41afe5zmn8+8V+eeXEkQBZfvtJoaw29BihC42GDpjWZxRc3pSQU/MSlvM5LVLHVfkbf1IyzZKuIl/tTF2iDs9L30ckbG1TtLJUwRsz0sUa8wRsr0cLmja2pcUDug4PT2/HrGIKhrOmCSxF/NSGn2ApZhF0mKOqzt60TO2xdxhgoWYxzhhhYGd8xa9i+72/FERJOTD5H++lztX5x6Sgu2l6AAAAABJRU5ErkJggg==>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAaCAYAAABByvnlAAAEaUlEQVR4Xu2YW4hVVRjHP9FE0ZRQDC2oEUkEQ6MSFPNBKtIoRMVrz4UiPRRdiJBD4YtYSApieCFERJDIhyIoNPTBUBAVM1+ElFB6kChK0LT6/2btdWbvtffas8/M4QzH2T/4M3PW2tfvtr61zWpqaoY3E6UHwsEOMF4aEw4Od16WPrGhcchj0pHkb9czUlolXZb+lT7MTjcZIW2QzkoPB3NPScelKcH4WGmd9Lm0VZqZnW6Zx6U14WDCc9JX5rK0ayHND0i7pc3mHPJZ5og+HpF+kXaac44Hox+1vKEwzHfSx+ZKylzpkrQifVAFZkkbpWPSPemL7HQTnolney+c6FZeNecQ/haBwTHI88H4S9J5y2cNhjkjPZQaWy/9bPljy8Ahy6QF0q8WdwjMN3f9nnCi2/DRFTMWWfCt5Q3Mefstn1Ucw7Gh8Z6V/rK408uYKl21/DXT+Pvi+MpQs5+WFib/pxmqLoWIIvoawbiHLCB7tgTjk6WfpOXBOFF90/LG473/tvx1qlDFIbBHOmjZshoFY2+XPpBOmOtKPCx4v1m+FneCTdLv0uxwwlyQ8Kw4JCxXGPha8jccx/Ch8WLjVajqEErlSenBcKKIF8x1MbwkJx22viwhzf6U5iS/y3jC+ox0UVps8Yigg+JlYvAsP0qHpFHBHLwt/WduQWdhT/OKdEOaXjDOOaHxOuEQ7s1xZe/chLYRg7P43LJsNpBqYY0ugtaS7oW+n2Np905J71q+BOKkN82VlhiUozvJ35B55jIH49Lnhw6LvfwSG1qHFAVJKQ1zNbsn+e0XIxbIWKR7VlveeCy6u8ydPyE1TmfykcWviYHJjKJA8G0ruiu9lZ3uJeaQmOFj41VoxSFVK00v9OQ/WDbi/CL4RvK7DAxT1AmRHWQD6xClkL0Bhi7bvRJFRFP4kqx1bObQ+9I/5pqQkJhDYtf1DmENbZVWHFL0TFH8hdMbGNYPShht4VLptdRcCHU8LB1pJpl7qBelccFcCIt0uBnEGdukb8xlDR0L2fxo6hgPTrpu+Wj0Qfe1Zb8xcT/KY7o54FieOZbFnqoOwZZXrDhoC+FATvBRQmn43tzNMHbDXMZ0Al/rT5szCuWOsrfPnDN9KaW1nSaNdqc14TlxSNh9AUFFB9aT/Mbg7NppIPznDe7JpvK2uXW1DO+Q/lpa7BoGQilcjM6FqNsrfWlusSfF+TxAj152w3ZC1LMZxCnoD2mt9TUH3gjM8bzPJOMenwlFpZZMY13jGxc7bZyBY/mE4uF8MpEsfSc1ngZnc2++EvjnZHN5QXoydRxQOVgK0tWnMjwM2eI3gni0Suq2G4yOwTB2uCnlBWkiiPZY+WtYcQcGvAst+kppkeWv78Ho7IUGC9lIgPWXbfc1M6RzVryprAotezuMSODQ0MQcP2ygBH9qA8tuGgL2YLTug4HqQvlj7zTsISJ3WOuf1oGOsKiDawUCoWEuMAYSFPclrDEs3C3tkNsELf7rVjujpqampqZD/A83ttzSJLTu0wAAAABJRU5ErkJggg==>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAZCAYAAABkdu2NAAAC20lEQVR4Xu2XS6iNURTHl1BEUcQVciKvkpQkoQx0PbozijIxugwwUJJXXcmQlMdAhIGQDJTyyOAoycijFAPySBRhgkIe/19r784+33nc43MMXN+/fp2z17f3+vZaaz/OMStUqND/qk5xSczMPugrOiV+iq3ZB31FU8Qu0ZF9UCinBosusVssDW00UIwWYwKjxAAxImMbEr4vEnNFfzFdrDSvVj+raKgYZ74P6YMGWfV4/C8T463+HPCf2vmkXVe85J7YJiaJI+K+mCBK4qL4aL5nbomx4nxoYz9rPrEHwfZClMUm0R3a9B9mLhL5KPSNe3C2VcbfFifEVfHWPBFnxNfw/LIYbp64p8F2x3zuNSKbZXMHVAaRjYdiX2ijkngijppnaq04ZpVKo+jrrnmWoxaKL+KAVSpJBV9a9SETx78Rk8VGccO8L9pg7mdeaKM15oVJV0iVFosfYl1io/Np85fx0qgV4pPYbp6QWJGoOEFIx5GEK+K1mBhsLKvnVj9ASMdHMRYfh8znSEEOixlpp6x4ASW+Zl6dlC3meyMKp1SBhCxP7FHNJsi18E0sCO08ARIQiX1mvk0IjADjyqsrKkeAlLo3EeBO8ypet9YriAjws5gT2s0CpG8jcQB+F6vFjtBuKrLwQezN2Nln8606OyzRg8HOmD1WezqWA2mAJIKDg33N/kZ5A4y+OFQuiJHVj2sVl90rMS2xczDEzQtLzA+PdMOTSYKOihPkMCol9lXmfdcntmYBsjq4dhqJd7PqejL2hqJa7Ld35sf5OXHcPFud5pPDIWw2fzmTiLb35odVnOBj80OFSvB7E78EGatNoPHaAd7ZZe4n9bk/9M+KVcc1w+dvKV6c3DF5lF2i+MFfwws4pwis18PlbygbYLvESmJFdYd2S4dLu8V1MtV8nwLf0yvmT8QvLZY5Pyw4J05aexPYkmZZ7T2KrR1i73Kd3TQPrvgHUqjQP6JfqManAivM+GkAAAAASUVORK5CYII=>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAaCAYAAAAHfFpPAAACsklEQVR4Xu2XT6hNURTGP6EISURCHpGUQqIUMaBESkwUmSIjDJQMbsmQ/JlIJEpSUkYm4mFAmTAwNCARZSIMDPB9rbN7+6y377vn3PvO6d46v/r17t373vvOXnuttc8BGhr6mZl0sh/swEQ6i07wE3WgfzqbTvcTXbCLnkf5AOgaTtLj2evaOEb/ZZ5yc2VZS5/SuX6iIArabbrPT1TNcvoNvQVgKn1I9/uJkqyiL+kiP1El8+kH9BaAHfQtnecnSjKJ3qUtN14pvQZANXuTXvYTXXKAvoY1xVrwAVAtaic30K3Z+yG6h66DdeyYOfQd3evGhT6r72zKXse0Oy1Ww65nvZ+oCh+AIfoM1hhf0av0BD1E39NryF+4Fvgx+xujz1ykp+lz2OkQWEG/It0zwvWkAloJPgBCaX2H/oXVd0CL+U5XRmO76Re6NBoT2+kZ2E6/oPcwkgVK8x+w3fboOB5GgZIMqaoFdFJHk0/BQCoA4hYstZXiAX3mF/K7rQDo+/qdmKOwBW6kv5Hf7etoX+chAOfc+CjWwNKxiJdgqZ1irAAMI3+DVCYAgRb9RJdk77VoLV6NU5nmCQFQkGqhygCExdyHHXFC5aMyOpy99xQugfGi1wCow39Gup5Tv636V0moy++kB6M5ETJEjbcWUhep1FQTVPOaEY2nAqAdVQC2RWMB9SidHGqeQg3xMez/LYCVR9xQxULYd1K/N+4coT8x8jyg29AtsAsIY5rXLmkujP2hF2CElE2ltAKphxz1gBv0Aaw56tR4Amt0vg8oo9R8FaCBoYV8nXsUJGVDuH+YAnsC9YsXLdjtcLvf6kuW0Tewh5leUFCUGZv9xCCgVFdZpHa1KCo13XmmbpH7Hl30FXT/PK8sekQX+4lBYho9i9G3xZ3QSaOGqBOgoaGhYUz+Ax5Ci6GU23kEAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,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>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAaCAYAAAAjZdWPAAAC1klEQVR4Xu2WTahNURTHl1CEJCJfhd5EDMhHlK8kMSDJgJSBCRMTH0+MLjIwIERKSiYMmKJQXpGEkfJRSCRCnpnBe4X//6293ttnnX3Ove88V9T9169z71q7s9fee611tkhL/69GgmHe2ICGgtHeWEVjwWqwCcwEg7PunOaAi1JtcgZ9Emz0jkY0CCwDj8BNsDVwC7wCC/qGZjQF3AWzvKMf4ibdAAu9o0xc7THwVvLB0XcefAdznY8L5S7VnL2K1ohuENOsrhjUOdApxStlinwDZ0QDNc0GL8NzoGJqPQCbvSOlneBneBZpDHgMnoFxkX0/uC7VCjClo+AaGOIdsdrAR/ACTHC+WBb0OzAx2BgoAz5ogyKxcJeAeeE3T2ca2CDlhb1WdA7WSaFq4JfoCss0A3ySbNB88v86GxRpFzgMnovOcRYcAdvAa3Bcsmlm4iI/SL6uesWE7xBNjVVZV070c9w9MCrYOMFn0R2NxRM7BcaLvp8FHNfKpWBPFVzZRvTIBrDAeGRlOi16IrXIxqDfh2es+WCL6BFz19iVbFctpe6AEcEWy2Jiq03KBsRHntJU0T79VbK9uChoE0+nKzxN00UXUpSOFtNu7zCxC7AblAXNHTogust7nK9e0CxQ1gHrwcR29gMsjmyx6qYH28oV0C35vDQxF5mT/Liwn8diMOw8rHivVBrYfA9Fe/J2sDz4TGXv7BW/cAyK9wYf1ErwBZwAw52PspPa4R3Sl89xGtgu8gRYpBckf1dh13gj9WusZyDbEO8cdt/g3eOpaOCp1kTRzsWySL14/NyMFZGNm3IZPAG3RQvWi3N3SLqz5MRmz9XxVsd8miTFwcZijnKx/PjE4vto8+/gf16OUl9QS5+as/9xMYD7opedgapNNN/5bLrWg6uSzvtGxRM4BNrD76aLk+wLVJ1wqehFyRdmU8Ui2wsWeUcDmizaZf5qwC219C/oN9UmfuIXzqEgAAAAAElFTkSuQmCC>

[image12]: <data:image/png;base64,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>

[image13]: <data:image/png;base64,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>

[image14]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAXCAYAAAC1Szf+AAABTElEQVR4Xu2WsS4FURBAR5DwEIJIFCJBp1AhRBRUitegpRGfgBAqtURoFBQaEj9AofALJCqdRqETPWfeeHF38OJVm3uzJznNzN1kd+9MZkQKCpKmGWexjD0ulxTjeIVruIr3uJg5kQijeIGdQWwLb7EtiEVPK57giIvv4B22u3jUTOGmi+kPuMFDbHC5qNnFGWzBfuzCJbGeHQzORY/24zFO4wt+fPmOE8G5JBjCA7FS1RvVmy3hPl5i0/fRH3SLlfpzHe5VnsyJBVz3QbE5qzetPyMZtsXmq0fn6xuO+USsVPu11yfgCB/l91wVLX3dsrT0/6u2Si5oierG1OHiA/gk1re1xo6ulvO4XIeTlSdzQPv1VbIvoPP1FK8lu01Fj87XFbEt6RzP8AE3xD46GcJ+bcQ+sf6rVbbREs7X5PlrvibJHA77YEFBPHwCz241Sol18x8AAAAASUVORK5CYII=>

[image15]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHIAAAAWCAYAAAAcuMgxAAAEXUlEQVR4Xu2ZXagWVRSGl2SSmJmJf5hkgUqYiJh6oyEhamCRkSQo3UQklfiHCEKgiNCFSZgXEop2EdkPmASlEnHEC6NAb0LBDFK8SSmvBFNK13PWLM6afeab7xs95+jFfuHlzLf3nj17r3evn5kjkpGRkZExQHhY+bzy9eIvv719qg/KeHAxVLlNeUN5Rvmpcr/yZ+VS5SblgWLsLuVN5e3AKwX/V/6pXCM2JxijPJWM/0/5pXJYMea9iv5FRV9Gh3hC+ZPyqvLFpA8xEBWBPgvtg5SfK28p5yXti5XXlD8oR4S+J5WXlReV40O7g2cdVL4lNk9GAxAy8bR/lfOTPgce9ZuUhQT8vq6clbSD3WKe9X5oQzxE/FU5MrRHbFa+nDZmtMcSMW/7Rjk46YvAwE2EZDxCxntcyC7lo6E9Igt5FyB84Y0YfEPSl2Khcl/SVifkDrF58UxHXws5SrlK7FnLlI+Vu7ujzQvKLWJzej4Gj4itZ4FyrthcLyknhjGAOXnGB2Ip5KHQ5/NvFLt3hvKZ0D9gILwR5jB4O+Ox6JjvQCshMcovYjl3WmjvKyE5gG8q/1K+rXxa+b3ynFgeBs+K7Y3QTtsbyrPSUwOwZtIFe6eg40Afk/KaGfu72LOY74j05H3SDXXFK2L7IrJdkvZr7xe4YTsRsgoISVg+LFYQQdqoXhFySs/QbvSVkHgQB8jzL97FGhCWVyTP6dulXDThWYxxoVhDl9h6J4tV2ifEhMczEXFrMRY8p/xbrBjDAxk7PPS/I+3X3i9o4pFVQDTu5cQikvPxOCigk2KHOevWgjB4DwbFSxyI6YcDg3LASAcReCEHgFAMXEiYHqyqORDtpNgaaecV6Yvimj2zBtgKHs47IVEtHsJauFEQg4XXYbqUTydwIesMH+FCQq6r0E5IN37dHOTyqpDvQv4oli/rhGQdabRx4pGkmp1Sfvc9JL3TTwRenM7Vih9Ka4eoRKdVK6dufdLWVMixyj+kXoQ9ytlpY0AnQlJgpe+3wIX0vfpc7CNFqzlSsKflyq/FbPGxNPCkvgQn6yupf49k0x9J7xPeVEjmIRTxsYB8kwKjYGT+1mGrVBv5KeUE5Qqxdb1W7u4ez32eW+uE9AO+MmnH4+aI7Zl87kA8cnKX9PbuAQPJnbxF1ZV6AwskB64rrmM7X3aaCAlmiglJ+PDvuIDrvcrVoa0VEOy8mOj+GZD78WYKGQx5XOyA+jPc0BRBFEPAhfRQG8G834nZZXRoR1jIninoyGUODgip6r54pIONEBZuim3u3YJHxd6TotH51vqPlPMDpT15tBNQzWIEjMozthTXa6X8nlYHn+OC2DdhxMCLHLz/fSI9341PiAk/rugnVcQ9cM2+IrAJIZbCCq/9VqxQwhYIydynxZ5PaOXw+OvPfQeVFaGD/34skP4LE5zaScpXxYwST3YTUBAQiuNBi/BK8V72UTXHELFncvDw8EaFSUZGRkZGRkb/4w4H1QgH9Wi6ewAAAABJRU5ErkJggg==>