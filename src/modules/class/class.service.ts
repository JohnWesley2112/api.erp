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
        throw new AppError("Class status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
    }

    return status;
};

type ClassRecord = {
    id: string;
    name: string;
    code: string;
    displayOrder: number;
    status: string;
};

export class ClassService {
    async listClasses(
        tenantDb: {
            class: {
                count: (args: unknown) => Promise<unknown>;
                findMany: (args: unknown) => Promise<unknown>;
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
            tenantDb.class.count({ where }) as Promise<number>,
            tenantDb.class.findMany({
                where,
                orderBy: { displayOrder: "asc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    name: true,
                    code: true,
                    displayOrder: true,
                    status: true,
                },
            }) as Promise<ClassRecord[]>,
        ]);

        return { items, total, page, pageSize };
    }

    async getClass(
        tenantDb: {
            class: {
                findUnique: (args: unknown) => Promise<unknown>;
            };
        },
        classId: string,
    ): Promise<ClassRecord> {
        const currentClass = await tenantDb.class.findUnique({
            where: { id: classId },
            select: {
                id: true,
                name: true,
                code: true,
                displayOrder: true,
                status: true,
            },
        }) as ClassRecord | null;

        if (!currentClass) {
            throw new AppError("Class not found in this tenant", 404, "NOT_FOUND");
        }

        return currentClass;
    }

    async createClass(
        tenantDb: {
            class: {
                findUnique: (args: unknown) => Promise<unknown>;
                create: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<ClassRecord> {
        const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
        const code = normalizeCode(typeof input.code === "string" ? input.code : undefined);
        const displayOrder = Number(input.displayOrder ?? 0);
        const status = normalizeStatus(input.status ?? "ACTIVE");

        if (!name) {
            throw new AppError("Class name is required", 400, "VALIDATION_ERROR");
        }
        if (!code) {
            throw new AppError("Class code is required", 400, "VALIDATION_ERROR");
        }
        if (!Number.isInteger(displayOrder)) {
            throw new AppError("Display order must be an integer", 400, "VALIDATION_ERROR");
        }

        const duplicate = await tenantDb.class.findUnique({
            where: { code },
            select: { id: true },
        }) as { id: string } | null;

        if (duplicate) {
            throw new AppError("A class with this code already exists", 409, "DUPLICATE_RESOURCE");
        }

        const created = await tenantDb.class.create({
            data: {
                name,
                code,
                displayOrder,
                status: status ?? "ACTIVE",
            },
            select: {
                id: true,
                name: true,
                code: true,
                displayOrder: true,
                status: true,
            },
        }) as ClassRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "class.created",
                entityType: "class",
                entityId: created.id,
                metadata: {
                    classId: created.id,
                    name: created.name,
                    code: created.code,
                },
            },
        });

        return created;
    }

    async updateClass(
        tenantDb: {
            class: {
                findUnique: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        classId: string,
        input: Record<string, unknown>,
    ): Promise<ClassRecord> {
        const currentClass = await tenantDb.class.findUnique({
            where: { id: classId },
            select: {
                id: true,
                name: true,
                code: true,
                displayOrder: true,
                status: true,
            },
        }) as ClassRecord | null;

        if (!currentClass) {
            throw new AppError("Class not found in this tenant", 404, "NOT_FOUND");
        }

        const nextData: Record<string, unknown> = {};

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
            if (!name) {
                throw new AppError("Class name is required", 400, "VALIDATION_ERROR");
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "code")) {
            const code = normalizeCode(typeof input.code === "string" ? input.code : undefined);
            if (!code) {
                throw new AppError("Class code is required", 400, "VALIDATION_ERROR");
            }
            if (code !== currentClass.code) {
                const duplicate = await tenantDb.class.findUnique({
                    where: { code },
                    select: { id: true },
                }) as { id: string } | null;
                if (duplicate) {
                    throw new AppError("A class with this code already exists", 409, "DUPLICATE_RESOURCE");
                }
            }
            nextData.code = code;
        }

        if (Object.prototype.hasOwnProperty.call(input, "displayOrder")) {
            const displayOrder = Number(input.displayOrder);
            if (!Number.isInteger(displayOrder)) {
                throw new AppError("Display order must be an integer", 400, "VALIDATION_ERROR");
            }
            nextData.displayOrder = displayOrder;
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const status = normalizeStatus(input.status);
            if (status) {
                nextData.status = status;
            }
        }

        if (!Object.keys(nextData).length) {
            throw new AppError("No valid class fields were provided for update", 400, "VALIDATION_ERROR");
        }

        const updatedClass = await tenantDb.class.update({
            where: { id: classId },
            data: nextData,
            select: {
                id: true,
                name: true,
                code: true,
                displayOrder: true,
                status: true,
            },
        }) as ClassRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "class.updated",
                entityType: "class",
                entityId: updatedClass.id,
                metadata: {
                    classId: updatedClass.id,
                    changes: Object.keys(nextData),
                },
            },
        });

        return updatedClass;
    }
}
