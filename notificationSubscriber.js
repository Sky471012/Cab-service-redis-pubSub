const {
  connectRedis,
  disconnectRedis,
  REDIS_URL,
} = require("./config/redis");

const CHANNEL = "ride-events";

async function handleMessage(message) {
  try {
    const event = JSON.parse(message);

    console.log(`\n[Notification Service] Received event from channel '${CHANNEL}'`);
    console.log(
      `[Notification Service] rideId: ${event.rideId}, type: ${event.type}, timestamp: ${event.timestamp}`
    );

    switch (event.type) {
      case "driver_accepted":
        console.log(
          `[Notification Service] Passenger ${
            event.passengerId || "n/a"
          } received driver acceptance notification`
        );
        break;
      case "ride_started":
        console.log(
          `[Notification Service] Passenger ${
            event.passengerId || "n/a"
          } was notified that the ride has started`
        );
        break;
      case "ride_completed":
        console.log(
          `[Notification Service] Passenger ${
            event.passengerId || "n/a"
          } was notified that the ride has completed`
        );
        break;
      default:
        console.log(
          `[Notification Service] No notification rule for type '${event.type}', skipping`
        );
        break;
    }
  } catch (err) {
    console.error(
      "[Notification Service] Failed to process message:",
      err.message
    );
  }
}

async function start() {
  const baseClient = await connectRedis();
  console.log(`[Notification Service] Base client connected to ${REDIS_URL}`);

  const subscriber = baseClient.duplicate();

  subscriber.on("error", (err) => {
    console.error("[Notification Service] Subscriber error:", err.message);
  });

  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, handleMessage);

  console.log(`[Notification Service] Subscribed to channel '${CHANNEL}'`);
  console.log("[Notification Service] Waiting for ride events...\n");

  return { baseClient, subscriber };
}

async function shutdown(clients, signal) {
  console.log(
    `\n[Notification Service] Received ${signal}, shutting down gracefully...`
  );

  const { baseClient, subscriber } = clients;

  if (subscriber && subscriber.isOpen) {
    await subscriber.unsubscribe(CHANNEL);
    await subscriber.quit();
    console.log(
      "[Notification Service] Unsubscribed and closed subscriber client"
    );
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
    console.error("[Notification Service] Failed to start:", err.message);
    process.exit(1);
  });
