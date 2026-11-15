// src/config/env.ts

import "dotenv/config";

const requireEnv = (name: string, fallback?: string) => {
    const value = process.env[name] ?? fallback;

    if (value === undefined || value === "") {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const parseRefreshCookieSameSite = (): "lax" | "strict" | "none" => {
    const value = (process.env.REFRESH_COOKIE_SAME_SITE ?? "lax").toLowerCase();

    if (value === "lax" || value === "strict" || value === "none") {
        return value;
    }

    throw new Error("REFRESH_COOKIE_SAME_SITE must be lax, strict, or none");
};

export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 3000),
    refreshCookieSameSite: parseRefreshCookieSameSite(),
    clientOrigin: requireEnv("CLIENT_ORIGIN", "http://localhost:5000"),
    jwtSecret: requireEnv("JWT_SECRET", "development-secret-change-me"),
    adminDatabaseUrl: requireEnv("ADMIN_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/erpdb"),
    tenantDatabaseUrl: process.env.TENANT_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/erpdb_tenant",
    databaseUrl: process.env.ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/erpdb",
};
