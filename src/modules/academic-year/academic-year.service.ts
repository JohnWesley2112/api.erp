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

const normalizeStatus = (value: unknown) => {
    const status = typeof value === "string" ? value.trim().toUpperCase() : undefined;
    if (!status) {
        return undefined;
    }

    if (status !== "UPCOMING" && status !== "ACTIVE" && status !== "CLOSED") {
        throw new AppError("Academic year status must be UPCOMING, ACTIVE, or CLOSED", 400, "VALIDATION_ERROR");
    }

    return status;
};

const parseDate = (value: unknown, fieldName: string) => {
    if (typeof value !== "string" || !value.trim()) {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new AppError(`${fieldName} must be a valid date`, 400, "VALIDATION_ERROR");
    }

    return date;
};

type AcademicYearRecord = {
    id: string;
    name: string;
    startDate: string | Date;
    endDate: string | Date;
    status: string;
};

export class AcademicYearService {
    async listAcademicYears(
        tenantDb: {
            academicYear: {
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
            ];
        }
        if (options.status) {
            where.status = options.status;
        }

        const [total, items] = await Promise.all([
            tenantDb.academicYear.count({ where }) as Promise<number>,
            tenantDb.academicYear.findMany({
                where,
                orderBy: { startDate: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                },
            }) as Promise<AcademicYearRecord[]>,
        ]);

        return {
            items,
            total,
            page,
            pageSize,
        };
    }

    async getAcademicYear(
        tenantDb: {
            academicYear: {
                findUnique: (args: unknown) => Promise<unknown>;
            };
        },
        academicYearId: string,
    ): Promise<AcademicYearRecord> {
        const academicYear = await tenantDb.academicYear.findUnique({
            where: { id: academicYearId },
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
            },
        }) as AcademicYearRecord | null;

        if (!academicYear) {
            throw new AppError("Academic year not found in this tenant", 404, "NOT_FOUND");
        }

        return academicYear;
    }

    async createAcademicYear(
        tenantDb: {
            academicYear: {
                findUnique: (args: unknown) => Promise<unknown>;
                findFirst: (args: unknown) => Promise<unknown>;
                create: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<AcademicYearRecord> {
        const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
        const startDate = parseDate(input.startDate, "Start date");
        const endDate = parseDate(input.endDate, "End date");
        const status = normalizeStatus(input.status ?? "ACTIVE");

        if (!name) {
            throw new AppError("Academic year name is required", 400, "VALIDATION_ERROR");
        }

        if (endDate < startDate) {
            throw new AppError("End date must be after start date", 400, "VALIDATION_ERROR");
        }

        const existingByName = await tenantDb.academicYear.findUnique({
            where: { name },
            select: { id: true },
        }) as { id: string } | null;

        if (existingByName) {
            throw new AppError("An academic year with this name already exists", 409, "DUPLICATE_RESOURCE");
        }

        if (status === "ACTIVE") {
            const overlap = await tenantDb.academicYear.findFirst({
                where: {
                    status: "ACTIVE",
                    AND: [
                        { startDate: { lte: endDate } },
                        { endDate: { gte: startDate } },
                    ],
                },
                select: { id: true, name: true },
            }) as { id: string; name: string } | null;

            if (overlap) {
                throw new AppError(`Active academic year overlap detected with ${overlap.name}`, 409, "DUPLICATE_RESOURCE");
            }
        }

        const academicYear = await tenantDb.academicYear.create({
            data: {
                name,
                startDate,
                endDate,
                status: status ?? "ACTIVE",
            },
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
            },
        }) as AcademicYearRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "academicYear.created",
                entityType: "academic_year",
                entityId: academicYear.id,
                metadata: {
                    academicYearId: academicYear.id,
                    name: academicYear.name,
                    status: academicYear.status,
                },
            },
        });

        return academicYear;
    }

    async updateAcademicYear(
        tenantDb: {
            academicYear: {
                findUnique: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
                findFirst: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        academicYearId: string,
        input: Record<string, unknown>,
    ): Promise<AcademicYearRecord> {
        const academicYear = await tenantDb.academicYear.findUnique({
            where: { id: academicYearId },
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
            },
        }) as AcademicYearRecord | null;

        if (!academicYear) {
            throw new AppError("Academic year not found in this tenant", 404, "NOT_FOUND");
        }

        const nextData: Record<string, unknown> = {};

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
            if (!name) {
                throw new AppError("Academic year name is required", 400, "VALIDATION_ERROR");
            }
            if (name !== academicYear.name) {
                const existing = await tenantDb.academicYear.findUnique({
                    where: { name },
                    select: { id: true },
                }) as { id: string } | null;
                if (existing) {
                    throw new AppError("An academic year with this name already exists", 409, "DUPLICATE_RESOURCE");
                }
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "startDate")) {
            const startDate = parseDate(input.startDate, "Start date");
            nextData.startDate = startDate;
        }

        if (Object.prototype.hasOwnProperty.call(input, "endDate")) {
            const endDate = parseDate(input.endDate, "End date");
            nextData.endDate = endDate;
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const status = normalizeStatus(input.status);
            if (status) {
                nextData.status = status;
            }
        }

        const startDate = nextData.startDate ? new Date(String(nextData.startDate)) : new Date(academicYear.startDate);
        const endDate = nextData.endDate ? new Date(String(nextData.endDate)) : new Date(academicYear.endDate);
        if (endDate < startDate) {
            throw new AppError("End date must be after start date", 400, "VALIDATION_ERROR");
        }

        const nextStatus = String(nextData.status ?? academicYear.status).toUpperCase();
        if (nextStatus === "ACTIVE") {
            const overlap = await tenantDb.academicYear.findFirst({
                where: {
                    id: { not: academicYearId },
                    status: "ACTIVE",
                    AND: [
                        { startDate: { lte: endDate } },
                        { endDate: { gte: startDate } },
                    ],
                },
                select: { id: true, name: true },
            }) as { id: string; name: string } | null;

            if (overlap) {
                throw new AppError(`Active academic year overlap detected with ${overlap.name}`, 409, "DUPLICATE_RESOURCE");
            }
        }

        const updatedAcademicYear = await tenantDb.academicYear.update({
            where: { id: academicYearId },
            data: nextData,
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                status: true,
            },
        }) as AcademicYearRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "academicYear.updated",
                entityType: "academic_year",
                entityId: updatedAcademicYear.id,
                metadata: {
                    academicYearId: updatedAcademicYear.id,
                    changes: Object.keys(nextData),
                },
            },
        });

        return updatedAcademicYear;
    }
}
