// errors/errorHandler.ts
import { Prisma } from "../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "./app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../types/express.js";
import logger from "../logs/Logger.js";

type PrismaLikeError = Error & { code: string; meta?: { target?: unknown }; clientVersion?: string };

const redact = (value: unknown): unknown => typeof value === "string"
    ? value
        .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, "$1[REDACTED]@")
        .replace(/\b(bearer\s+)[^\s]+/gi, "$1[REDACTED]")
        .replace(/\b(password|token|secret|database_url|tenant_database_url)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    : value;

const isPrismaLikeError = (error: unknown): error is PrismaLikeError => {
    if (error instanceof AppError) return false;
    if (error instanceof Prisma.PrismaClientKnownRequestError) return true;
    if (!error || typeof error !== "object" || !("code" in error)) return false;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code.startsWith("P");
};

const errorSummary = (error: unknown, includeStack: boolean) => {
    if (!(error instanceof Error)) return { name: "NonErrorThrown", message: redact(String(error)) };
    return {
        name: error.name,
        message: redact(error.message),
        ...(includeStack && error.stack ? { stack: redact(error.stack) } : {}),
    };
};

export function errorHandler(err: unknown, req: AppRequest, res: AppResponse, next: AppNextFunction) {
    void next;
    const appError = err instanceof AppError ? err : undefined;
    const prismaError = isPrismaLikeError(err) ? err : undefined;
    const rootPrismaError = prismaError ?? (appError && isPrismaLikeError(appError.cause) ? appError.cause : undefined);
    const isDatabaseConnectionError = rootPrismaError?.code === "P1000"
        || rootPrismaError?.code === "P1001"
        || rootPrismaError?.code === "P1002"
        || rootPrismaError?.code === "P1017";
    const statusCode = appError?.statusCode
        ?? (prismaError?.code === "P2002" ? 409 : prismaError?.code === "P2025" ? 404 : prismaError ? 400 : 500);
    const errorCode = appError?.code
        ?? (prismaError?.code === "P2002" ? "DUPLICATE_RESOURCE" : prismaError?.code === "P2025" ? "NOT_FOUND" : prismaError ? "VALIDATION_ERROR" : "INTERNAL_ERROR");
    // Keep the established HTTP response status, but classify infrastructure
    // connection failures as server errors even where legacy response mapping is 4xx.
    const isServerError = statusCode >= 500 || isDatabaseConnectionError;
    const context = appError?.context ?? req.diagnosticContext;

    const logContext = {
        event: "request_error",
        timestamp: new Date().toISOString(),
        classification: isServerError ? "server_error" : "application_error",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode,
        errorCode,
        errorMessage: redact(appError?.message ?? (err instanceof Error ? err.message : String(err))),
        userId: req.user?.userId ?? req.auth?.userId,
        tenantId: req.tenant?.tenantId ?? req.user?.tenantId ?? req.auth?.tenantId,
        stage: isDatabaseConnectionError ? "TENANT_DATABASE_CONNECTION" : rootPrismaError ? "DATABASE_OPERATION" : context?.stage ?? "CONTROLLER",
        operation: isDatabaseConnectionError ? "connect tenant database" : context?.operation ?? `${req.method} ${req.path}`,
        ...(appError?.context ? { details: appError.context } : {}),
        ...(rootPrismaError ? { prisma: { type: rootPrismaError.name, code: rootPrismaError.code, target: rootPrismaError.meta?.target ?? null, clientVersion: rootPrismaError.clientVersion } } : {}),
        ...(isServerError ? { stack: errorSummary(err, true).stack } : {}),
        ...(appError?.cause ? { cause: errorSummary(appError.cause, isServerError) } : {}),
    };

    if (isServerError) logger.error("Request failed with a server error", logContext);
    else logger.warn("Request failed with an application error", logContext);

    if (appError) {
        return res.status(appError.statusCode).json({ success: false, error: { code: appError.code, message: appError.message, details: {} } });
    }
    if (prismaError) {
        // Never expose Prisma error internals (raw message, meta/target, schema details) to API clients.
        switch (prismaError.code) {
            case "P2002": return res.status(409).json({ success: false, error: { code: "DUPLICATE_RESOURCE", message: "A record with the same value already exists.", details: {} } });
            case "P2025": return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Record not found", details: {} } });
            default: return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "The request could not be processed due to a database validation error.", details: {} } });
        }
    }
    return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error", details: {} } });
}
