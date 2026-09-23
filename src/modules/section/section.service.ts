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

    if (status !== "ACTIVE" && status !== "INACTIVE") {
        throw new AppError("Section status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
    }

    return status;
};

type SectionRecord = {
    id: string;
    academicYearId: string;
    campusId: string;
    classId: string;
    name: string;
    status: string;
};

export class SectionService {
    async listSections(
        tenantDb: {
            section: {
                findMany: (args: unknown) => Promise<unknown>;
                count: (args: unknown) => Promise<unknown>;
            };
        },
        options: { page?: number; pageSize?: number; academicYearId?: string; campusId?: string; classId?: string; search?: string; status?: string } = {},
    ) {
        const page = Number(options.page ?? 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const where: Record<string, unknown> = {};

        if (options.academicYearId) {
            where.academicYearId = options.academicYearId;
        }
        if (options.campusId) {
            where.campusId = options.campusId;
        }
        if (options.classId) {
            where.classId = options.classId;
        }
        if (options.search) {
            where.name = { contains: options.search, mode: "insensitive" };
        }
        if (options.status) {
            where.status = options.status;
        }

        const [total, items] = await Promise.all([
            tenantDb.section.count({ where }) as Promise<number>,
            tenantDb.section.findMany({
                where,
                orderBy: { name: "asc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    academicYearId: true,
                    campusId: true,
                    classId: true,
                    name: true,
                    status: true,
                },
            }) as Promise<SectionRecord[]>,
        ]);

        return { items, total, page, pageSize };
    }

    async getSection(
        tenantDb: {
            section: {
                findUnique: (args: unknown) => Promise<unknown>;
            };
        },
        sectionId: string,
    ): Promise<SectionRecord> {
        const section = await tenantDb.section.findUnique({
            where: { id: sectionId },
            select: {
                id: true,
                academicYearId: true,
                campusId: true,
                classId: true,
                name: true,
                status: true,
            },
        }) as SectionRecord | null;

        if (!section) {
            throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        }

        return section;
    }

    async ensureAcademicYear(
        tenantDb: {
            academicYear: { findUnique: (args: unknown) => Promise<unknown> };
        },
        academicYearId: string,
    ) {
        const academicYear = await tenantDb.academicYear.findUnique({
            where: { id: academicYearId },
            select: { id: true },
        });

        if (!academicYear) {
            throw new AppError("Academic year not found in this tenant", 404, "NOT_FOUND");
        }
    }

    async ensureClass(
        tenantDb: {
            class: { findUnique: (args: unknown) => Promise<unknown> };
        },
        classId: string,
    ) {
        const item = await tenantDb.class.findUnique({
            where: { id: classId },
            select: { id: true },
        });

        if (!item) {
            throw new AppError("Class not found in this tenant", 404, "NOT_FOUND");
        }
    }

    async ensureCampus(
        tenantDb: {
            campus: { findUnique: (args: unknown) => Promise<unknown> };
        },
        campusId: string,
    ) {
        const campus = await tenantDb.campus.findUnique({
            where: { id: campusId },
            select: { id: true },
        });

        if (!campus) {
            throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        }
    }

    async createSection(
        tenantDb: {
            academicYear: { findUnique: (args: unknown) => Promise<unknown> };
            campus: { findUnique: (args: unknown) => Promise<unknown> };
            class: { findUnique: (args: unknown) => Promise<unknown> };
            section: {
                findUnique: (args: unknown) => Promise<unknown>;
                create: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<SectionRecord> {
        const academicYearId = typeof input.academicYearId === "string" ? input.academicYearId : undefined;
        const campusId = typeof input.campusId === "string" ? input.campusId : undefined;
        const classId = typeof input.classId === "string" ? input.classId : undefined;
        const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
        const status = normalizeStatus(input.status ?? "ACTIVE");

        if (!academicYearId || !campusId || !classId) {
            throw new AppError("Academic year, campus, and class are required", 400, "VALIDATION_ERROR");
        }
        if (!name) {
            throw new AppError("Section name is required", 400, "VALIDATION_ERROR");
        }

        await this.ensureAcademicYear(tenantDb, academicYearId);
        await this.ensureCampus(tenantDb, campusId);
        await this.ensureClass(tenantDb, classId);

        const duplicate = await tenantDb.section.findUnique({
            where: {
                academicYearId_campusId_classId_name: {
                    academicYearId,
                    campusId,
                    classId,
                    name,
                },
            },
            select: { id: true },
        }) as { id: string } | null;

        if (duplicate) {
            throw new AppError("A section with this academic year, campus, class, and name already exists", 409, "DUPLICATE_RESOURCE");
        }

        const section = await tenantDb.section.create({
            data: {
                academicYearId,
                campusId,
                classId,
                name,
                status: status ?? "ACTIVE",
            },
            select: {
                id: true,
                academicYearId: true,
                campusId: true,
                classId: true,
                name: true,
                status: true,
            },
        }) as SectionRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "section.created",
                entityType: "section",
                entityId: section.id,
                metadata: {
                    sectionId: section.id,
                    academicYearId: section.academicYearId,
                    campusId: section.campusId,
                    classId: section.classId,
                    name: section.name,
                },
            },
        });

        return section;
    }

    async updateSection(
        tenantDb: {
            section: {
                findUnique: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
            };
            academicYear: { findUnique: (args: unknown) => Promise<unknown> };
            campus: { findUnique: (args: unknown) => Promise<unknown> };
            class: { findUnique: (args: unknown) => Promise<unknown> };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        sectionId: string,
        input: Record<string, unknown>,
    ): Promise<SectionRecord> {
        const section = await tenantDb.section.findUnique({
            where: { id: sectionId },
            select: {
                id: true,
                academicYearId: true,
                campusId: true,
                classId: true,
                name: true,
                status: true,
            },
        }) as SectionRecord | null;

        if (!section) {
            throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        }

        const nextData: Record<string, unknown> = {};

        if (Object.prototype.hasOwnProperty.call(input, "academicYearId")) {
            const academicYearId = typeof input.academicYearId === "string" ? input.academicYearId : undefined;
            if (!academicYearId) {
                throw new AppError("Academic year is required", 400, "VALIDATION_ERROR");
            }
            await this.ensureAcademicYear(tenantDb, academicYearId);
            nextData.academicYearId = academicYearId;
        }

        if (Object.prototype.hasOwnProperty.call(input, "campusId")) {
            const campusId = typeof input.campusId === "string" ? input.campusId : undefined;
            if (!campusId) {
                throw new AppError("Campus is required", 400, "VALIDATION_ERROR");
            }
            await this.ensureCampus(tenantDb, campusId);
            nextData.campusId = campusId;
        }

        if (Object.prototype.hasOwnProperty.call(input, "classId")) {
            const classId = typeof input.classId === "string" ? input.classId : undefined;
            if (!classId) {
                throw new AppError("Class is required", 400, "VALIDATION_ERROR");
            }
            await this.ensureClass(tenantDb, classId);
            nextData.classId = classId;
        }

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 100);
            if (!name) {
                throw new AppError("Section name is required", 400, "VALIDATION_ERROR");
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const status = normalizeStatus(input.status);
            if (status) {
                nextData.status = status;
            }
        }

        const finalAcademicYearId = String(nextData.academicYearId ?? section.academicYearId);
        const finalCampusId = String(nextData.campusId ?? section.campusId);
        const finalClassId = String(nextData.classId ?? section.classId);
        const finalName = String(nextData.name ?? section.name);

        const duplicate = await tenantDb.section.findUnique({
            where: {
                academicYearId_campusId_classId_name: {
                    academicYearId: finalAcademicYearId,
                    campusId: finalCampusId,
                    classId: finalClassId,
                    name: finalName,
                },
            },
            select: { id: true },
        }) as { id: string } | null;

        if (duplicate && duplicate.id !== section.id) {
            throw new AppError("A section with this academic year, campus, class, and name already exists", 409, "DUPLICATE_RESOURCE");
        }

        const updated = await tenantDb.section.update({
            where: { id: sectionId },
            data: nextData,
            select: {
                id: true,
                academicYearId: true,
                campusId: true,
                classId: true,
                name: true,
                status: true,
            },
        }) as SectionRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "section.updated",
                entityType: "section",
                entityId: updated.id,
                metadata: {
                    sectionId: updated.id,
                    changes: Object.keys(nextData),
                },
            },
        });

        return updated;
    }
}
