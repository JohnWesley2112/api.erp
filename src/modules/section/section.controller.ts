import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { SectionService } from "./section.service.js";

const sectionService = new SectionService();

export class SectionController {
    async listSections(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const academicYearId = typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;
            const campusId = typeof req.query.campusId === "string" ? req.query.campusId : undefined;
            const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;
            const search = typeof req.query.search === "string" ? req.query.search : undefined;

            const result = await sectionService.listSections(req.tenantDb as Parameters<typeof sectionService.listSections>[0], {
                page,
                pageSize,
                ...(academicYearId ? { academicYearId } : {}),
                ...(campusId ? { campusId } : {}),
                ...(classId ? { classId } : {}),
                ...(status ? { status } : {}),
                ...(search ? { search } : {}),
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

    async getSection(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const sectionId = Array.isArray(req.params.sectionId) ? req.params.sectionId[0] : req.params.sectionId;
            if (!sectionId) {
                throw new AppError("Section id is required", 400, "VALIDATION_ERROR");
            }

            const value = await sectionService.getSection(req.tenantDb as Parameters<typeof sectionService.getSection>[0], sectionId);
            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async createSection(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const value = await sectionService.createSection(
                req.tenantDb as Parameters<typeof sectionService.createSection>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(201).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async updateSection(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const sectionId = Array.isArray(req.params.sectionId) ? req.params.sectionId[0] : req.params.sectionId;
            if (!sectionId) {
                throw new AppError("Section id is required", 400, "VALIDATION_ERROR");
            }

            const value = await sectionService.updateSection(
                req.tenantDb as Parameters<typeof sectionService.updateSection>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                sectionId,
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }
}
