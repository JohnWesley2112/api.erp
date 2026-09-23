import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";

const sanitizeText = (value: string | null | undefined, maxLength?: number) => {
    if (value === undefined || value === null) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    if (maxLength !== undefined && trimmed.length > maxLength) {
        throw new AppError(`Value exceeds the maximum length of ${maxLength} characters`, 400, "VALIDATION_ERROR");
    }

    return trimmed;
};

const normalizeCode = (value: string | null | undefined) => {
    const cleaned = sanitizeText(value, 50);
    if (!cleaned) {
        return undefined;
    }

    return cleaned.toUpperCase();
};

const normalizeStatus = (value: unknown) => {
    const status = typeof value === "string" ? value.trim().toUpperCase() : undefined;
    if (!status) {
        return undefined;
    }

    if (status !== "ACTIVE" && status !== "INACTIVE") {
        throw new AppError("Subject status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
    }

    return status;
};

type SubjectRecord = {
    id: string;
    name: string;
    code: string;
    status: string;
};

export class SubjectService {
    async listSubjects(
        tenantDb: {
            subject: {
                findMany: (args: unknown) => Promise<unknown>;
                count: (args: unknown) => Promise<unknown>;
            };
        },
        options: { page?: number; pageSize?: number; search?: string; status?: string } = {},
    ) {
        const page = Number(options.page ?? 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const search = options.search?.trim();
        const where: Record<string, unknown> = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
            ];
        }
        if (options.status) {
            where.status = options.status;
        }

        const [total, items] = await Promise.all([
            tenantDb.subject.count({ where }) as Promise<number>,
            tenantDb.subject.findMany({
                where,
                orderBy: { name: "asc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    name: true,
                    code: true,
                    status: true,
                },
            }) as Promise<SubjectRecord[]>,
        ]);

        return { items, total, page, pageSize };
    }

    async getSubject(
        tenantDb: {
            subject: {
                findUnique: (args: unknown) => Promise<unknown>;
            };
        },
        subjectId: string,
    ): Promise<SubjectRecord> {
        const subject = await tenantDb.subject.findUnique({
            where: { id: subjectId },
            select: {
                id: true,
                name: true,
                code: true,
                status: true,
            },
        }) as SubjectRecord | null;

        if (!subject) {
            throw new AppError("Subject not found in this tenant", 404, "NOT_FOUND");
        }

        return subject;
    }

    async createSubject(
        tenantDb: {
            subject: {
                findUnique: (args: unknown) => Promise<unknown>;
                create: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<SubjectRecord> {
        const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 200);
        const code = normalizeCode(typeof input.code === "string" ? input.code : undefined);
        const status = normalizeStatus(input.status ?? "ACTIVE");

        if (!name) {
            throw new AppError("Subject name is required", 400, "VALIDATION_ERROR");
        }
        if (!code) {
            throw new AppError("Subject code is required", 400, "VALIDATION_ERROR");
        }

        const duplicate = await tenantDb.subject.findUnique({
            where: { code },
            select: { id: true },
        }) as { id: string } | null;

        if (duplicate) {
            throw new AppError("A subject with this code already exists", 409, "DUPLICATE_RESOURCE");
        }

        const subject = await tenantDb.subject.create({
            data: {
                name,
                code,
                status: status ?? "ACTIVE",
            },
            select: {
                id: true,
                name: true,
                code: true,
                status: true,
            },
        }) as SubjectRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "subject.created",
                entityType: "subject",
                entityId: subject.id,
                metadata: {
                    subjectId: subject.id,
                    name: subject.name,
                    code: subject.code,
                },
            },
        });

        return subject;
    }

    async updateSubject(
        tenantDb: {
            subject: {
                findUnique: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        subjectId: string,
        input: Record<string, unknown>,
    ): Promise<SubjectRecord> {
        const existing = await tenantDb.subject.findUnique({
            where: { id: subjectId },
            select: {
                id: true,
                name: true,
                code: true,
                status: true,
            },
        }) as SubjectRecord | null;

        if (!existing) {
            throw new AppError("Subject not found in this tenant", 404, "NOT_FOUND");
        }

        const nextData: Record<string, unknown> = {};

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 200);
            if (!name) {
                throw new AppError("Subject name is required", 400, "VALIDATION_ERROR");
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "code")) {
            const code = normalizeCode(typeof input.code === "string" ? input.code : undefined);
            if (!code) {
                throw new AppError("Subject code is required", 400, "VALIDATION_ERROR");
            }
            if (code !== existing.code) {
                const duplicate = await tenantDb.subject.findUnique({
                    where: { code },
                    select: { id: true },
                }) as { id: string } | null;
                if (duplicate) {
                    throw new AppError("A subject with this code already exists", 409, "DUPLICATE_RESOURCE");
                }
            }
            nextData.code = code;
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const status = normalizeStatus(input.status);
            if (status) {
                nextData.status = status;
            }
        }

        if (!Object.keys(nextData).length) {
            throw new AppError("No valid subject fields were provided for update", 400, "VALIDATION_ERROR");
        }

        const updated = await tenantDb.subject.update({
            where: { id: subjectId },
            data: nextData,
            select: {
                id: true,
                name: true,
                code: true,
                status: true,
            },
        }) as SubjectRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "subject.updated",
                entityType: "subject",
                entityId: updated.id,
                metadata: {
                    subjectId: updated.id,
                    changes: Object.keys(nextData),
                },
            },
        });

        return updated;
    }
}
