import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { AuditService } from "./audit.service.js";

const service = new AuditService();

export class AuditController {
    private db(req: AppRequest) { if (!req.tenantDb) throw new AppError("Tenant context is required", 401, "UNAUTHORIZED"); return req.tenantDb; }

    async list(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const options: Record<string, unknown> = { page: Number(req.query.page ?? 1), pageSize: Number(req.query.pageSize ?? 20) };
            for (const field of ["actorUserId", "action", "entityType", "from", "to"]) {
                if (typeof req.query[field] === "string") options[field] = req.query[field];
            }
            const result = await service.listAuditLogs(this.db(req), options);
            return res.json({ success: true, data: result.items, meta: { total: result.total, page: result.page, pageSize: result.pageSize } });
        } catch (error) { return next(error); }
    }
}
