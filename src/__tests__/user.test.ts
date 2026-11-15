import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateAccessToken } from "../helpers/jwt-helper.js";

const {
    mockAdminUserFindUnique,
    mockAdminUserFindMany,
    mockAdminUserCount,
    mockAdminUserCreate,
    mockAdminUserUpdate,
    mockMembershipFindMany,
    mockMembershipFindFirst,
    mockMembershipCreate,
    mockMembershipUpdateMany,
    mockTenantFindUnique,
    mockTenantDbUserProfileCreate,
    mockTenantDbUserProfileFindUnique,
    mockTenantDbUserProfileFindMany,
    mockTenantDbUserProfileUpdate,
    mockTenantDbUserRoleCreate,
    mockTenantDbUserRoleFindFirst,
    mockTenantDbUserRoleFindMany,
    mockTenantDbRoleFindFirst,
    mockTenantDbRoleFindMany,
    mockTenantDbAuditLogCreate,
    mockAdminTenantDatabaseConfigFindUnique,
} = vi.hoisted(() => ({
    mockAdminUserFindUnique: vi.fn(),
    mockAdminUserFindMany: vi.fn(),
    mockAdminUserCount: vi.fn(),
    mockAdminUserCreate: vi.fn(),
    mockAdminUserUpdate: vi.fn(),
    mockMembershipFindMany: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockMembershipCreate: vi.fn(),
    mockMembershipUpdateMany: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTenantDbUserProfileCreate: vi.fn(),
    mockTenantDbUserProfileFindUnique: vi.fn(),
    mockTenantDbUserProfileFindMany: vi.fn(),
    mockTenantDbUserProfileUpdate: vi.fn(),
    mockTenantDbUserRoleCreate: vi.fn(),
    mockTenantDbUserRoleFindFirst: vi.fn(),
    mockTenantDbUserRoleFindMany: vi.fn(),
    mockTenantDbRoleFindFirst: vi.fn(),
    mockTenantDbRoleFindMany: vi.fn(),
    mockTenantDbAuditLogCreate: vi.fn(),
    mockAdminTenantDatabaseConfigFindUnique: vi.fn(),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => {
    const buildTenantDb = () => ({
        userProfile: {
            findUnique: mockTenantDbUserProfileFindUnique,
            findMany: mockTenantDbUserProfileFindMany,
            update: mockTenantDbUserProfileUpdate,
            create: mockTenantDbUserProfileCreate,
        },
        userRole: {
            findFirst: mockTenantDbUserRoleFindFirst,
            findMany: mockTenantDbUserRoleFindMany,
            create: mockTenantDbUserRoleCreate,
        },
        role: {
            findFirst: mockTenantDbRoleFindFirst,
            findMany: mockTenantDbRoleFindMany,
        },
        auditLog: {
            create: mockTenantDbAuditLogCreate,
        },
    });

    return {
        createAdminPrismaClient: vi.fn(() => ({
            user: {
                findUnique: mockAdminUserFindUnique,
                findMany: mockAdminUserFindMany,
                count: mockAdminUserCount,
                create: mockAdminUserCreate,
                update: mockAdminUserUpdate,
            },
            userTenantMembership: {
                findMany: mockMembershipFindMany,
                findFirst: mockMembershipFindFirst,
                create: mockMembershipCreate,
                updateMany: mockMembershipUpdateMany,
            },
            tenant: {
                findUnique: mockTenantFindUnique,
            },
            tenantDatabaseConfig: {
                findUnique: mockAdminTenantDatabaseConfigFindUnique,
            },
        })),
        createTenantPrismaClient: vi.fn(buildTenantDb),
        tenantConnectionManager: { getClient: vi.fn(buildTenantDb) },
    };
});

describe("Phase 6 user management", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";
        mockAdminUserFindUnique.mockReset();
        mockAdminUserFindMany.mockReset();
        mockAdminUserCount.mockReset();
        mockAdminUserCreate.mockReset();
        mockAdminUserUpdate.mockReset();
        mockMembershipFindMany.mockReset();
        mockMembershipFindFirst.mockReset();
        mockMembershipCreate.mockReset();
        mockMembershipUpdateMany.mockReset();
        mockTenantFindUnique.mockReset();
        mockTenantDbUserProfileCreate.mockReset();
        mockTenantDbUserProfileFindUnique.mockReset();
        mockTenantDbUserProfileFindMany.mockReset();
        mockTenantDbUserProfileUpdate.mockReset();
        mockTenantDbUserRoleCreate.mockReset();
        mockTenantDbUserRoleFindFirst.mockReset();
        mockTenantDbUserRoleFindMany.mockReset();
        mockTenantDbRoleFindFirst.mockReset();
        mockTenantDbRoleFindMany.mockReset();
        mockTenantDbAuditLogCreate.mockReset();
        mockAdminTenantDatabaseConfigFindUnique.mockReset();
        process.env.TENANT_DB_PASSWORD = "test-tenant-db-password";

        mockAdminTenantDatabaseConfigFindUnique.mockResolvedValue({
            id: "tdc-1",
            tenantId: 1,
            databaseName: "tenant_db",
            host: "localhost",
            port: 5432,
            username: "tenant_user",
            passwordSecretRef: "TENANT_DB_PASSWORD",
            status: "ACTIVE",
        });

        mockTenantFindUnique.mockResolvedValue({ id: 1, name: "Alpha School", status: "ACTIVE" });
        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
        });
        mockAdminUserUpdate.mockResolvedValue({
            id: "user-2",
            status: "ACTIVE",
        });
        mockMembershipUpdateMany.mockResolvedValue({ count: 1 });
        mockTenantDbUserProfileUpdate.mockResolvedValue({
            id: "profile-2",
            userId: "user-2",
            status: "ACTIVE",
        });
        mockTenantDbUserProfileFindUnique.mockResolvedValue({
            id: "profile-1",
            userId: "user-1",
            displayName: "Ada Lovelace",
            status: "ACTIVE",
            userRoles: [
                { id: "ur-1", roleId: "role-1", role: { id: "role-1", name: "INSTITUTION_ADMIN" } },
            ],
        });

        mockTenantDbUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-1",
                role: { id: "role-1", name: "INSTITUTION_ADMIN" },
            },
        ]);
        mockTenantDbRoleFindMany.mockResolvedValue([
            {
                id: "role-1",
                name: "INSTITUTION_ADMIN",
                rolePermissions: [
                    { permission: { code: "user.read" } },
                    { permission: { code: "user.manage" } },
                ],
            },
        ]);
        mockTenantDbRoleFindFirst.mockResolvedValue({
            id: "role-teacher",
            name: "TEACHER",
        });
    });

    it("allows an authorized user to list tenant users", async () => {
        mockMembershipFindMany.mockResolvedValue([
            {
                userId: "user-1",
                tenantId: 1,
                status: "ACTIVE",
                tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
            },
            {
                userId: "user-2",
                tenantId: 1,
                status: "ACTIVE",
                tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
            },
        ]);
        mockAdminUserCount.mockResolvedValue(2);

        mockAdminUserFindMany.mockResolvedValue([
            {
                id: "user-1",
                email: "user@example.com",
                firstName: "Ada",
                lastName: "Lovelace",
                status: "ACTIVE",
            },
            {
                id: "user-2",
                email: "teacher@example.com",
                firstName: "Jane",
                lastName: "Teacher",
                status: "ACTIVE",
            },
        ]);

        mockTenantDbUserProfileFindMany.mockResolvedValue([
            {
                id: "profile-1",
                userId: "user-1",
                displayName: "Ada Lovelace",
                status: "ACTIVE",
                userRoles: [{ id: "ur-1", roleId: "role-1", role: { name: "INSTITUTION_ADMIN" } }],
            },
            {
                id: "profile-2",
                userId: "user-2",
                displayName: "Jane Teacher",
                status: "ACTIVE",
                userRoles: [{ id: "ur-2", roleId: "role-2", role: { name: "TEACHER" } }],
            },
        ]);

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        const response = await request(app)
            .get("/api/users")
            .query({ page: 1, pageSize: 10 })
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0].id).toBe("user-1");
        expect(response.body.data[0].profile.roles[0].role).toBe("INSTITUTION_ADMIN");
        expect(mockTenantDbUserProfileFindMany).toHaveBeenCalledTimes(1);
    });

    it("lists inactive tenant members with their roles for reactivation", async () => {
        mockMembershipFindMany.mockResolvedValue([
            { userId: "user-1", tenantId: 1, status: "ACTIVE" },
            { userId: "user-2", tenantId: 1, status: "INACTIVE" },
        ]);
        mockAdminUserFindMany.mockImplementation(({ where }: { where: { status?: string; id: { in: string[] } } }) => {
            if (where.status === "INACTIVE") {
                return Promise.resolve([{ id: "user-2" }]);
            }
            return Promise.resolve([{
                id: "user-2",
                email: "inactive@example.com",
                firstName: "Inactive",
                lastName: "User",
                status: "INACTIVE",
            }]);
        });
        mockAdminUserCount.mockResolvedValue(1);
        mockTenantDbUserProfileFindMany.mockResolvedValue([{
            id: "profile-2",
            userId: "user-2",
            displayName: "Inactive User",
            status: "INACTIVE",
            userRoles: [{ id: "ur-2", roleId: "role-2", role: { name: "TEACHER" } }],
        }]);

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });
        const response = await request(app)
            .get("/api/users")
            .query({ status: "INACTIVE" })
            .set("Authorization", `******;

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].status).toBe("INACTIVE");
        expect(response.body.data[0].profile.roles[0].role).toBe("TEACHER");
    });

    it("reactivates an inactive user membership", async () => {
        mockMembershipFindFirst.mockImplementation(({ where }: { where: { userId: string } }) =>
            Promise.resolve({
                id: `membership-${where.userId}`,
                userId: where.userId,
                tenantId: 1,
                status: where.userId === "user-2" ? "INACTIVE" : "ACTIVE",
                tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
            }));

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });
        const response = await request(app)
            .post("/api/users/user-2/activate")
            .set("Authorization", `******;

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("ACTIVE");
        expect(mockMembershipUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "ACTIVE" },
        }));
        expect(mockTenantDbUserProfileUpdate).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "ACTIVE" },
        }));
    });

    it("rejects a cross-tenant user detail lookup", async () => {
        mockAdminUserFindUnique.mockResolvedValue({
            id: "user-2",
            email: "other@example.com",
            firstName: "Other",
            lastName: "User",
            status: "ACTIVE",
        });

        // The permission-check middleware resolves the requester's own profile (user-1);
        // only the target user's profile lookup (user-2) should be missing.
        mockTenantDbUserProfileFindUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
            where.userId === "user-2"
                ? Promise.resolve(null)
                : Promise.resolve({
                    id: "profile-1",
                    userId: "user-1",
                    displayName: "Ada Lovelace",
                    status: "ACTIVE",
                    userRoles: [
                        { id: "ur-1", roleId: "role-1", role: { id: "role-1", name: "INSTITUTION_ADMIN" } },
                    ],
                }));

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        const response = await request(app)
            .get("/api/users/user-2")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });

    it("rejects duplicate email creation", async () => {
        mockAdminUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "existing@example.com",
            firstName: "Existing",
            lastName: "User",
            status: "ACTIVE",
        });

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        const response = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${token}`)
            .send({
                email: "existing@example.com",
                firstName: "New",
                lastName: "User",
                role: "TEACHER",
            });

        expect(response.status).toBe(409);
    });

    it("creates a user and assigns a valid role in the tenant scope", async () => {
        mockAdminUserFindUnique.mockResolvedValue(null);
        mockAdminUserCreate.mockResolvedValue({
            id: "user-3",
            email: "new@example.com",
            firstName: "New",
            lastName: "User",
            status: "ACTIVE",
        });
        mockMembershipCreate.mockResolvedValue({
            id: "membership-3",
            userId: "user-3",
            tenantId: 1,
            status: "ACTIVE",
        });
        mockTenantDbUserProfileCreate.mockResolvedValue({
            id: "profile-3",
            userId: "user-3",
            displayName: "New User",
        });
        mockTenantDbRoleFindMany.mockResolvedValue([
            {
                id: "role-teacher",
                name: "TEACHER",
                rolePermissions: [
                    { permission: { code: "user.read" } },
                    { permission: { code: "user.manage" } },
                ],
            },
        ]);
        mockTenantDbUserRoleCreate.mockResolvedValue({
            id: "user-role-3",
            userId: "user-3",
            roleId: "role-teacher",
        });

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        const response = await request(app)
            .post("/api/users")
            .set("Authorization", `Bearer ${token}`)
            .send({
                email: "new@example.com",
                firstName: "New",
                lastName: "User",
                role: "TEACHER",
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mockAdminUserCreate).toHaveBeenCalled();
        expect(mockTenantDbUserProfileCreate).toHaveBeenCalled();
        expect(mockTenantDbUserRoleCreate).toHaveBeenCalled();
    });
});
