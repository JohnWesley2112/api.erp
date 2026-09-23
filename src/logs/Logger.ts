import "dotenv/config";
import { createLogger, FileTransport } from "loggerverse";

export const loggerDashboardPath = process.env.LOGGER_DASHBOARD_PATH ?? "/admin/logs";

const isDashboardEnabled = process.env.LOGGER_DASHBOARD_ENABLED === "true";

const requireDashboardCredential = (name: string) => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name} (required when LOGGER_DASHBOARD_ENABLED=true)`);
    }

    return value;
};

const dashboardUsers = isDashboardEnabled
    ? [
        {
            username: requireDashboardCredential("LOGGER_USERNAME"),
            password: requireDashboardCredential("LOGGER_PASSWORD"),
            role: "admin" as const,
        },
    ]
    : [];

const logger = createLogger({
    context: {
        service: "systra-api",
        environment: process.env.NODE_ENV ?? "development",
    },
    sanitization: {
        redactKeys: [
            "password",
            "passwordHash",
            "token",
            "authorization",
            "cookie",
            "secret",
            "apiKey",
            "databaseUrl",
            "tenantDatabaseUrl",
        ],
    },
    dashboard: {
        enabled: isDashboardEnabled,
        path: loggerDashboardPath,
        showMetrics: true,
        users: dashboardUsers,
    },
    transports: [
        new FileTransport({
            logFolder: "./logs",
            filename: "app",
            format: "json",
            maxFiles: 30,
        }),
    ],
});

export default logger;
