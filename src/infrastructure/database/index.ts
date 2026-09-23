export {
    buildTenantDatabaseUrl,
    createAdminPrismaClient,
    createTenantPrismaClient,
    resolveTenantConnectionConfig,
} from "./tenant-connection-manager.js";

export type {
    TenantConnectionConfig,
    TenantConnectionInput,
} from "./tenant-connection-manager.js";
