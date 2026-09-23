// server.ts
import app from "./app.js";
import { errorHandler } from "./errors/error.handler.js";
import { env } from "./config/env.js";
import logger from "./logs/Logger.js";
import { tenantConnectionManager } from "./infrastructure/database/tenant-connection-manager.js";

app.get("/", (_req, res) => {
    res.json({
        success: true,
        data: {
            name: "Systra API",
            status: "running",
            environment: env.nodeEnv,
        },
    });
});

app.use(errorHandler);

const server = app.listen(env.port, () => {
    logger.info("Systra API listening", { port: env.port, environment: env.nodeEnv, timestamp: new Date().toISOString() });
});

let isShuttingDown = false;

const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;

    logger.info("Shutting down Systra API", { signal, timestamp: new Date().toISOString() });

    server.close();
    await tenantConnectionManager.disconnectAll();

    process.exit(0);
};

process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
