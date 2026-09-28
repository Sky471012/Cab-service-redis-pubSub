const {
  connectRedis,
  disconnectRedis,
  REDIS_URL,
} = require("./config/redis");

const CHANNEL = "ride-events";

const rideStates = {
  driver_assigned: "Driver is on the way",
  driver_accepted: "Driver has accepted the ride",
  ride_started: "Ride is in progress",
  ride_completed: "Ride has finished",
};

async function handleMessage(message) {
  try {
    const event = JSON.parse(message);

    console.log(`\n[Ride Service] Received event from channel '${CHANNEL}'`);
    console.log(`[Ride Service] rideId: ${event.rideId}`);
    console.log(`[Ride Service] type:   ${event.type}`);

    const state = rideStates[event.type] || "Unknown state";
    console.log(`[Ride Service] Updating ride state -> ${state}`);
    console.log(
      `[Ride Service] Ride ${event.rideId} is now in state '${event.type}' (driver: ${
        event.driverId || "n/a"
      }, passenger: ${event.passengerId || "n/a"})`
    );
  } catch (err) {
    console.error("[Ride Service] Failed to process message:", err.message);
  }
}

async function start() {
  const baseClient = await connectRedis();
  console.log(`[Ride Service] Base client connected to ${REDIS_URL}`);

  const subscriber = baseClient.duplicate();

  subscriber.on("error", (err) => {
    console.error("[Ride Service] Subscriber error:", err.message);
  });

  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, handleMessage);

  console.log(`[Ride Service] Subscribed to channel '${CHANNEL}'`);
  console.log("[Ride Service] Waiting for ride events...\n");

  return { baseClient, subscriber };
}

async function shutdown(clients, signal) {
  console.log(`\n[Ride Service] Received ${signal}, shutting down gracefully...`);

  const { baseClient, subscriber } = clients;

  if (subscriber && subscriber.isOpen) {
    await subscriber.unsubscribe(CHANNEL);
    await subscriber.quit();
    console.log("[Ride Service] Unsubscribed and closed subscriber client");
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
    console.error("[Ride Service] Failed to start:", err.message);
    process.exit(1);
  });
