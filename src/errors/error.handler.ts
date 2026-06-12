// errors/errorHandler.ts
import { Prisma } from "@prisma/client";
import { AppError } from "./app.error.js";
import type {
    AppNextFunction,
    AppRequest,
    AppResponse,
} from "../types/express.js";
import logger from "../logs/Logger.js";

export function errorHandler(
    err: Error,
    req: AppRequest,
    res: AppResponse,
    next: AppNextFunction,
) {
    // Log with your configured Loggerverse (dashboard + file)
    logger.error(err.message || "An unknown error occurred", {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: (req as any).user?.id,
    });

    // Prisma known errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        switch (err.code) {
            case "P2002":
                return res.status(409).json({
                    error: `Unique constraint failed on: ${err.meta?.target}`,
                });
            case "P2025":
                return res.status(404).json({ error: "Record not found" });
            default:
                return res.status(400).json({ error: err.message });
        }
    }

    // Custom operational errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Everything else (programming errors, unknown)
    res.status(500).json({ error: "Internal server error" });
}
