import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateAccessToken } from "../helpers/jwt-helper.js";

const {
    mockUserFindUnique,
    mockMembershipFindFirst,
    mockTenantFindUnique,
    mockTenantDatabaseConfigFindUnique,
    mockTenantUserProfileFindUnique,
    mockUserRoleFindMany,
    mockRoleFindMany,
} = vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTenantDatabaseConfigFindUnique: vi.fn(),
    mockTenantUserProfileFindUnique: vi.fn(),
    mockUserRoleFindMany: vi.fn(),
    mockRoleFindMany: vi.fn(),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => ({
    createAdminPrismaClient: vi.fn(() => ({
        user: { findUnique: mockUserFindUnique },
        userTenantMembership: { findFirst: mockMembershipFindFirst },
        tenant: { findUnique: mockTenantFindUnique },
        tenantDatabaseConfig: { findUnique: mockTenantDatabaseConfigFindUnique },
    })),
    createTenantPrismaClient: vi.fn(() => ({
        userRole: { findMany: mockUserRoleFindMany },
        role: { findMany: mockRoleFindMany },
        userProfile: { findUnique: mockTenantUserProfileFindUnique },
        permission: { findMany: vi.fn() },
        rolePermission: { findMany: vi.fn() },
        teacher: { findUnique: vi.fn() },
        student: { findUnique: vi.fn() },
        section: { findUnique: vi.fn() },
        campus: { findUnique: vi.fn() },
    })),
    tenantConnectionManager: {
        getClient: vi.fn(() => ({
            userRole: { findMany: mockUserRoleFindMany },
            role: { findMany: mockRoleFindMany },
            userProfile: { findUnique: mockTenantUserProfileFindUnique },
            permission: { findMany: vi.fn() },
            rolePermission: { findMany: vi.fn() },
            teacher: { findUnique: vi.fn() },
            student: { findUnique: vi.fn() },
            section: { findUnique: vi.fn() },
            campus: { findUnique: vi.fn() },
        })),
    },
}));

describe("Phase 5 IAM authorization", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";
        mockUserFindUnique.mockReset();
        mockMembershipFindFirst.mockReset();
        mockTenantFindUnique.mockReset();
        mockTenantDatabaseConfigFindUnique.mockReset();
        mockUserRoleFindMany.mockReset();
        mockRoleFindMany.mockReset();
        process.env.TENANT_DB_PASSWORD = "test-tenant-db-password";

        mockTenantUserProfileFindUnique.mockResolvedValue({ id: "profile-1", userId: "user-1" });

        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            id: "tdc-1",
            tenantId: "tenant-1",
            databaseName: "tenant_db",
            host: "localhost",
            port: 5432,
            username: "tenant_user",
            passwordSecretRef: "TENANT_DB_PASSWORD",
            status: "ACTIVE",
        });

        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
        });

        mockTenantFindUnique.mockResolvedValue({ id: "tenant-1", name: "Alpha School" });
        mockRoleFindMany.mockResolvedValue([]);
    });

    it("allows a user with permission to access the protected check endpoint", async () => {
        mockUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-1",
                campusId: null,
                role: {
                    name: "INSTITUTION_ADMIN",
                },
            },
        ]);
        mockRoleFindMany.mockResolvedValue([
            {
                id: "role-1",
                name: "INSTITUTION_ADMIN",
                rolePermissions: [
                    { permission: { code: "student.read" } },
                    { permission: { code: "student.create" } },
                ],
            },
        ]);

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        const response = await request(app)
            .get("/api/iam/check")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.permissions).toContain("student.read");
    });

    it("rejects a user lacking the required permission", async () => {
        mockUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-2",
                userId: "user-1",
                roleId: "role-2",
                campusId: null,
                role: {
                    name: "TEACHER",
                },
            },
        ]);
        mockRoleFindMany.mockResolvedValue([
            {
                id: "role-2",
                name: "TEACHER",
                rolePermissions: [
                    { permission: { code: "academic.read" } },
                ],
            },
        ]);

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        const response = await request(app)
            .get("/api/iam/check")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
    });

    it("denies cross-campus access when the actual resource campus is outside the user's scope", async () => {
        const tenantDb = {
            userRole: {
                findMany: vi.fn().mockResolvedValue([
                    {
                        id: "ur-3",
                        userId: "user-1",
                        roleId: "role-3",
                        campusId: "campus-a",
                        role: { name: "CAMPUS_ADMIN" },
                    },
                ]),
            },
            role: {
                findMany: vi.fn().mockResolvedValue([
                    {
                        id: "role-3",
                        name: "CAMPUS_ADMIN",
                        rolePermissions: [
                            { permission: { code: "student.read" } },
                        ],
                    },
                ]),
            },
        };

        const iamService = new (await import("../modules/iam/iam.service.js")).IamService();
        const allowed = await iamService.hasPermission({
            userId: "user-1",
            tenantDb,
            permission: "student.read",
            resourceCampusId: "campus-b",
        });

        expect(allowed).toBe(false);
    });

    it("returns 401 when no token is supplied", async () => {
        const response = await request(app).get("/api/iam/check");
        expect(response.status).toBe(401);
    });
});
