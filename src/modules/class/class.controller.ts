import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { ClassService } from "./class.service.js";

const classService = new ClassService();

export class ClassController {
    async listClasses(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;

            const result = await classService.listClasses(req.tenantDb as Parameters<typeof classService.listClasses>[0], {
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

    async getClass(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const classId = Array.isArray(req.params.classId) ? req.params.classId[0] : req.params.classId;
            if (!classId) {
                throw new AppError("Class id is required", 400, "VALIDATION_ERROR");
            }

            const value = await classService.getClass(req.tenantDb as Parameters<typeof classService.getClass>[0], classId);
            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async createClass(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const value = await classService.createClass(
                req.tenantDb as Parameters<typeof classService.createClass>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                req.body ?? {},
            );

            return res.status(201).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }

    async updateClass(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const classId = Array.isArray(req.params.classId) ? req.params.classId[0] : req.params.classId;
            if (!classId) {
                throw new AppError("Class id is required", 400, "VALIDATION_ERROR");
            }

            const value = await classService.updateClass(
                req.tenantDb as Parameters<typeof classService.updateClass>[0],
                req.user?.userId ?? req.auth?.userId ?? "system",
                classId,
                req.body ?? {},
            );

            return res.status(200).json({ success: true, data: value });
        } catch (error) {
            return next(error);
        }
    }
}
