import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { AcademicYearService } from "./academic-year.service.js";

const academicYearService = new AcademicYearService();

export class AcademicYearController {
    async listAcademicYears(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;

            const result = await academicYearService.listAcademicYears(req.tenantDb as Parameters<typeof academicYearService.listAcademicYears>[0], {
                page,
                pageSize,
                ...(search ? { search } : {}),
                ...(status ? { status } : {}),
            });

            return res.status(200).json({
                success: true,
                data: result.items,
                meta: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    async getAcademicYear(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const academicYearId = Array.isArray(req.params.academicYearId) ? req.params.academicYearId[0] : req.params.academicYearId;
            if (!academicYearId) {
                throw new AppError("Academic year id is required", 400, "VALIDATION_ERROR");
            }

            const academicYear = await academicYearService.getAcademicYear(req.tenantDb as Parameters<typeof academicYearService.getAcademicYear>[0], academicYearId);
            return res.status(200).json({ success: true, data: academicYear });
        } catch (error) {
            return next(error);
        }
    }

    async createAcademicYear(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const academicYear = await academicYearService.createAcademicYear(
                req.tenantDb as Parameters<typeof academicYearService.createAcademicYear>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(201).json({ success: true, data: academicYear });
        } catch (error) {
            return next(error);
        }
    }

    async updateAcademicYear(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const academicYearId = Array.isArray(req.params.academicYearId) ? req.params.academicYearId[0] : req.params.academicYearId;
            if (!academicYearId) {
                throw new AppError("Academic year id is required", 400, "VALIDATION_ERROR");
            }

            const academicYear = await academicYearService.updateAcademicYear(
                req.tenantDb as Parameters<typeof academicYearService.updateAcademicYear>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                academicYearId,
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: academicYear });
        } catch (error) {
            return next(error);
        }
    }
}
