import { AppError } from "../../errors/app.error.js";
import { createAdminPrismaClient } from "../../infrastructure/database/tenant-connection-manager.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";

const adminPrisma = createAdminPrismaClient();

export class TenantController {
    async getTenantContext(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant || !req.user?.userId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const tenant = await adminPrisma.tenant.findUnique({
                where: { id: req.tenant.tenantId },
                select: { id: true, name: true },
            });

            if (!tenant) {
                throw new AppError("Tenant not found", 404, "NOT_FOUND");
            }

            return res.status(200).json({
                success: true,
                data: {
                    tenantId: req.tenant.tenantId,
                    tenantName: tenant.name,
                    userId: req.tenant.userId,
                    membershipId: req.tenant.membershipId,
                },
            });
        } catch (error) {
            return next(error);
        }
    }
}
