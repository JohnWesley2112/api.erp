import { AppError } from "../errors/app.error.js";
import { createAdminPrismaClient, tenantConnectionManager } from "../infrastructure/database/tenant-connection-manager.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../types/express.js";
import { setRequestDiagnosticContext } from "../observability/request-context.js";

const adminPrisma = createAdminPrismaClient();

export const resolveTenantContext = async (
    req: AppRequest,
    _res: AppResponse,
    next: AppNextFunction,
) => {
    try {
        setRequestDiagnosticContext(req, { stage: "TENANT_MEMBERSHIP", operation: "validate tenant membership" });
        const authUser = req.auth ?? req.user;

        if (!authUser?.userId) {
            throw new AppError("Authentication required", 401, "UNAUTHORIZED");
        }

        const resolvedTenantId = authUser.tenantId;

        if (!resolvedTenantId) {
            throw new AppError("Tenant context is required", 400, "VALIDATION_ERROR");
        }

        const membership = await adminPrisma.userTenantMembership.findFirst({
            where: {
                userId: authUser.userId,
                tenantId: resolvedTenantId,
            },
            include: {
                tenant: true,
            },
        });

        if (!membership || !membership.tenant) {
            throw new AppError("Tenant access denied", 403, "TENANT_ACCESS_DENIED");
        }

        if (membership.status !== "ACTIVE") {
            throw new AppError("Tenant membership is inactive", 403, "TENANT_ACCESS_DENIED");
        }

        if (membership.tenant.status !== "ACTIVE") {
            throw new AppError("Tenant is inactive", 403, "TENANT_INACTIVE");
        }

        setRequestDiagnosticContext(req, { stage: "TENANT_DATABASE_CONFIGURATION", operation: "load tenant database configuration" });
        const databaseConfig = await adminPrisma.tenantDatabaseConfig.findUnique({
            where: {
                tenantId: membership.tenant.id,
            },
        });

        if (!databaseConfig) {
            throw new AppError(
                "Tenant database configuration not found",
                500,
                "TENANT_DATABASE_CONFIG_NOT_FOUND",
            );
        }

        setRequestDiagnosticContext(req, { stage: "TENANT_DATABASE_CONNECTION", operation: "create tenant Prisma client" });
        const tenantDbPassword = process.env[databaseConfig.passwordSecretRef];

        if (!tenantDbPassword) {
            throw new AppError(
                "Tenant database credentials are not configured",
                500,
                "TENANT_DATABASE_CONFIG_NOT_FOUND",
            );
        }

        const tenantDb = tenantConnectionManager.getClient({
            tenantId: membership.tenant.id,
            host: databaseConfig.host,
            port: databaseConfig.port,
            username: databaseConfig.username,
            password: tenantDbPassword,
            databaseName: databaseConfig.databaseName,
        });

        req.tenant = {
            userId: authUser.userId,
            tenantId: membership.tenant.id,
            membershipId: membership.id,
        };
        req.tenantDb = tenantDb;

        setRequestDiagnosticContext(req, { stage: "CONTROLLER", operation: "tenant-scoped request" });
        next();
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }

        return next(new AppError("Failed to resolve tenant context", 500, "INTERNAL_ERROR", true, {
            cause: error,
            ...(req.diagnosticContext ? { context: { ...req.diagnosticContext } } : {}),
        }));
    }
};
