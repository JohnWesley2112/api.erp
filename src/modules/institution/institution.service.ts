import { AppError } from "../../errors/app.error.js";
import type { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";

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

const isValidEmail = (value?: string | null) => {
    if (!value) {
        return true;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const isValidPhone = (value?: string | null) => {
    if (!value) {
        return true;
    }

    return /^[0-9+()\-\s]{7,20}$/.test(value);
};

type InstitutionRecord = {
    id: string;
    name: string;
    code: string;
    email: string | null;
    phone: string | null;
    address: string | null;
};

export class InstitutionService {
    async getInstitution(tenantDb: {
        institution: {
            findFirst: (args: unknown) => Promise<unknown>;
        };
    }): Promise<InstitutionRecord> {
        const institution = await tenantDb.institution.findFirst({
            select: {
                id: true,
                name: true,
                code: true,
                email: true,
                phone: true,
                address: true,
            },
        }) as InstitutionRecord | null;

        if (!institution) {
            throw new AppError("Institution not found for this tenant", 404, "NOT_FOUND");
        }

        return institution;
    }

    async updateInstitution(
        tenantDb: {
            institution: {
                findFirst: (args: unknown) => Promise<unknown>;
                update: (args: unknown) => Promise<unknown>;
            };
            auditLog: {
                create: (args: { data: { actorUserId: string; action: string; entityType: string; entityId: string | null; metadata: Prisma.InputJsonValue } }) => Promise<unknown>;
            };
        },
        actorUserId: string,
        input: Record<string, unknown>,
    ): Promise<InstitutionRecord> {
        const allowedFields = new Set(["name", "email", "phone", "address"]);
        const updates = Object.entries(input).filter(([key]) => allowedFields.has(key));

        if (!updates.length) {
            throw new AppError("No valid institution fields were provided for update", 400, "VALIDATION_ERROR");
        }

        const currentInstitution = await this.getInstitution(tenantDb);
        const nextData: Record<string, string | null> = {};

        if (Object.prototype.hasOwnProperty.call(input, "name")) {
            const name = sanitizeText(typeof input.name === "string" ? input.name : undefined, 200);
            if (!name) {
                throw new AppError("Institution name is required", 400, "VALIDATION_ERROR");
            }
            nextData.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(input, "email")) {
            const email = sanitizeText(typeof input.email === "string" ? input.email : undefined, 255);
            if (email && !isValidEmail(email)) {
                throw new AppError("Institution email must be a valid email address", 400, "VALIDATION_ERROR");
            }
            nextData.email = email ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(input, "phone")) {
            const phone = sanitizeText(typeof input.phone === "string" ? input.phone : undefined, 50);
            if (phone && !isValidPhone(phone)) {
                throw new AppError("Institution phone number is invalid", 400, "VALIDATION_ERROR");
            }
            nextData.phone = phone ?? null;
        }

        if (Object.prototype.hasOwnProperty.call(input, "address")) {
            const address = sanitizeText(typeof input.address === "string" ? input.address : undefined, 2000);
            nextData.address = address ?? null;
        }

        const updatedInstitution = await tenantDb.institution.update({
            where: { id: currentInstitution.id },
            data: nextData,
            select: {
                id: true,
                name: true,
                code: true,
                email: true,
                phone: true,
                address: true,
            },
        }) as InstitutionRecord;

        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action: "institution.updated",
                entityType: "institution",
                entityId: updatedInstitution.id,
                metadata: {
                    changes: Object.keys(nextData),
                    institutionId: updatedInstitution.id,
                },
            },
        });

        return updatedInstitution;
    }
}
