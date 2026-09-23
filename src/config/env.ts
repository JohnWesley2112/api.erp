// src/config/env.ts

import "dotenv/config";

const requireEnv = (name: string, fallback?: string) => {
    const value = process.env[name] ?? fallback;

    if (value === undefined || value === "") {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 3000),
    clientOrigin: requireEnv("CLIENT_ORIGIN", "http://localhost:5000"),
    jwtSecret: requireEnv("JWT_SECRET", "development-secret-change-me"),
    adminDatabaseUrl: requireEnv("ADMIN_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/erpdb"),
    tenantDatabaseUrl: process.env.TENANT_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/erpdb_tenant",
    databaseUrl: process.env.ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/erpdb",
};
