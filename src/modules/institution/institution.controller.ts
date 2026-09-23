import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { InstitutionService } from "./institution.service.js";

const institutionService = new InstitutionService();

export class InstitutionController {
    async getInstitution(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const institution = await institutionService.getInstitution(req.tenantDb as Parameters<typeof institutionService.getInstitution>[0]);
            return res.status(200).json({ success: true, data: institution });
        } catch (error) {
            return next(error);
        }
    }

    async updateInstitution(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const institution = await institutionService.updateInstitution(
                req.tenantDb as Parameters<typeof institutionService.updateInstitution>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: institution });
        } catch (error) {
            return next(error);
        }
    }
}
