import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { SubjectService } from "./subject.service.js";

const subjectService = new SubjectService();

export class SubjectController {
    async listSubjects(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;

            const result = await subjectService.listSubjects(req.tenantDb as Parameters<typeof subjectService.listSubjects>[0], {
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

    async getSubject(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const subjectId = Array.isArray(req.params.subjectId) ? req.params.subjectId[0] : req.params.subjectId;
            if (!subjectId) {
                throw new AppError("Subject id is required", 400, "VALIDATION_ERROR");
            }

            const value = await subjectService.getSubject(req.tenantDb as Parameters<typeof subjectService.getSubject>[0], subjectId);
            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async createSubject(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const value = await subjectService.createSubject(
                req.tenantDb as Parameters<typeof subjectService.createSubject>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(201).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async updateSubject(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const subjectId = Array.isArray(req.params.subjectId) ? req.params.subjectId[0] : req.params.subjectId;
            if (!subjectId) {
                throw new AppError("Subject id is required", 400, "VALIDATION_ERROR");
            }

            const value = await subjectService.updateSubject(
                req.tenantDb as Parameters<typeof subjectService.updateSubject>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                subjectId,
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }
}
