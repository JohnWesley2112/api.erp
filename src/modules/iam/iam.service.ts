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
        "campus.read",
        "campus.manage",
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
        "campus.read",
        "user.read",
        "attendance.read",
        "attendance.mark",
        "attendance.submit",
    ],
    TEACHER: [
        "student.read",
        "teacher.read",
        "academic.read",
        "campus.read",
        "attendance.read",
        "attendance.mark",
        "attendance.submit",
    ],
};

interface RolePermissionRecord {
    permission?: {
        code?: string | null;
    } | null;
}

interface RoleRecord {
    id?: string;
    name?: string;
    rolePermissions?: RolePermissionRecord[];
}

interface UserRoleAssignment {
    roleId: string;
    campusId?: string | null;
    role?: RoleRecord | null;
}

interface EffectivePermissionInput {
    userId: string;
    tenantDb?: unknown;
}

interface HasPermissionInput extends EffectivePermissionInput {
    permission: string;
    resourceCampusId?: string | null;
}

export class IamService {
    async getAllRoles() {
        return Object.keys(DEFAULT_ROLE_PERMISSIONS);
    }

    async getAllPermissions() {
        return [...new Set(Object.values(DEFAULT_ROLE_PERMISSIONS).flat())].sort();
    }

    async getAllPermissionsWithRoles() {
        return Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, permissions]) => ({
            role,
            permissions,
        }));
    }

    async getAllRolePermissions() {
        return this.getAllPermissionsWithRoles();
    }

    async getAllUserPermissions(userId: string | number) {
        void userId;
        return this.getAllPermissions();
    }

    async getPermissionWithRoles(permissionId: string | number) {
        void permissionId;
        return this.getAllPermissionsWithRoles();
    }

    private async loadRolePermissions(tenantDb: unknown, roleIds: string[]): Promise<Set<string>> {
        const permissions = new Set<string>();
        const tenantDbLike = tenantDb as {
            role?: {
                findMany: (args: unknown) => Promise<unknown[]>;
            };
        } | undefined;

        if (!roleIds.length || !tenantDbLike?.role) {
            return permissions;
        }

        const roles = (await tenantDbLike.role.findMany({
            where: { id: { in: roleIds } },
            include: {
                rolePermissions: {
                    include: {
                        permission: true,
                    },
                },
            },
        })) as RoleRecord[];

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
        const tenantDbLike = tenantDb as {
            userRole?: {
                findMany: (args: unknown) => Promise<unknown[]>;
            };
        } | undefined;

        const profileId = await this.resolveTenantUserProfileId(tenantDb, userId);

        if (!profileId) {
            return [];
        }

        const assignments = (await tenantDbLike?.userRole?.findMany?.({
            where: { userId: profileId },
            include: {
                role: true,
            },
        })) as UserRoleAssignment[] | undefined;

        if (!assignments?.length) {
            return [];
        }

        const roleIds = assignments.map((assignment) => assignment.roleId);
        const permissions = await this.loadRolePermissions(tenantDb, roleIds);

        return [...permissions].sort();
    }

    async hasPermission({ userId, tenantDb, permission, resourceCampusId }: HasPermissionInput): Promise<boolean> {
        const tenantDbLike = tenantDb as {
            userRole?: {
                findMany: (args: unknown) => Promise<unknown[]>;
            };
        } | undefined;

        const profileId = await this.resolveTenantUserProfileId(tenantDb, userId);

        if (!profileId) {
            return false;
        }

        const assignments = (await tenantDbLike?.userRole?.findMany?.({
            where: { userId: profileId },
            include: {
                role: true,
            },
        })) as UserRoleAssignment[] | undefined;

        if (!assignments?.length) {
            return false;
        }

        const permissions = await this.loadRolePermissions(
            tenantDb,
            assignments.map((assignment) => assignment.roleId),
        );

        if (!permissions.has(permission)) {
            return false;
        }

        if (!resourceCampusId) {
            return true;
        }

        return assignments.some((assignment) => {
            const roleName = assignment.role?.name;

            if (roleName === "INSTITUTION_ADMIN") {
                return true;
            }

            if (
                assignment.campusId === resourceCampusId &&
                (roleName === "CAMPUS_ADMIN" || roleName === "TEACHER")
            ) {
                return true;
            }

            return false;
        });
    }

    private async resolveTenantUserProfileId(
        tenantDb: unknown,
        userId: string,
    ): Promise<string | null> {
        const tenantDbLike = tenantDb as {
            userProfile?: {
                findUnique: (args: unknown) => Promise<{ id: string } | null>;
            };
        };

        if (!tenantDbLike.userProfile) {
            return null;
        }

        const profile = await tenantDbLike.userProfile.findUnique({
            where: { userId },
            select: { id: true },
        });

        return profile?.id ?? null;
    }
}
