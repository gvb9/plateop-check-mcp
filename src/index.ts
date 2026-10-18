import { configFromEnv } from "./config.js";
import { startServer } from "./server.js";

const cfg = configFromEnv();
const s = await startServer(cfg);
console.log(`plateop-check listening on :${s.port}, Plateop at ${cfg.plateopBaseUrl}`);

const stop = () => void s.close().then(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
