import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { CampusService } from "./campus.service.js";

const campusService = new CampusService();

export class CampusController {
    async listCampuses(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;

            const result = await campusService.listCampuses(req.tenantDb as Parameters<typeof campusService.listCampuses>[0], req.user?.userId ?? req.auth?.userId ?? "system", {
                page,
                pageSize,
                ...(search !== undefined ? { search } : {}),
                ...(status !== undefined ? { status } : {}),
            });

            return res.status(200).json({ success: true, data: result.items, meta: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
            } });
        } catch (error) {
            return next(error);
        }
    }

    async getCampus(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const campusId = Array.isArray(req.params.campusId) ? req.params.campusId[0] : req.params.campusId;
            if (!campusId) {
                throw new AppError("Campus id is required", 400, "VALIDATION_ERROR");
            }

            const campus = await campusService.getCampus(req.tenantDb as Parameters<typeof campusService.getCampus>[0], campusId);
            return res.status(200).json({ success: true, data: campus });
        } catch (error) {
            return next(error);
        }
    }

    async createCampus(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const campus = await campusService.createCampus(
                req.tenantDb as Parameters<typeof campusService.createCampus>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(201).json({ success: true, data: campus });
        } catch (error) {
            return next(error);
        }
    }

    async updateCampus(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const campusId = Array.isArray(req.params.campusId) ? req.params.campusId[0] : req.params.campusId;
            if (!campusId) {
                throw new AppError("Campus id is required", 400, "VALIDATION_ERROR");
            }

            const campus = await campusService.updateCampus(
                req.tenantDb as Parameters<typeof campusService.updateCampus>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                campusId,
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: campus });
        } catch (error) {
            return next(error);
        }
    }
}
