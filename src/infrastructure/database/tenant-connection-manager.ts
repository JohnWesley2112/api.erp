import crypto from "crypto";
import { PrismaClient as AdminPrismaClient } from "../../../node_modules/.prisma/admin-client/index.js";
import { PrismaClient as TenantPrismaClient } from "../../../node_modules/.prisma/tenant-client/index.js";
import logger from "../../logs/Logger.js";

export interface TenantConnectionInput {
    tenantId: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    databaseName?: string;
}

export interface TenantConnectionConfig extends Required<Pick<TenantConnectionInput, "tenantId" | "host" | "port" | "username" | "password" | "databaseName">> {
    url: string;
}

const sanitizeTenantId = (tenantId: string): string => {
    const cleaned = tenantId.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

    if (!cleaned) {
        throw new Error("tenantId is required");
    }

    return cleaned;
};

export const buildTenantDatabaseUrl = (
    tenantId: string,
    overrides: Partial<Pick<TenantConnectionInput, "host" | "port" | "username" | "password" | "databaseName">> = {},
): string => {
    const safeTenantId = sanitizeTenantId(tenantId);
    const host = overrides.host ?? process.env.TENANT_DB_HOST ?? "localhost";
    const port = overrides.port ?? Number(process.env.TENANT_DB_PORT ?? 5432);
    const username = overrides.username ?? process.env.TENANT_DB_USERNAME ?? "postgres";
    const password = overrides.password ?? process.env.TENANT_DB_PASSWORD ?? "postgres";
    const databaseName = overrides.databaseName ?? `systra_tenant_${safeTenantId}`;

    return `postgresql://${username}:${encodeURIComponent(password)}@${host}:${port}/${databaseName}`;
};

export const resolveTenantConnectionConfig = ({
    tenantId,
    host,
    port,
    username,
    password,
    databaseName,
}: TenantConnectionInput): TenantConnectionConfig => {
    const safeTenantId = sanitizeTenantId(tenantId);
    const resolvedHost = host ?? process.env.TENANT_DB_HOST ?? "localhost";
    const resolvedPort = port ?? Number(process.env.TENANT_DB_PORT ?? 5432);
    const resolvedUsername = username ?? process.env.TENANT_DB_USERNAME ?? "postgres";
    const resolvedPassword = password ?? process.env.TENANT_DB_PASSWORD ?? "postgres";
    const resolvedDatabaseName = databaseName ?? `systra_tenant_${safeTenantId}`;

    return {
        tenantId: safeTenantId,
        host: resolvedHost,
        port: resolvedPort,
        username: resolvedUsername,
        password: resolvedPassword,
        databaseName: resolvedDatabaseName,
        url: buildTenantDatabaseUrl(safeTenantId, {
            host: resolvedHost,
            port: resolvedPort,
            username: resolvedUsername,
            password: resolvedPassword,
            databaseName: resolvedDatabaseName,
        }),
    };
};

export const createTenantPrismaClient = (input: TenantConnectionInput): TenantPrismaClient => {
    const config = resolveTenantConnectionConfig(input);

    return new TenantPrismaClient({
        datasourceUrl: config.url,
        log: [
            { level: "error", emit: "event" },
            { level: "warn", emit: "event" },
        ],
    });
};

const TENANT_CLIENT_IDLE_TTL_MS = 10 * 60 * 1000;
const TENANT_CLIENT_MAX_ACTIVE = 10;

interface TenantClientCacheEntry {
    client: TenantPrismaClient;
    lastUsedAt: number;
}

const tenantClientCache = new Map<string, TenantClientCacheEntry>();

// Never derive the cache key from the raw password; hash it so no secret material sits in memory as a map key.
const buildCacheKey = (config: TenantConnectionConfig): string => {
    const credentialFingerprint = crypto.createHash("sha256").update(config.password).digest("hex");
    return [config.tenantId, config.host, config.port, config.username, config.databaseName, credentialFingerprint].join("::");
};

const disconnectSafely = async (client: TenantPrismaClient): Promise<void> => {
    try {
        await client.$disconnect();
    } catch (error) {
        logger.warn("Failed to disconnect a tenant database client during eviction", {
            event: "tenant_client_disconnect_failed",
            errorMessage: error instanceof Error ? error.message : String(error),
        });
    }
};

const evictEntry = (key: string): void => {
    const entry = tenantClientCache.get(key);

    if (!entry) {
        return;
    }

    tenantClientCache.delete(key);
    void disconnectSafely(entry.client);
};

const sweepIdleEntries = (now: number): void => {
    for (const [key, entry] of tenantClientCache) {
        if (now - entry.lastUsedAt >= TENANT_CLIENT_IDLE_TTL_MS) {
            evictEntry(key);
        }
    }
};

const evictLeastRecentlyUsed = (): void => {
    let oldestKey: string | undefined;
    let oldestLastUsedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of tenantClientCache) {
        if (entry.lastUsedAt < oldestLastUsedAt) {
            oldestLastUsedAt = entry.lastUsedAt;
            oldestKey = key;
        }
    }

    if (oldestKey) {
        evictEntry(oldestKey);
    }
};

/**
 * Caches tenant Prisma clients so tenant-scoped requests reuse an existing
 * client/connection pool instead of opening a new one per request.
 */
export const tenantConnectionManager = {
    getClient(input: TenantConnectionInput): TenantPrismaClient {
        const config = resolveTenantConnectionConfig(input);
        const key = buildCacheKey(config);
        const now = Date.now();

        sweepIdleEntries(now);

        const cached = tenantClientCache.get(key);
        if (cached) {
            cached.lastUsedAt = now;
            return cached.client;
        }

        if (tenantClientCache.size >= TENANT_CLIENT_MAX_ACTIVE) {
            evictLeastRecentlyUsed();
        }

        const client = createTenantPrismaClient(input);
        tenantClientCache.set(key, { client, lastUsedAt: now });
        return client;
    },

    size(): number {
        return tenantClientCache.size;
    },

    async disconnectAll(): Promise<void> {
        const entries = [...tenantClientCache.values()];
        tenantClientCache.clear();
        await Promise.all(entries.map((entry) => disconnectSafely(entry.client)));
    },
};

export const createAdminPrismaClient = (
    databaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/systra_admin",
): AdminPrismaClient => {
    return new AdminPrismaClient({
        datasourceUrl: databaseUrl,
        log: [
            { level: "error", emit: "event" },
            { level: "warn", emit: "event" },
        ],
    });
};
