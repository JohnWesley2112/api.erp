// src/config/db.ts
import { PrismaClient, Prisma } from "@prisma/client";
import logger from "../logs/Logger.js";

const prisma = new PrismaClient({
    log: [
        { level: "query", emit: "event" },
        { level: "error", emit: "event" }, // capture via event
        { level: "info", emit: "event" },
        { level: "warn", emit: "event" },
    ],
});

// Log slow queries
prisma.$on("query", (e: Prisma.QueryEvent) => {
    if (e.duration > 200) {
        logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
});

// Log warnings
prisma.$on("warn", (e: Prisma.LogEvent) => {
    logger.warn(e.message);
});

// Log errors (optional – your error handler already catches Prisma errors)
prisma.$on("error", (e: Prisma.LogEvent) => {
    logger.error(e.message);
});

// Log info (optional)
prisma.$on("info", (e: Prisma.LogEvent) => {
    logger.info(e.message);
});

export default prisma;
