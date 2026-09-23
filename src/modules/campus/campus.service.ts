import { AppError } from "../../errors/app.error.js";
import type { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";

const sanitizeText = (value: string | undefined | null, maxLength?: number) => {
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

const isValidCampusStatus = (status: string | undefined) => {
    if (!status) {
        return true;
    }

    return status === "ACTIVE" || status === "INACTIVE";
};

const normalizeCampusCode = (value: string | undefined) => {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toUpperCase();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length > 100) {
        throw new AppError("Campus code exceeds the maximum length of 100 characters", 400, "VALIDATION_ERROR");
    }

    return normalized;
};

type CampusRecord = {
    id: string;
    institutionId: string;
    name: string;
    code: string;
    address: string | null;
    status: string;
};

export class CampusService {
    private async getCurrentInstitution(tenantDb: {
        institution: { findFirst: (args: unknown) => Promise<unknown> };
    }): Promise<{ id: string }> {
        const institution = await tenantDb.institution.findFirst({
            select: { id: true },
        }) as { id: string } | null;

        if (!institution) {
            throw new AppError("Institution not found for this tenant", 404, "NOT_FOUND");
        }

        return institution as { id: string };
    }

    private async ensureCampusScope(tenantDb: {
        userProfile: { findUnique: (args: unknown) => Promise<unknown> };
        userRole: { findMany: (args: unknown) => Promise<unknown[]> };
        role: { findMany: (args: unknown) => Promise<unknown[]> };
    }, userId: string, campusId: string) {
        const profile = await tenantDb.userProfile.findUnique({
            where: { userId },
            include: {
                userRoles: {
                    include: { role: true },
                },
            },
        }) as {
            userRoles?: Array<{ campusId?: string | null; role?: { name?: string | null } | null }>;
        } | null;

        const assignments = profile?.userRoles ?? [];
        const institutionAdmin = assignments.some((assignment) => assignment.role?.name === "INSTITUTION_ADMIN");
        if (institutionAdmin) {
            return;
        }

        const campusAssignments = assignments.filter((assignment) => assignment.role?.name === "CAMPUS_ADMIN");
        const isAssigned = campusAssignments.some((assignment) => assignment.campusId === campusId);
        if (!isAssigned) {
            throw new AppError("Campus access denied for this user", 403, "FORBIDDEN");
        }
    }

    async listCampuses(
        tenantDb: {
            institution: { findFirst: (args: unknown) => Promise<unknown> };
            campus: {
                findMany: (args: unknown) => Promise<unknown>;
                count: (args: unknown) => Promise<unknown>;
            };
            userProfile: { findUnique: (args: unknown) => Promise<unknown> };
            userRole: { findMany: (args: unknown) => Promise<unknown> };
        },
        actorUserId: string,
        options: { page?: number; pageSize?: number; search?: string; status?: string } = {},
    ) {
        const page = Number(options.page ?? 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const search = options.search?.trim();
        const institution = await this.getCurrentInstitution(tenantDb);

        const profile = await tenantDb.userProfile.findUnique({
            where: { userId: actorUserId },
            include: { userRoles: { include: { role: true } } },
        }) as { userRoles?: Array<{ campusId?: string | null; role?: { name?: string | null } | null }> } | null;

        const userRoles = profile?.userRoles ?? [];
        const isInstitutionAdmin = userRoles.some((assignment) => assignment.role?.name === "INSTITUTION_ADMIN");

        const baseWhere: Record<string, unknown> = { institutionId: institution.id };
        const scopeWhere: Record<string, unknown> = { ...baseWhere };

        if (!isInstitutionAdmin) {
            const campusIds = userRoles
                .filter((assignment) => assignment.role?.name === "CAMPUS_ADMIN" && assignment.campusId)
                .map((assignment) => assignment.campusId as string);

            if (campusIds.length === 0) {
                return { items: [], total: 0, page, pageSize };
            }

            scopeWhere.id = { in: campusIds };
        }

        if (search) {
            scopeWhere.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
            ];
        }

        if (options.status) {
            scopeWhere.status = options.status;
        }

        const [total, items] = await Promise.all([
            tenantDb.campus.count ? (tenantDb.campus.count({ where: scopeWhere }) as Promise<number>) : Promise.resolve(0),
            tenantDb.campus.findMany({
                where: scopeWhere,
                orderBy: { name: "asc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    institutionId: true,
                    name: true,
                    code: true,
                    address: true,
                    status: true,
                },
            }) as Promise<CampusRecord[]>,
        ]);

        return { items, total, page, pageSize };
    }

    async getCampus(tenantDb: {
        institution: { findFirst: (args: unknown) => Promise<unknown> };
        campus: { findUnique: (args: unknown) => Promise<unknown> };
    }, campusId: string): Promise<CampusRecord> {
        const institution = await this.getCurrentInstitution(tenantDb);
        const campus = await tenantDb.campus.findUnique({
            where: { id: campusId },
            select: {
                id: true,
                institutionId: true,
                name: true,
                code: true,
                address: true,
                status: true,
            },
        }) as { id: string; institutionId: string; name: string; code: string; address: string | null; status: string } | null;

        if (!campus) {
            throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        }

        if (campus.institutionId !== institution.id) {
            throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        }

        return campus;
    }

    async createCampus(
        tenantDb: {
            institution: { findFirst: (args: unknown) => Promise<unknown> };
            campus: {
                findFirst?: (args: unknown) => Promise<unknown>;
                create: (args: unknown) => Promise<unknown>;
            };
            auditLog: { create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown> };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<CampusRecord> {
        const institution = await this.getCurrentInstitution(tenantDb);
        const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 200);
        const code = normalizeCampusCode(typeof input.code === "string" ? input.code : undefined);
        const address = sanitizeText(typeof input.address === "string" ? input.address : undefined, 2000);
        const status = typeof input.status === "string" ? input.status.toUpperCase() : "ACTIVE";

        if (!name || !code) {
            throw new AppError("Campus name and code are required", 400, "VALIDATION_ERROR");
        }

        if (!isValidCampusStatus(status)) {
            throw new AppError("Campus status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
        }

        const duplicateCampus = tenantDb.campus.findFirst
            ? await tenantDb.campus.findFirst({
                where: {
                    institutionId: institution.id,
                    code,
                },
                select: { id: true },
            }) as { id: string } | null
            : null;

        if (duplicateCampus) {
            throw new AppError("A campus with this code already exists in this institution", 409, "DUPLICATE_RESOURCE");
        }

        const campus = await tenantDb.campus.create({
            data: {
                institutionId: institution.id,
                name,
                code,
                address: address ?? null,
                status,
            },
            select: {
                id: true,
                institutionId: true,
                name: true,
                code: true,
                address: true,
                status: true,
            },
        }) as CampusRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "campus.created",
                entityType: "campus",
                entityId: campus.id,
                metadata: {
                    campusId: campus.id,
                    name: campus.name,
                    code: campus.code,
                    status: campus.status,
                },
            },
        });

        return campus;
    }

    async updateCampus(
        tenantDb: {
            campus: {
                findUnique: (args: unknown) => Promise<unknown>;
                findFirst?: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
            };
            auditLog: { create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown> };
        },
        actorUserId: string,
        campusId: string,
        input: Record<string, unknown>,
    ): Promise<CampusRecord> {
        const allowedFields = new Set(["name", "code", "address", "status"]);
        const updates = Object.entries(input).filter(([key]) => allowedFields.has(key));

        if (!updates.length) {
            throw new AppError("No valid campus fields were provided for update", 400, "VALIDATION_ERROR");
        }

        const campus = await tenantDb.campus.findUnique({
            where: { id: campusId },
            select: {
                id: true,
                institutionId: true,
                name: true,
                code: true,
                address: true,
                status: true,
            },
        }) as { id: string; institutionId: string; name: string; code: string; address: string | null; status: string } | null;

        if (!campus) {
            throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        }

        const nextData: Record<string, string | null> = {};

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 200);
            if (!name) {
                throw new AppError("Campus name is required", 400, "VALIDATION_ERROR");
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "code")) {
            const code = normalizeCampusCode(typeof input.code === "string" ? input.code : undefined);
            if (!code) {
                throw new AppError("Campus code is required", 400, "VALIDATION_ERROR");
            }
            if (code !== campus.code) {
                const existingCampus = tenantDb.campus.findFirst
                    ? await tenantDb.campus.findFirst({
                        where: {
                            institutionId: campus.institutionId,
                            code,
                        },
                        select: { id: true },
                    }) as { id: string } | null
                    : null;
                if (existingCampus) {
                    throw new AppError("A campus with this code already exists in this institution", 409, "DUPLICATE_RESOURCE");
                }
            }
            nextData.code = code;
        }

        if (Object.prototype.hasOwnProperty.call(input, "address")) {
            const address = sanitizeText(typeof input.address === "string" ? input.address : undefined, 2000);
            nextData.address = address ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const status = typeof input.status === "string" ? input.status.toUpperCase() : undefined;
            if (!isValidCampusStatus(status)) {
                throw new AppError("Campus status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
            }
            nextData.status = status ?? campus.status;
        }

        const updatedCampus = await tenantDb.campus.update({
            where: { id: campusId },
            data: nextData,
            select: {
                id: true,
                institutionId: true,
                name: true,
                code: true,
                address: true,
                status: true,
            },
        }) as CampusRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: Object.prototype.hasOwnProperty.call(input, "status") ? "campus.status.updated" : "campus.updated",
                entityType: "campus",
                entityId: updatedCampus.id,
                metadata: {
                    campusId: updatedCampus.id,
                    changes: Object.keys(nextData),
                    status: updatedCampus.status,
                },
            },
        });

        return updatedCampus;
    }
}
