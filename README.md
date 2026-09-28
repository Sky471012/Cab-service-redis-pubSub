# redis-ride-pubsub

A simple Node.js + Express project that demonstrates **Redis Pub/Sub** with a real-life
**ride booking system**.

No MongoDB, no Docker, no queues, no authentication — just Redis Pub/Sub and Express.

---

## What is Redis Pub/Sub?

Redis Pub/Sub (publisher / subscriber) is a **messaging pattern** built into Redis.

- A **publisher** sends a message to a **channel** (a named string, e.g. `ride-events`).
- Every **subscriber** that is currently listening on that channel receives the message.
- Redis delivers the message to subscribers and then **forgets it** — nothing is stored.

### Publisher vs Subscriber

| Role | What it does | In this project |
|------|--------------|-----------------|
| **Publisher** | Sends messages to a channel | `server.js` (Express API) |
| **Subscriber** | Listens on a channel and reacts to messages | `subscriber.js`, `notificationSubscriber.js`, `monitoringSubscriber.js` |

The publisher does not know who is listening, and subscribers do not know who is publishing.
They only share the **channel name**.

### Channel

A channel is just a **string key** used to group messages.

```
ride-events
```

Anyone can publish to it, anyone can subscribe to it. Redis matches them by name.

### One-to-many message delivery

This is the key idea: **one message, many consumers**.

```
Client
  ↓
Express API (publisher)
  ↓
Redis channel: ride-events
  ↓
  ├── Ride State Service      (updates the ride status)
  ├── Notification Service    (notifies passenger / driver)
  └── Monitoring Service      (logs/metrics)
```

A single `POST /rides/:rideId/events` call publishes **one** event, and **all three**
independent subscribers receive it. Each one reacts in its own way.

### Important limitations of Redis Pub/Sub

1. **Only currently connected subscribers receive messages.**
   If the Notification Service is down when an event is published, it **misses that
   event forever**. There is no replay.

2. **It is not a durable queue.**
   Redis Pub/Sub messages are fire-and-forget. Once delivered (or if no one was
   listening), the message is gone. There is no persistence, no acknowledgements,
   no retries, no consumer groups.

   If you need durability, you want something else — for example **Redis Streams**,
   **RabbitMQ**, or **Kafka**.

### How this differs from RabbitMQ and Kafka (basic level)

| | Redis Pub/Sub | RabbitMQ | Kafka |
|---|---|---|---|
| **Delivery** | Fire-and-forget to live subscribers | Push to consumers, with acks | Append-only log, consumers pull |
| **Durability** | None — messages vanish | Messages persist until acknowledged | Messages retained for a configurable time |
| **Replay** | No | No (unless you use quorum queues / streams) | Yes — re-read from an offset |
| **Order** | Per channel, best effort | Per queue | Per partition |
| **Complexity** | Very simple | Moderate broker | Distributed streaming platform |
| **Best for** | Live notifications, cache invalidation, real-time broadcasts | Task queues, RPC, reliable job delivery | Event sourcing, analytics, replayable event history |

**Rule of thumb:** use Redis Pub/Sub when it is acceptable to lose a message if a
service is offline. Use RabbitMQ/Kafka when every message must be processed.

---

## Project structure

```
pubSub-redis/
├── server.js                 # Express API - the publisher
├── subscriber.js             # Ride State Service (subscriber)
├── notificationSubscriber.js # Notification Service (subscriber)
├── monitoringSubscriber.js   # Monitoring Service (subscriber)
├── config/
│   └── redis.js              # Redis client + REDIS_URL from .env
├── package.json
├── .env
└── .gitignore
```

## Prerequisites

- Node.js 18+
- A running Redis server on `localhost:6379`

```bash
# check redis is up
redis-cli ping
# expected: PONG
```

## Setup

```bash
npm install
```

`.env` is already provided:

```
REDIS_URL=redis://localhost:6379
PORT=3000
```

## Running the demo

Open **four separate terminals** in the project folder.

**Terminal 1 — start the three subscribers:**

```bash
npm run subscriber
```

**Terminal 2:**

```bash
npm run notifications
```

**Terminal 3:**

```bash
npm run monitoring
```

**Terminal 4 — start the API:**

```bash
npm start
```

Now publish an event:

```bash
curl -X POST http://localhost:3000/rides/ride-101/events \
  -H "Content-Type: application/json" \
  -d '{"type":"driver_accepted","driverId":"d-1","passengerId":"p-1"}'
```

Response from the API:

```json
{
  "success": true,
  "message": "Ride event published",
  "event": {
    "rideId": "101",
    "type": "driver_accepted",
    "driverId": "d-1",
    "passengerId": "p-1",
    "timestamp": "2026-09-28T12:00:00.000Z"
  }
}
```

All three subscribers print the message, each in its own style.

### Try other event types

```bash
curl -X POST http://localhost:3000/rides/ride-101/events \
  -H "Content-Type: application/json" \
  -d '{"type":"ride_started","driverId":"d-1","passengerId":"p-1"}'

curl -X POST http://localhost:3000/rides/ride-101/events \
  -H "Content-Type: application/json" \
  -d '{"type":"ride_completed","driverId":"d-1","passengerId":"p-1"}'
```

### See the "not durable" behavior

Stop the notification service (Ctrl+C in Terminal 2), publish an event, and watch the
other two services receive it while the Notification Service gets nothing. Restart it —
it will not receive the missed message. That is Redis Pub/Sub.

## npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm start` | `node server.js` | Runs the Express publisher API |
| `npm run subscriber` | `node subscriber.js` | Runs the Ride State Service |
| `npm run notifications` | `node notificationSubscriber.js` | Runs the Notification Service |
| `npm run monitoring` | `node monitoringSubscriber.js` | Runs the Monitoring Service |

## API

### `POST /rides/:rideId/events`

Request body:

```json
{
  "type": "driver_accepted",
  "driverId": "d-1",
  "passengerId": "p-1"
}
```

Success response:

```json
{
  "success": true,
  "message": "Ride event published",
  "event": {
    "rideId": "101",
    "type": "driver_accepted",
    "driverId": "d-1",
    "passengerId": "p-1",
    "timestamp": "2026-09-28T12:00:00.000Z"
  }
}
```

Supported `type` values used by the Notification Service:
`driver_accepted`, `ride_started`, `ride_completed` (others are logged as "no rule").

## Graceful shutdown

All processes handle `SIGINT` / `SIGTERM` (Ctrl+C): they unsubscribe, close the Redis
connections cleanly, and exit.
