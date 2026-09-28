const {
  connectRedis,
  disconnectRedis,
  REDIS_URL,
} = require("./config/redis");

const CHANNEL = "ride-events";

let receivedCount = 0;

async function handleMessage(message) {
  try {
    const event = JSON.parse(message);
    receivedCount += 1;

    console.log(`\n[Monitoring Service] Received event #${receivedCount}`);
    console.log(`[Monitoring Service] rideId:    ${event.rideId}`);
    console.log(`[Monitoring Service] type:      ${event.type}`);
    console.log(`[Monitoring Service] timestamp: ${event.timestamp}`);
  } catch (err) {
    console.error("[Monitoring Service] Failed to process message:", err.message);
  }
}

async function start() {
  const baseClient = await connectRedis();
  console.log(`[Monitoring Service] Base client connected to ${REDIS_URL}`);

  const subscriber = baseClient.duplicate();

  subscriber.on("error", (err) => {
    console.error("[Monitoring Service] Subscriber error:", err.message);
  });

  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, handleMessage);

  console.log(`[Monitoring Service] Subscribed to channel '${CHANNEL}'`);
  console.log("[Monitoring Service] Waiting for ride events...\n");

  return { baseClient, subscriber };
}

async function shutdown(clients, signal) {
  console.log(
    `\n[Monitoring Service] Received ${signal}, shutting down gracefully...`
  );

  const { baseClient, subscriber } = clients;

  if (subscriber && subscriber.isOpen) {
    await subscriber.unsubscribe(CHANNEL);
    await subscriber.quit();
    console.log("[Monitoring Service] Unsubscribed and closed subscriber client");
  }

  if (baseClient) {
    await disconnectRedis();
  }

  process.exit(0);
}

start()
  .then((clients) => {
    process.on("SIGINT", () => shutdown(clients, "SIGINT"));
    process.on("SIGTERM", () => shutdown(clients, "SIGTERM"));
  })
  .catch((err) => {
    console.error("[Monitoring Service] Failed to start:", err.message);
    process.exit(1);
  });
