import bcrypt from "bcrypt";
import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";
import { createAdminPrismaClient, createTenantPrismaClient } from "../../infrastructure/database/tenant-connection-manager.js";

const adminPrisma = createAdminPrismaClient();

interface UserListOptions {
    search?: string;
    page?: number;
    pageSize?: number;
    status?: string;
}

interface UserRoleAssignmentInput {
    role: string;
}

export class UserService {
    private normalizeEmail(value: string): string {
        return value.trim().toLowerCase();
    }

    private requireTenantDb(tenantDb: unknown): ReturnType<typeof createTenantPrismaClient> {
        if (!tenantDb || typeof tenantDb !== "object" || !("userProfile" in tenantDb)) {
            throw new AppError("Tenant database context is required", 401, "UNAUTHORIZED");
        }

        return tenantDb as ReturnType<typeof createTenantPrismaClient>;
    }

    private async writeAudit(
        tenantDb: ReturnType<typeof createTenantPrismaClient>,
        actorUserId: string,
        action: string,
        entityType: string,
        entityId: string | null,
        metadata: Record<string, unknown>,
    ) {
        await tenantDb.auditLog.create({
            data: {
                actorUserId,
                action,
                entityType,
                entityId: entityId ?? null,
                metadata: metadata as Prisma.InputJsonValue,
            },
        });
    }

    private async ensureTenantMembership(
        tenantId: number,
        userId: string,
        allowInactive = false,
    ) {
        const membership = await adminPrisma.userTenantMembership.findFirst({
            where: {
                userId,
                tenantId,
            },
            include: {
                tenant: true,
            },
        });

        if (!membership || !membership.tenant) {
            throw new AppError("User not found in this tenant", 404, "NOT_FOUND");
        }

        if (!allowInactive && membership.status !== "ACTIVE") {
            throw new AppError("Tenant membership is inactive", 403, "TENANT_ACCESS_DENIED");
        }

        if (membership.tenant.status !== "ACTIVE") {
            throw new AppError("Tenant is inactive", 403, "TENANT_INACTIVE");
        }

        return membership;
    }

    private async resolveProfile(tenantDb: ReturnType<typeof createTenantPrismaClient>, userId: string) {
        const profile = await tenantDb.userProfile.findUnique({
            where: { userId },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        if (!profile) {
            throw new AppError("User profile not found in this tenant", 404, "NOT_FOUND");
        }

        return profile;
    }

    private async getActorRoleNames(tenantDb: ReturnType<typeof createTenantPrismaClient>, userId: string): Promise<string[]> {
        const profile = await this.resolveProfile(tenantDb, userId);
        return profile.userRoles.map((assignment) => assignment.role?.name).filter(Boolean) as string[];
    }

    private async canAssignRole(
        tenantDb: ReturnType<typeof createTenantPrismaClient>,
        actorUserId: string,
        requestedRoleName: string,
    ): Promise<boolean> {
        const actorRoleNames = await this.getActorRoleNames(tenantDb, actorUserId);

        if (actorRoleNames.includes("INSTITUTION_ADMIN")) {
            return true;
        }

        if (requestedRoleName === "INSTITUTION_ADMIN") {
            return false;
        }

        return actorRoleNames.includes("CAMPUS_ADMIN");
    }

    async findAll(tenantId: number, options: UserListOptions = {}, tenantDbInput: unknown) {
        const page = Number(options.page ?? 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const search = options.search?.trim();

        const memberships = await adminPrisma.userTenantMembership.findMany({
            where: { tenantId },
            select: {
                userId: true,
                status: true,
            },
        });

        const membershipStatusByUserId = new Map(
            memberships.map((membership) => [membership.userId, membership.status]),
        );
        let userIds = memberships.map((membership) => membership.userId);

        if (options.status === "ACTIVE") {
            userIds = memberships
                .filter((membership) => membership.status === "ACTIVE")
                .map((membership) => membership.userId);
        } else if (options.status === "INACTIVE") {
            const inactiveAccounts = await adminPrisma.user.findMany({
                where: {
                    id: { in: userIds },
                    status: "INACTIVE",
                },
                select: { id: true },
            });
            userIds = [...new Set([
                ...memberships
                    .filter((membership) => membership.status === "INACTIVE")
                    .map((membership) => membership.userId),
                ...inactiveAccounts.map((user) => user.id),
            ])];
        }

        if (!userIds.length) {
            return {
                items: [],
                total: 0,
                page,
                pageSize,
            };
        }

        const where: Record<string, unknown> = {
            id: { in: userIds },
        };

        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];
        }

        if (options.status && options.status !== "INACTIVE") {
            where.status = options.status;
        }

        const [total, users] = await Promise.all([
            adminPrisma.user.count({ where }),
            adminPrisma.user.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                },
            }),
        ]);

        const tenantDb = this.requireTenantDb(tenantDbInput);
        const profiles = await tenantDb.userProfile.findMany({
            where: {
                userId: { in: users.map((user) => user.id) },
            },
            include: {
                userRoles: {
                    include: {
                        role: true,
                    },
                },
            },
        });

        const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));

        return {
            items: users.map((user) => {
                const profile = profileMap.get(user.id);
                const membershipStatus = membershipStatusByUserId.get(user.id) ?? "INACTIVE";
                return {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    status: membershipStatus === "INACTIVE" || user.status === "INACTIVE"
                        ? "INACTIVE"
                        : user.status,
                    membershipStatus,
                    profile: profile
                        ? {
                            id: profile.id,
                            displayName: profile.displayName,
                            status: profile.status,
                            roles: profile.userRoles.map((assignment) => ({
                                id: assignment.id,
                                roleId: assignment.roleId,
                                role: assignment.role.name,
                            })),
                        }
                        : null,
                };
            }),
            total,
            page,
            pageSize,
        };
    }

    async findById(tenantId: number, userId: string, tenantDbInput: unknown) {
        await this.ensureTenantMembership(tenantId, userId);

        const user = await adminPrisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
            },
        });

        if (!user) {
            throw new AppError("User not found", 404, "NOT_FOUND");
        }

        const tenantDb = this.requireTenantDb(tenantDbInput);
        const profile = await this.resolveProfile(tenantDb, userId);

        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            status: user.status,
            profile: {
                id: profile.id,
                userId: profile.userId,
                displayName: profile.displayName,
                status: profile.status,
                roles: profile.userRoles.map((assignment) => ({
                    id: assignment.id,
                    roleId: assignment.roleId,
                    role: assignment.role.name,
                })),
            },
        };
    }

    async getUserRoles(tenantId: number, userId: string, tenantDbInput: unknown) {
        await this.ensureTenantMembership(tenantId, userId, true);
        const tenantDb = this.requireTenantDb(tenantDbInput);
        const profile = await this.resolveProfile(tenantDb, userId);

        return profile.userRoles.map((assignment) => ({
            id: assignment.id,
            roleId: assignment.roleId,
            role: assignment.role.name,
        }));
    }

    async assignRole(
        tenantId: number,
        actorUserId: string,
        targetUserId: string,
        input: UserRoleAssignmentInput,
        tenantDbInput: unknown,
    ) {
        const requestedRoleName = input.role.trim().toUpperCase();
        if (!requestedRoleName) {
            throw new AppError("Role is required", 400, "VALIDATION_ERROR");
        }

        await this.ensureTenantMembership(tenantId, targetUserId, true);
        if (actorUserId === targetUserId) {
            throw new AppError("Self role changes are not allowed", 403, "FORBIDDEN");
        }

        const tenantDb = this.requireTenantDb(tenantDbInput);

        const actorCanAssign = await this.canAssignRole(
            tenantDb,
            actorUserId,
            requestedRoleName,
        );

        if (!actorCanAssign) {
            throw new AppError("You are not allowed to assign this role", 403, "FORBIDDEN");
        }

        const targetProfile = await this.resolveProfile(tenantDb, targetUserId);
        const roleRecord = await tenantDb.role.findFirst({
            where: { name: requestedRoleName },
        });

        if (!roleRecord) {
            throw new AppError("Role not found in this tenant", 404, "NOT_FOUND");
        }

        const existingAssignment = await tenantDb.userRole.findFirst({
            where: {
                userId: targetProfile.id,
                roleId: roleRecord.id,
            },
        });

        if (existingAssignment) {
            return {
                id: existingAssignment.id,
                roleId: existingAssignment.roleId,
                role: roleRecord.name,
            };
        }

        const createdAssignment = await tenantDb.userRole.create({
            data: {
                userId: targetProfile.id,
                roleId: roleRecord.id,
            },
        });

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "role.assigned",
            "role",
            roleRecord.id,
            {
                userId: targetUserId,
                role: roleRecord.name,
            },
        );

        return {
            id: createdAssignment.id,
            roleId: createdAssignment.roleId,
            role: roleRecord.name,
        };
    }

    async removeRole(tenantId: number, actorUserId: string, targetUserId: string, roleId: string, tenantDbInput: unknown) {
        await this.ensureTenantMembership(tenantId, targetUserId, true);
        if (actorUserId === targetUserId) {
            throw new AppError("Self role removal is not allowed", 403, "FORBIDDEN");
        }

        const tenantDb = this.requireTenantDb(tenantDbInput);
        const actorCanAssign = await this.canAssignRole(tenantDb, actorUserId, "INSTITUTION_ADMIN");
        if (!actorCanAssign) {
            throw new AppError("You are not allowed to remove this role", 403, "FORBIDDEN");
        }

        const targetProfile = await this.resolveProfile(tenantDb, targetUserId);
        const assignment = await tenantDb.userRole.findFirst({
            where: {
                id: roleId,
                userId: targetProfile.id,
            },
            include: {
                role: true,
            },
        });

        if (!assignment) {
            throw new AppError("Role assignment not found", 404, "NOT_FOUND");
        }

        await tenantDb.userRole.delete({
            where: { id: assignment.id },
        });

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "role.removed",
            "role",
            assignment.roleId,
            {
                userId: targetUserId,
                role: assignment.role.name,
            },
        );

        return {
            id: assignment.id,
            roleId: assignment.roleId,
            role: assignment.role.name,
        };
    }

    async create(
        tenantId: number,
        actorUserId: string,
        input: {
            email: string;
            firstName: string;
            lastName?: string;
            role?: string;
            password?: string;
        },
        tenantDbInput: unknown,
    ) {
        const email = this.normalizeEmail(input.email);
        const firstName = input.firstName.trim();
        const lastName = input.lastName?.trim() ?? "";
        const roleName = (input.role ?? "TEACHER").trim().toUpperCase();

        if (!email || !firstName) {
            throw new AppError("Email and first name are required", 400, "VALIDATION_ERROR");
        }

        const existingUser = await adminPrisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new AppError("A user with this email already exists", 409, "DUPLICATE_RESOURCE");
        }

        const tenantDb = this.requireTenantDb(tenantDbInput);

        const actorRoleNames = await this.getActorRoleNames(tenantDb, actorUserId);
        const actorIsInstitutionAdmin = actorRoleNames.includes("INSTITUTION_ADMIN");
        const actorIsCampusAdmin = actorRoleNames.includes("CAMPUS_ADMIN");

        if (!actorIsInstitutionAdmin && !actorIsCampusAdmin) {
            throw new AppError("You are not allowed to create users", 403, "FORBIDDEN");
        }

        if (roleName === "INSTITUTION_ADMIN" && !actorIsInstitutionAdmin) {
            throw new AppError("You are not allowed to assign this role", 403, "FORBIDDEN");
        }

        let createdUser: { id: string; email: string; firstName: string; lastName: string | null; status: "ACTIVE" | "INACTIVE" | "LOCKED" } | null = null;
        let createdProfile: { id: string; userId: string; displayName: string | null; status: string } | null = null;
        let createdAssignment: { id: string; roleId: string } | null = null;

        try {
            const passwordHash = await bcrypt.hash(
                input.password ?? "TempPassword123!",
                10,
            );

            createdUser = await adminPrisma.user.create({
                data: {
                    email,
                    passwordHash,
                    firstName,
                    lastName: lastName || null,
                    status: "ACTIVE",
                },
            });

            await adminPrisma.userTenantMembership.create({
                data: {
                    userId: createdUser.id,
                    tenantId,
                    status: "ACTIVE",
                },
            });

            await this.writeAudit(
                tenantDb,
                actorUserId,
                "membership.created",
                "membership",
                null,
                {
                    userId: createdUser.id,
                    tenantId,
                },
            );

            createdProfile = await tenantDb.userProfile.create({
                data: {
                    userId: createdUser.id,
                    displayName: [firstName, lastName].filter(Boolean).join(" ") || firstName,
                    status: "ACTIVE",
                },
            });

            const roleExists = await tenantDb.role.findFirst({
                where: { name: roleName },
            });

            if (roleExists) {
                createdAssignment = await tenantDb.userRole.create({
                    data: {
                        userId: createdProfile.id,
                        roleId: roleExists.id,
                    },
                });

                await this.writeAudit(
                    tenantDb,
                    actorUserId,
                    "role.assigned",
                    "role",
                    roleExists.id,
                    {
                        userId: createdUser.id,
                        role: roleExists.name,
                    },
                );
            } else {
                throw new AppError("Role not found for this tenant", 404, "NOT_FOUND");
            }

            await this.writeAudit(
                tenantDb,
                actorUserId,
                "user.created",
                "user",
                createdUser.id,
                {
                    email,
                    role: roleName,
                },
            );

            return {
                id: createdUser.id,
                email: createdUser.email,
                firstName: createdUser.firstName,
                lastName: createdUser.lastName,
                status: createdUser.status,
                profile: {
                    id: createdProfile.id,
                    userId: createdProfile.userId,
                    displayName: createdProfile.displayName,
                },
                role: roleName,
            };
        } catch (error) {
            if (createdAssignment) {
                await tenantDb.userRole.deleteMany({
                    where: {
                        userId: createdProfile?.id ?? "",
                        roleId: createdAssignment.roleId,
                    },
                });
            }

            if (createdProfile) {
                await tenantDb.userProfile.delete({
                    where: { id: createdProfile.id },
                });
            }

            if (createdUser) {
                await adminPrisma.userTenantMembership.deleteMany({
                    where: {
                        userId: createdUser.id,
                        tenantId,
                    },
                });
                await adminPrisma.user.delete({
                    where: { id: createdUser.id },
                });
            }

            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError("User creation failed", 500, "INTERNAL_ERROR");
        }
    }

    async updateUser(
        tenantId: number,
        actorUserId: string,
        userId: string,
        input: Record<string, unknown>,
        tenantDbInput: unknown,
    ) {
        const allowedFields = new Set(["firstName", "lastName", "status", "role"]);
        const updates = Object.entries(input).filter(([key]) => allowedFields.has(key));

        if (updates.length === 0) {
            throw new AppError("No valid user fields were provided for update", 400, "VALIDATION_ERROR");
        }

        await this.ensureTenantMembership(tenantId, userId);

        const adminUser = await adminPrisma.user.findUnique({ where: { id: userId } });
        if (!adminUser) {
            throw new AppError("User not found", 404, "NOT_FOUND");
        }

        const tenantDb = this.requireTenantDb(tenantDbInput);
        await this.resolveProfile(tenantDb, userId);

        const nextPayload: Record<string, unknown> = {};

        if (typeof input.firstName === "string" && input.firstName.trim()) {
            nextPayload.firstName = input.firstName.trim();
        }

        if (typeof input.lastName === "string") {
            nextPayload.lastName = input.lastName.trim();
        }

        if (typeof input.status === "string") {
            const normalizedStatus = input.status.toUpperCase();
            if (normalizedStatus !== "ACTIVE" && normalizedStatus !== "INACTIVE") {
                throw new AppError("User status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
            }
            nextPayload.status = normalizedStatus;
        }

        if (typeof input.role === "string" && input.role.trim()) {
            const normalizedRole = input.role.trim().toUpperCase();
            await this.assignRole(tenantId, actorUserId, userId, { role: normalizedRole }, tenantDb);
            nextPayload.role = normalizedRole;
        }

        if (Object.prototype.hasOwnProperty.call(nextPayload, "firstName") || Object.prototype.hasOwnProperty.call(nextPayload, "lastName")) {
            const updatedFirstName = typeof nextPayload.firstName === "string" ? nextPayload.firstName : adminUser.firstName;
            const updatedLastName = typeof nextPayload.lastName === "string" ? nextPayload.lastName : adminUser.lastName ?? "";
            await adminPrisma.user.update({
                where: { id: userId },
                data: {
                    firstName: updatedFirstName,
                    lastName: updatedLastName || null,
                },
            });
            await tenantDb.userProfile.update({
                where: { userId },
                data: {
                    displayName: [updatedFirstName, updatedLastName].filter(Boolean).join(" ") || updatedFirstName,
                },
            });
        }

        if (Object.prototype.hasOwnProperty.call(nextPayload, "status")) {
            const nextStatus = String(nextPayload.status);
            await adminPrisma.user.update({
                where: { id: userId },
                data: { status: nextStatus as "ACTIVE" | "INACTIVE" },
            });
            await adminPrisma.userTenantMembership.updateMany({
                where: { userId, tenantId },
                data: { status: nextStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE" },
            });
            await tenantDb.userProfile.update({
                where: { userId },
                data: { status: nextStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE" },
            });
            await this.writeAudit(
                tenantDb,
                actorUserId,
                nextStatus === "ACTIVE" ? "user.activated" : "user.deactivated",
                "user",
                userId,
                {
                    tenantId,
                    status: nextStatus,
                },
            );
        }

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "user.updated",
            "user",
            userId,
            {
                tenantId,
                changedFields: Object.keys(nextPayload),
            },
        );

        return this.findById(tenantId, userId, tenantDb);
    }

    async activateUser(tenantId: number, actorUserId: string, userId: string, tenantDbInput: unknown) {
        await this.ensureTenantMembership(tenantId, userId, true);
        const tenantDb = this.requireTenantDb(tenantDbInput);

        const updatedUser = await adminPrisma.user.update({
            where: { id: userId },
            data: { status: "ACTIVE" },
        });

        await adminPrisma.userTenantMembership.updateMany({
            where: { userId, tenantId },
            data: { status: "ACTIVE" },
        });

        await tenantDb.userProfile.update({
            where: { userId },
            data: { status: "ACTIVE" },
        });

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "user.activated",
            "user",
            userId,
            { tenantId },
        );

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "membership.activated",
            "membership",
            null,
            { userId, tenantId },
        );

        return {
            id: updatedUser.id,
            status: updatedUser.status,
        };
    }

    async deactivateUser(tenantId: number, actorUserId: string, userId: string, tenantDbInput: unknown) {
        await this.ensureTenantMembership(tenantId, userId);
        const tenantDb = this.requireTenantDb(tenantDbInput);

        const updatedUser = await adminPrisma.user.update({
            where: { id: userId },
            data: { status: "INACTIVE" },
        });

        await adminPrisma.userTenantMembership.updateMany({
            where: { userId, tenantId },
            data: { status: "INACTIVE" },
        });

        await tenantDb.userProfile.update({
            where: { userId },
            data: { status: "INACTIVE" },
        });

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "user.deactivated",
            "user",
            userId,
            { tenantId },
        );

        await this.writeAudit(
            tenantDb,
            actorUserId,
            "membership.deactivated",
            "membership",
            null,
            { userId, tenantId },
        );

        return {
            id: updatedUser.id,
            status: updatedUser.status,
        };
    }
}
