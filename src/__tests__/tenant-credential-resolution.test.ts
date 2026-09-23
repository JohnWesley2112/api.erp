import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import { errorHandler } from "../errors/error.handler.js";
import type { AppRequest } from "../types/express.js";

vi.mock("../logs/Logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

const { mockMembershipFindFirst, mockTenantDatabaseConfigFindUnique, mockTenantConnectionManagerGetClient } = vi.hoisted(() => ({
    mockMembershipFindFirst: vi.fn(),
    mockTenantDatabaseConfigFindUnique: vi.fn(),
    mockTenantConnectionManagerGetClient: vi.fn(() => ({})),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => ({
    createAdminPrismaClient: vi.fn(() => ({
        userTenantMembership: { findFirst: mockMembershipFindFirst },
        tenantDatabaseConfig: { findUnique: mockTenantDatabaseConfigFindUnique },
    })),
    tenantConnectionManager: { getClient: mockTenantConnectionManagerGetClient },
}));

const { resolveTenantContext } = await import("../middlewares/tenant.middleware.js");

const ORIGINAL_ENV = { ...process.env };

const buildApp = () => {
    const app = express();
    app.use((req: AppRequest, _res, next) => {
        req.auth = { userId: "user-1", tenantId: "tenant-1" };
        next();
    });
    app.use(resolveTenantContext);
    app.get("/probe", (_req, res) => {
        res.status(200).json({ success: true });
    });
    app.use(errorHandler);
    return app;
};

const mockActiveMembership = () => {
    mockMembershipFindFirst.mockResolvedValue({
        id: "membership-1",
        status: "ACTIVE",
        tenant: { id: "tenant-1", status: "ACTIVE" },
    });
};

describe("tenant database credential resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
        process.env.TENANT_DB_PASSWORD = "primary-tenant-password";
        process.env.TENANT_DB_PASSWORD_B = "other-tenant-password";
        mockActiveMembership();
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it("resolves the tenant database password from the env var named by passwordSecretRef", async () => {
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD",
        });

        const response = await request(buildApp()).get("/probe");

        expect(response.status).toBe(200);
        expect(mockTenantConnectionManagerGetClient).toHaveBeenCalledWith(
            expect.objectContaining({ password: "primary-tenant-password" }),
        );
    });

    it("resolves different credentials for different passwordSecretRef values", async () => {
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db_b",
            passwordSecretRef: "TENANT_DB_PASSWORD_B",
        });

        await request(buildApp()).get("/probe");

        expect(mockTenantConnectionManagerGetClient).toHaveBeenCalledWith(
            expect.objectContaining({ password: "other-tenant-password" }),
        );
        expect(mockTenantConnectionManagerGetClient).not.toHaveBeenCalledWith(
            expect.objectContaining({ password: "primary-tenant-password" }),
        );
    });

    it("fails safely when the referenced environment variable is missing", async () => {
        delete process.env.TENANT_DB_PASSWORD_MISSING;
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD_MISSING",
        });

        const response = await request(buildApp()).get("/probe");

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(mockTenantConnectionManagerGetClient).not.toHaveBeenCalled();
    });

    it("fails safely when the referenced environment variable is empty", async () => {
        process.env.TENANT_DB_PASSWORD_EMPTY = "";
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD_EMPTY",
        });

        const response = await request(buildApp()).get("/probe");

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(mockTenantConnectionManagerGetClient).not.toHaveBeenCalled();
    });

    it("never falls back to a hardcoded default password", async () => {
        delete process.env.TENANT_DB_PASSWORD_UNSET;
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD_UNSET",
        });

        await request(buildApp()).get("/probe");

        expect(mockTenantConnectionManagerGetClient).not.toHaveBeenCalledWith(
            expect.objectContaining({ password: "123456" }),
        );
        expect(mockTenantConnectionManagerGetClient).not.toHaveBeenCalledWith(
            expect.objectContaining({ password: "postgres" }),
        );
    });

    it("does not leak the secret value, secret reference, or env var name in the HTTP response", async () => {
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD_MISSING",
        });

        const response = await request(buildApp()).get("/probe");

        const body = JSON.stringify(response.body);
        expect(body).not.toContain("TENANT_DB_PASSWORD_MISSING");
        expect(body).not.toContain("primary-tenant-password");
        expect(body).not.toMatch(/passwordSecretRef/i);
    });

    it("delegates tenant client resolution to the tenant connection manager for reuse across requests", async () => {
        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            host: "localhost",
            port: 5432,
            username: "postgres",
            databaseName: "tenant_db",
            passwordSecretRef: "TENANT_DB_PASSWORD",
        });

        const app = buildApp();
        await request(app).get("/probe");
        await request(app).get("/probe");

        expect(mockTenantConnectionManagerGetClient).toHaveBeenCalledTimes(2);
        expect(mockTenantConnectionManagerGetClient).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ tenantId: "tenant-1", password: "primary-tenant-password" }),
        );
        expect(mockTenantConnectionManagerGetClient).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ tenantId: "tenant-1", password: "primary-tenant-password" }),
        );
    });
});
