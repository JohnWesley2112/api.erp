import { AppError } from "../../errors/app.error.js";

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    INSTITUTION_ADMIN: [
        "institution.read",
        "institution.manage",
        "student.read",
        "student.create",
        "student.update",
        "teacher.read",
        "teacher.create",
        "teacher.update",
        "academic.read",
        "academic.manage",
        "user.read",
        "user.manage",
        "role.read",
        "role.manage",
        "attendance.read",
        "attendance.mark",
        "attendance.submit",
        "audit.read",
    ],
    CAMPUS_ADMIN: [
        "student.read",
        "student.create",
        "student.update",
        "teacher.read",
        "academic.read",
        "user.read",
        "attendance.read",
        "attendance.mark",
        "attendance.submit",
    ],
    TEACHER: [
        "student.read",
        "teacher.read",
        "academic.read",
        "attendance.read",
        "attendance.mark",
        "attendance.submit",
    ],
};

interface PermissionRecord {
    id: string;
    code: string;
    description: string | null;
}

interface RoleRecord {
    id: string;
    name: string;
    description?: string | null;
    rolePermissions?: Array<{ permission: { code: string } }>;
}

interface UserRoleAssignment {
    roleId: string;
}

interface TenantIamDatabase {
    role: {
        findMany(args: unknown): Promise<RoleRecord[]>;
        findUnique(args: unknown): Promise<Pick<RoleRecord, "id" | "name"> | null>;
    };
    permission: {
        findMany(args: unknown): Promise<PermissionRecord[]>;
        findUnique(args: unknown): Promise<PermissionRecord | null>;
    };
    rolePermission: {
        findMany(args: unknown): Promise<Array<{ role: Pick<RoleRecord, "id" | "name"> }>>;
        upsert(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<{ count: number }>;
    };
    userProfile: {
        findUnique(args: unknown): Promise<{
            id: string;
            userRoles: UserRoleAssignment[];
        } | null>;
    };
    userRole: {
        findMany(args: unknown): Promise<UserRoleAssignment[]>;
    };
    $transaction<T>(operation: (transaction: TenantIamDatabase) => Promise<T>): Promise<T>;
}

interface EffectivePermissionInput {
    userId: string;
    tenantDb?: unknown;
}

interface HasPermissionInput extends EffectivePermissionInput {
    permission: string;
}

interface ChangeRolePermissionInput {
    tenantDb?: unknown;
    actorUserId: string;
    roleId: string;
    permissionCode: string;
    granted: boolean;
}

const ROLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

const getTenantDatabase = (tenantDb: unknown): TenantIamDatabase => {
    if (!tenantDb || typeof tenantDb !== "object") {
        throw new AppError("Tenant database context is required", 401, "UNAUTHORIZED");
    }

    return tenantDb as TenantIamDatabase;
};

export class IamService {
    async getAllRoles(tenantDb: unknown): Promise<string[]> {
        const db = getTenantDatabase(tenantDb);
        const roles = await db.role.findMany({
            orderBy: { name: "asc" },
            select: { name: true },
        });
        return roles.map((role) => role.name);
    }

    async getAllPermissions(tenantDb: unknown): Promise<PermissionRecord[]> {
        const db = getTenantDatabase(tenantDb);
        return db.permission.findMany({
            orderBy: { code: "asc" },
            select: { id: true, code: true, description: true },
        });
    }

    async getRolePermissionMatrix(tenantDb: unknown, actorUserId: string) {
        const db = getTenantDatabase(tenantDb);
        const [roles, permissions, profile] = await Promise.all([
            db.role.findMany({
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    rolePermissions: { select: { permission: { select: { code: true } } } },
                },
            }),
            db.permission.findMany({
                orderBy: { code: "asc" },
                select: { id: true, code: true, description: true },
            }),
            db.userProfile.findUnique({
                where: { userId: actorUserId },
                select: { userRoles: { select: { roleId: true } } },
            }),
        ]);
        const actorRoleIds = new Set(profile?.userRoles.map((assignment) => assignment.roleId) ?? []);

        return {
            roles: roles.map((role) => ({
                id: role.id,
                name: role.name,
                description: role.description ?? null,
                permissionCodes: (role.rolePermissions ?? []).map(({ permission }) => permission.code).sort(),
                isAssignedToCurrentUser: actorRoleIds.has(role.id),
            })),
            permissions,
        };
    }

    async getAllPermissionsWithRoles(tenantDb: unknown, actorUserId: string) {
        return this.getRolePermissionMatrix(tenantDb, actorUserId);
    }

    async getAllRolePermissions(tenantDb: unknown, actorUserId: string) {
        return this.getRolePermissionMatrix(tenantDb, actorUserId);
    }

    async getAllUserPermissions(userId: string, tenantDb: unknown): Promise<string[]> {
        return this.getEffectivePermissions({ userId, tenantDb });
    }

    async getPermissionWithRoles(permissionId: string, tenantDb: unknown) {
        if (!ROLE_ID_PATTERN.test(permissionId)) {
            throw new AppError("Permission id is invalid", 400, "VALIDATION_ERROR");
        }

        const db = getTenantDatabase(tenantDb);
        const permission = await db.permission.findUnique({
            where: { id: permissionId },
            select: { id: true, code: true, description: true },
        });
        if (!permission) {
            throw new AppError("Permission not found", 404, "NOT_FOUND");
        }

        const assignments = await db.rolePermission.findMany({
            where: { permissionId },
            select: { role: { select: { id: true, name: true } } },
        });
        return { ...permission, roles: assignments.map(({ role }) => role) };
    }

    async changeRolePermission({
        tenantDb,
        actorUserId,
        roleId,
        permissionCode,
        granted,
    }: ChangeRolePermissionInput) {
        if (!ROLE_ID_PATTERN.test(roleId)) {
            throw new AppError("Role id is invalid", 400, "VALIDATION_ERROR");
        }
        if (!PERMISSION_CODE_PATTERN.test(permissionCode) || permissionCode.length > 100) {
            throw new AppError("Permission code is invalid", 400, "VALIDATION_ERROR");
        }

        const db = getTenantDatabase(tenantDb);
        return db.$transaction(async (transaction) => {
            const [role, permission, actorProfile] = await Promise.all([
                transaction.role.findUnique({
                    where: { id: roleId },
                    select: { id: true, name: true },
                }),
                transaction.permission.findUnique({
                    where: { code: permissionCode },
                    select: { id: true, code: true, description: true },
                }),
                transaction.userProfile.findUnique({
                    where: { userId: actorUserId },
                    select: { userRoles: { select: { roleId: true } } },
                }),
            ]);

            if (!role) {
                throw new AppError("Role not found", 404, "NOT_FOUND");
            }
            if (!permission) {
                throw new AppError("Permission not found", 404, "NOT_FOUND");
            }
            if (!actorProfile) {
                throw new AppError("User profile not found", 403, "FORBIDDEN");
            }
            if (actorProfile.userRoles.some((assignment) => assignment.roleId === role.id)) {
                throw new AppError("You cannot change permissions for a role assigned to your account", 403, "FORBIDDEN");
            }

            if (
                permission.code === "role.manage" &&
                ((granted && role.name !== "INSTITUTION_ADMIN") ||
                    (!granted && role.name === "INSTITUTION_ADMIN"))
            ) {
                throw new AppError("The built-in role management policy cannot be changed", 403, "FORBIDDEN");
            }

            if (granted) {
                await transaction.rolePermission.upsert({
                    where: {
                        roleId_permissionId: {
                            roleId: role.id,
                            permissionId: permission.id,
                        },
                    },
                    update: {},
                    create: { roleId: role.id, permissionId: permission.id },
                });
            } else {
                await transaction.rolePermission.deleteMany({
                    where: { roleId: role.id, permissionId: permission.id },
                });
            }

            return {
                roleId: role.id,
                permissionCode: permission.code,
                granted,
            };
        });
    }

    private async loadRolePermissions(tenantDb: TenantIamDatabase, roleIds: string[]): Promise<Set<string>> {
        const permissions = new Set<string>();
        if (!roleIds.length) {
            return permissions;
        }

        const roles = await tenantDb.role.findMany({
            where: { id: { in: roleIds } },
            include: { rolePermissions: { include: { permission: true } } },
        });

        for (const role of roles) {
            for (const rolePermission of role.rolePermissions ?? []) {
                if (rolePermission.permission?.code) {
                    permissions.add(rolePermission.permission.code);
                }
            }
        }

        return permissions;
    }

    async getEffectivePermissions({ userId, tenantDb }: EffectivePermissionInput): Promise<string[]> {
        const db = getTenantDatabase(tenantDb);
        const profile = await db.userProfile.findUnique({
            where: { userId },
            select: { id: true },
        });
        if (!profile) {
            return [];
        }

        const assignments = await db.userRole.findMany({
            where: { userId: profile.id },
            select: { roleId: true },
        });
        if (!assignments.length) {
            return [];
        }

        const permissions = await this.loadRolePermissions(
            db,
            assignments.map((assignment) => assignment.roleId),
        );
        return [...permissions].sort();
    }

    async hasPermission({ userId, tenantDb, permission }: HasPermissionInput): Promise<boolean> {
        const permissions = await this.getEffectivePermissions({ userId, tenantDb });
        return permissions.includes(permission);
    }
}
