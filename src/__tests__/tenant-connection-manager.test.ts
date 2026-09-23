import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createdClients } = vi.hoisted(() => ({
    createdClients: [] as { $disconnect: ReturnType<typeof vi.fn> }[],
}));

vi.mock("../../node_modules/.prisma/tenant-client/index.js", () => ({
    PrismaClient: vi.fn().mockImplementation(function PrismaClient() {
        const client = { $disconnect: vi.fn().mockResolvedValue(undefined) };
        createdClients.push(client);
        return client;
    }),
}));

vi.mock("../logs/Logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

import {
    buildTenantDatabaseUrl,
    resolveTenantConnectionConfig,
    tenantConnectionManager,
} from "../infrastructure/database/tenant-connection-manager.js";

describe("tenant connection manager", () => {
    it("builds a tenant database url from a tenant id", () => {
        expect(buildTenantDatabaseUrl("tenant-123")).toContain("systra_tenant_tenant-123");
    });

    it("resolves admin and tenant database config from environment defaults", () => {
        const config = resolveTenantConnectionConfig({
            tenantId: "tenant-123",
            host: "localhost",
            port: 5432,
            username: "postgres",
            password: "postgres",
            databaseName: "systra_tenant_tenant-123",
        });

        expect(config.databaseName).toBe("systra_tenant_tenant-123");
        expect(config.url).toContain("postgresql://postgres:postgres@localhost:5432/systra_tenant_tenant-123");
    });
});

describe("TenantConnectionManager", () => {
    const baseInput = (tenantId: string, overrides: Partial<Parameters<typeof tenantConnectionManager.getClient>[0]> = {}) => ({
        tenantId,
        host: "localhost",
        port: 5432,
        username: "postgres",
        password: "tenant-password",
        databaseName: `systra_tenant_${tenantId}`,
        ...overrides,
    });

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        createdClients.length = 0;
        await tenantConnectionManager.disconnectAll();
    });

    afterEach(async () => {
        await tenantConnectionManager.disconnectAll();
        vi.useRealTimers();
    });

    it("reuses the cached client for the same tenant and connection signature", () => {
        const first = tenantConnectionManager.getClient(baseInput("tenant-a"));
        const second = tenantConnectionManager.getClient(baseInput("tenant-a"));

        expect(second).toBe(first);
        expect(createdClients).toHaveLength(1);
    });

    it("creates distinct clients for distinct tenants", () => {
        const clientA = tenantConnectionManager.getClient(baseInput("tenant-a"));
        const clientB = tenantConnectionManager.getClient(baseInput("tenant-b"));

        expect(clientA).not.toBe(clientB);
        expect(createdClients).toHaveLength(2);
    });

    it("creates a new client when the connection signature changes for the same tenant", () => {
        const original = tenantConnectionManager.getClient(baseInput("tenant-a", { password: "old-password" }));
        const rotated = tenantConnectionManager.getClient(baseInput("tenant-a", { password: "new-password" }));

        expect(rotated).not.toBe(original);
        expect(createdClients).toHaveLength(2);
    });

    it("does not create a second client for concurrent same-tenant access within the same tick", () => {
        const results = [
            tenantConnectionManager.getClient(baseInput("tenant-a")),
            tenantConnectionManager.getClient(baseInput("tenant-a")),
            tenantConnectionManager.getClient(baseInput("tenant-a")),
        ];

        expect(new Set(results).size).toBe(1);
        expect(createdClients).toHaveLength(1);
    });

    it("evicts and disconnects a client that has been idle past the timeout", () => {
        const client = tenantConnectionManager.getClient(baseInput("tenant-a"));

        vi.setSystemTime(11 * 60 * 1000);
        tenantConnectionManager.getClient(baseInput("tenant-b"));

        expect(tenantConnectionManager.size()).toBe(1);
        expect(client.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("refreshes lastUsedAt on access so an actively used client is not evicted as idle", () => {
        tenantConnectionManager.getClient(baseInput("tenant-a"));

        vi.setSystemTime(5 * 60 * 1000);
        tenantConnectionManager.getClient(baseInput("tenant-a"));

        vi.setSystemTime(11 * 60 * 1000);
        tenantConnectionManager.getClient(baseInput("tenant-a"));

        expect(createdClients).toHaveLength(1);
        expect(createdClients[0]?.$disconnect).not.toHaveBeenCalled();
    });

    it("evicts the least-recently-used client once the max active client cap is reached", () => {
        for (let i = 0; i < 10; i += 1) {
            vi.setSystemTime(i * 1000);
            tenantConnectionManager.getClient(baseInput(`tenant-${i}`));
        }

        expect(tenantConnectionManager.size()).toBe(10);

        vi.setSystemTime(10 * 1000);
        tenantConnectionManager.getClient(baseInput("tenant-overflow"));

        expect(tenantConnectionManager.size()).toBe(10);
        expect(createdClients[0]?.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("disconnectAll disconnects every cached client and empties the cache", async () => {
        tenantConnectionManager.getClient(baseInput("tenant-a"));
        tenantConnectionManager.getClient(baseInput("tenant-b"));

        await tenantConnectionManager.disconnectAll();

        expect(tenantConnectionManager.size()).toBe(0);
        expect(createdClients[0]?.$disconnect).toHaveBeenCalledTimes(1);
        expect(createdClients[1]?.$disconnect).toHaveBeenCalledTimes(1);
    });

    it("does not throw when a cached client fails to disconnect during eviction", () => {
        const client = tenantConnectionManager.getClient(baseInput("tenant-a"));
        (client.$disconnect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connection already closed"));

        vi.setSystemTime(11 * 60 * 1000);

        expect(() => tenantConnectionManager.getClient(baseInput("tenant-b"))).not.toThrow();
    });
});
