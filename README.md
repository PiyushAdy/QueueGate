# QueueGate

A distributed, high-concurrency ticket queue and reservation system designed to handle flash-sale surges without database lock contention or inventory overselling.

---

## Overview

During high-demand ticket drops (such as concert or sporting event sales), traditional database architectures struggle with connection pool exhaustion, table lock contention, and race conditions. 

**QueueGate** decouples high-throughput queue management from persistent database storage by leveraging an in-memory Redis layer for queue ranking, hold management, and atomic admission, while persisting only finalized transactions to PostgreSQL.

```
                      ┌──────────────────────────────────────┐
                      │        Clients / Web Interface       │
                      └──────────────────┬───────────────────┘
                                         │ (REST & WebSockets)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Express API + Socket.IO Server    │
                      └──────────────┬────────────────┬──────┘
                                     │                │
          (Atomic State Mutations /  │                │ (Durable Writes /
           Active Queue Management)  │                │  Confirmed Bookings)
                                     ▼                ▼
                      ┌──────────────────────┐ ┌──────────────┐
                      │   Redis (In-Memory)  │ │  PostgreSQL  │
                      │  • Sequence Counter  │ │  • Events    │
                      │  • Sorted Sets (FIFO)│ │  • Bookings  │
                      │  • TTL Hold Sets     │ └──────────────┘
                      │  • Lua Script Engine │
                      └──────────────────────┘
```

---

## Architecture & Design Decisions

### 1. State Partitioning & Decoupled Storage
* **Ephemeral Live State (Redis):** Manages real-time queue sequencing, user positions, active holds, and inventory limits. In-memory execution ensures sub-millisecond response times under thousands of concurrent connections.
* **Durable Records (PostgreSQL):** Stores relational event metadata and immutable confirmed booking records. The database is shielded from direct surge traffic and is only queried during final checkout.

### 2. Atomic Concurrency Control via Lua Scripts
To eliminate check-then-act race conditions (such as two users acquiring the same remaining ticket), all critical mutations are executed inside Redis as atomic Lua scripts:
* `joinQueue.lua`: Idempotently assigns a monotonic ticket sequence and inserts the user into a Redis Sorted Set (`ZSET`).
* `admitUsers.lua`: Pops the next batch of users from the queue, decrements available inventory, and registers timed holds in an expiration set.
* `expireUsers.lua`: Identifies expired holds, releases inventory back into the pool, and updates user session state.
* `confirmBooking.lua`: Validates active hold status and security tokens before marking the ticket as booked and releasing the hold.

### 3. Strict Monotonic FIFO Ordering
Queue positions are ordered using an atomic Redis counter (`INCR event:<eventId>:seq`) rather than timestamps. This guarantees strict integer ordering and eliminates collision ties caused by concurrent requests arriving in the same millisecond.

### 4. Active Queue Reconciliation Worker
A background worker continuously monitors active holds and available inventory:
* Expired ticket holds are reclaimed and returned to the pool.
* Newly available tickets trigger immediate admission of next-in-line waiting users.
* Broadcasts real-time events when inventory is completely exhausted.

### 5. Multi-Instance Horizontal Scaling
The WebSocket layer is configured with the `@socket.io/redis-adapter` using Redis Pub/Sub. When an event status or position update occurs on one Node.js instance, it is automatically broadcast to clients connected across all other server instances in the cluster.

---

## Benchmark & Concurrency Validation

The system includes a concurrency test suite (`load-test/oversell-surge.ts`) that simulates a traffic spike and an adversarial double-booking attack (concurrent checkout requests sent by admitted users at the exact same millisecond).

### Benchmark Results

| Parameter | Value | Description |
|---|---|---|
| **Concurrent Join Surge** | 200 requests | Simultaneous queue entry attempts |
| **Throughput** | **1,012.75 RPS** | Sustained requests processed per second |
| **Total Join Duration** | **197.48 ms** | Total processing time for 200 concurrent joins |
| **Mean Batch Latency** | **< 200 ms** | Turnaround time under peak burst |
| **Total Inventory Tested** | 5 tickets | Constrained inventory for stress testing |
| **Admitted Users** | 5 | Exactly matches available inventory |
| **Checkout Attempts** | 25 requests | 5 concurrent checkout requests per admitted user |
| **Successful Bookings** | 5 | All 5 tickets confirmed in PostgreSQL |
| **Blocked Duplicate Bookings** | 20 (100%) | Race condition attempts blocked by Lua locks |
| **Oversell Rate** | **0.00%** | Zero inventory over-allocation |

---

## API Specification

### Event Management
* `POST /events` — Create a new ticket event with defined inventory and hold durations.
* `GET /events` — Retrieve a list of recent active events.
* `GET /events/:eventId` — Fetch event details and current metadata.
* `GET /events/:eventId/summary` — Fetch real-time operational metrics (inventory, waiting count, active holds, confirmed bookings).

### Queue & Checkout
* `POST /events/:eventId/join` — Join the queue for an event (returns `queueId`, `ticketNum`, `currentPos`, and secure `queueToken`).
* `GET /events/:eventId/queue/:queueId` — Fetch current position and queue status.
* `POST /events/:eventId/book` — Finalize booking with `clientId`, `queueId`, and `queueTokenHash`.

### WebSocket Events (Socket.IO)
* `queue:status` — Real-time position and queue length updates.
* `queue:admitted` — Notification when a user's turn arrives and a hold is established.
* `queue:expired` — Notification when an admitted user's hold expires.
* `event:sold_out` — Broadcast sent to all waiting participants when an event is fully booked.

---

## Built-in Demonstration Interface

The service serves a lightweight Material 3 web client accessible at `http://localhost:3000`:
* **Event Selection & Creation:** Browse active events or generate new ticket drops.
* **Live Queue Progress:** Real-time visual tracking of queue position via WebSockets.
* **Session Persistence:** Retains queue credentials in `localStorage` to resume position across browser refreshes.
* **Timed Checkout & Status Badges:** Visual indicators for waiting, admitted, booked, and sold-out states.

---

## Getting Started

### Prerequisites
* [Docker & Docker Compose](https://www.docker.com/)
* [Node.js](https://nodejs.org/) (v18+)

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/PiyushAdy/QueueGate.git
   cd QueueGate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **Start database and cache infrastructure:**
   ```bash
   docker compose up -d
   ```

5. **Run database migrations:**
   ```bash
   npm run migrate
   ```

6. **Start the application server:**
   ```bash
   npm run dev
   ```

7. **Access the interface or run tests:**
   * **Web Client:** Open `http://localhost:3000` in your browser.
   * **Run Concurrency Benchmark:**
     ```bash
     npm run load-test
     ```

### Production Docker Deployment

For production-like environments, the repository includes a multi-stage `Dockerfile` and a production compose file. This setup compiles the TypeScript code, drops heavy `devDependencies`, explicitly copies necessary static assets (like `.lua` and `.sql` scripts), and networks the containers internally.

1. **Build and start the entire cluster (API, Redis, PostgreSQL):**
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

2. **Access the Web Client:** 
   Open `http://localhost:3000` (or your configured port) in your browser.