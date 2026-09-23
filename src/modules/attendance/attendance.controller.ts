import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { AttendanceService } from "./attendance.service.js";

const service = new AttendanceService();
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export class AttendanceController {
    private db(req: AppRequest) { if (!req.tenantDb) throw new AppError("Tenant context is required", 401, "UNAUTHORIZED"); return req.tenantDb; }
    private actor(req: AppRequest) { return req.user?.userId ?? req.auth?.userId ?? "system"; }

    async list(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const options: { page: number; pageSize: number; sectionId?: string; date?: string } = { page: Number(req.query.page ?? 1), pageSize: Number(req.query.pageSize ?? 20) };
            if (typeof req.query.sectionId === "string") options.sectionId = req.query.sectionId;
            if (typeof req.query.date === "string") options.date = req.query.date;
            const result = await service.listSessions(this.db(req), this.actor(req), options);
            return res.json({ success: true, data: result.items, meta: { total: result.total, page: result.page, pageSize: result.pageSize } });
        } catch (error) { return next(error); }
    }

    async get(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const sessionId = param(req.params.sessionId);
            if (!sessionId) throw new AppError("Attendance session id is required", 400, "VALIDATION_ERROR");
            return res.json({ success: true, data: await service.getSession(this.db(req), this.actor(req), sessionId) });
        } catch (error) { return next(error); }
    }

    async create(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            return res.status(201).json({ success: true, data: await service.createSession(this.db(req), this.actor(req), req.body ?? {}) });
        } catch (error) { return next(error); }
    }

    async addRecords(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const sessionId = param(req.params.sessionId);
            if (!sessionId) throw new AppError("Attendance session id is required", 400, "VALIDATION_ERROR");
            return res.status(201).json({ success: true, data: await service.addRecords(this.db(req), this.actor(req), sessionId, req.body ?? {}) });
        } catch (error) { return next(error); }
    }

    async submit(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const sessionId = param(req.params.sessionId);
            if (!sessionId) throw new AppError("Attendance session id is required", 400, "VALIDATION_ERROR");
            return res.json({ success: true, data: await service.submitSession(this.db(req), this.actor(req), sessionId) });
        } catch (error) { return next(error); }
    }
}
