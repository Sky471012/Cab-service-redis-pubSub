require("dotenv").config();

const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const client = createClient({
  url: REDIS_URL,
});

client.on("error", (err) => {
  console.error("[Redis] Client error:", err.message);
});

client.on("connect", () => {
  console.log("[Redis] Connecting to", REDIS_URL);
});

client.on("ready", () => {
  console.log("[Redis] Connected and ready");
});

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

async function disconnectRedis() {
  if (client.isOpen) {
    await client.quit();
    console.log("[Redis] Disconnected cleanly");
  }
}

module.exports = {
  client,
  REDIS_URL,
  connectRedis,
  disconnectRedis,
};
