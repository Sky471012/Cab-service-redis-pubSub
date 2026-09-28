const express = require("express");
const {
  client,
  connectRedis,
  disconnectRedis,
  REDIS_URL,
} = require("./config/redis");

const CHANNEL = "ride-events";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Redis Ride Pub/Sub API",
    channel: CHANNEL,
    endpoint: "POST /rides/:rideId/events",
  });
});

app.post("/rides/:rideId/events", async (req, res) => {
  try {
    const { rideId } = req.params;
    const { type, driverId, passengerId } = req.body || {};

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Field 'type' is required in the request body",
      });
    }

    const event = {
      rideId,
      type,
      driverId: driverId || null,
      passengerId: passengerId || null,
      timestamp: new Date().toISOString(),
    };

    await connectRedis();
    await client.publish(CHANNEL, JSON.stringify(event));

    console.log(`[Publisher] Published '${type}' for ride ${rideId}`);

    return res.json({
      success: true,
      message: "Ride event published",
      event,
    });
  } catch (err) {
    console.error("[Publisher] Failed to publish event:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to publish ride event",
      error: err.message,
    });
  }
});

let server;

async function start() {
  await connectRedis();
  console.log(`[Server] Redis connected at ${REDIS_URL}`);

  server = app.listen(PORT, () => {
    console.log(`[Server] Express API listening on http://localhost:${PORT}`);
    console.log(`[Server] Publishing ride events to channel '${CHANNEL}'`);
  });
}

async function shutdown(signal) {
  console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log("[Server] HTTP server closed");
  }

  await disconnectRedis();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((err) => {
  console.error("[Server] Failed to start:", err.message);
  process.exit(1);
});
