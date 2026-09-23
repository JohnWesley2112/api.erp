/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppError } from "../../errors/app.error.js";

const parseDate = (value: unknown, field: string, endOfDay = false) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new AppError(`${field} must be a valid date`, 400, "VALIDATION_ERROR");
    const isoDate = value.length > 10 ? value.slice(0, 10) : value;
    return new Date(`${isoDate}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
};

const auditLogSelect = {
    id: true, actorUserId: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true,
};

export class AuditService {
    async listAuditLogs(tenantDb: any, options: Record<string, unknown> = {}) {
        const page = Math.max(Number(options.page ?? 1), 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const where: any = {};
        if (typeof options.actorUserId === "string" && options.actorUserId.trim()) where.actorUserId = options.actorUserId.trim();
        if (typeof options.action === "string" && options.action.trim()) where.action = options.action.trim();
        if (typeof options.entityType === "string" && options.entityType.trim()) where.entityType = options.entityType.trim();
        const from = parseDate(options.from, "from");
        const to = parseDate(options.to, "to", true);
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = from;
            if (to) where.createdAt.lte = to;
        }
        const [total, items] = await Promise.all([
            tenantDb.auditLog.count({ where }),
            tenantDb.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: auditLogSelect }),
        ]);
        return { items, total, page, pageSize };
    }
}
