import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateAccessToken } from "../helpers/jwt-helper.js";

const {
    mockAdminMembershipFindFirst,
    mockAdminTenantFindUnique,
    mockAdminTenantDatabaseConfigFindUnique,
    mockTenantInstitutionFindFirst,
    mockTenantInstitutionUpdate,
    mockTenantUserProfileFindUnique,
    mockTenantUserRoleFindMany,
    mockTenantRoleFindMany,
    mockTenantAuditLogCreate,
} = vi.hoisted(() => ({
    mockAdminMembershipFindFirst: vi.fn(),
    mockAdminTenantFindUnique: vi.fn(),
    mockAdminTenantDatabaseConfigFindUnique: vi.fn(),
    mockTenantInstitutionFindFirst: vi.fn(),
    mockTenantInstitutionUpdate: vi.fn(),
    mockTenantUserProfileFindUnique: vi.fn(),
    mockTenantUserRoleFindMany: vi.fn(),
    mockTenantRoleFindMany: vi.fn(),
    mockTenantAuditLogCreate: vi.fn(),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => ({
    createAdminPrismaClient: vi.fn(() => ({
        userTenantMembership: {
            findFirst: mockAdminMembershipFindFirst,
        },
        tenant: {
            findUnique: mockAdminTenantFindUnique,
        },
        tenantDatabaseConfig: {
            findUnique: mockAdminTenantDatabaseConfigFindUnique,
        },
    })),
    createTenantPrismaClient: vi.fn(() => ({
        institution: {
            findFirst: mockTenantInstitutionFindFirst,
            update: mockTenantInstitutionUpdate,
        },
        userProfile: {
            findUnique: mockTenantUserProfileFindUnique,
        },
        userRole: {
            findMany: mockTenantUserRoleFindMany,
        },
        role: {
            findMany: mockTenantRoleFindMany,
        },
        auditLog: {
            create: mockTenantAuditLogCreate,
        },
    })),
    tenantConnectionManager: {
        getClient: vi.fn(() => ({
            institution: {
                findFirst: mockTenantInstitutionFindFirst,
                update: mockTenantInstitutionUpdate,
            },
            userProfile: {
                findUnique: mockTenantUserProfileFindUnique,
            },
            userRole: {
                findMany: mockTenantUserRoleFindMany,
            },
            role: {
                findMany: mockTenantRoleFindMany,
            },
            auditLog: {
                create: mockTenantAuditLogCreate,
            },
        })),
    },
}));

describe("Phase 7 institution management", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";

        mockAdminMembershipFindFirst.mockReset();
        mockAdminTenantFindUnique.mockReset();
        mockAdminTenantDatabaseConfigFindUnique.mockReset();
        mockTenantInstitutionFindFirst.mockReset();
        mockTenantInstitutionUpdate.mockReset();
        mockTenantUserProfileFindUnique.mockReset();
        mockTenantUserRoleFindMany.mockReset();
        mockTenantRoleFindMany.mockReset();
        mockTenantAuditLogCreate.mockReset();
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

        mockAdminMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "St. Mary Institution", status: "ACTIVE" },
        });

        mockTenantInstitutionFindFirst.mockResolvedValue({
            id: "institution-1",
            name: "St. Mary Institution",
            code: "STMARY",
            email: "admin@stmary.edu",
            phone: "9876543210",
            address: "Bangalore",
        });

        mockTenantUserProfileFindUnique.mockResolvedValue({
            id: "profile-1",
            userId: "user-1",
            userRoles: [
                {
                    id: "ur-1",
                    roleId: "role-1",
                    role: { id: "role-1", name: "INSTITUTION_ADMIN" },
                },
            ],
        });

        mockTenantUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-1",
                role: { id: "role-1", name: "INSTITUTION_ADMIN" },
            },
        ]);

        mockTenantRoleFindMany.mockResolvedValue([
            {
                id: "role-1",
                name: "INSTITUTION_ADMIN",
                rolePermissions: [
                    { permission: { code: "institution.read" } },
                    { permission: { code: "institution.manage" } },
                ],
            },
        ]);

        mockTenantAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    });

    it("retrieves the current tenant institution", async () => {
        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: 1 });

        const response = await request(app)
            .get("/api/institution")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe("St. Mary Institution");
    });

    it("updates the institution with allowed fields", async () => {
        mockTenantInstitutionUpdate.mockResolvedValue({
            id: "institution-1",
            name: "St. Mary Institution",
            code: "STMARY",
            email: "new@stmary.edu",
            phone: "9988776655",
            address: "Bangalore",
        });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: 1 });

        const response = await request(app)
            .patch("/api/institution")
            .set("Authorization", `Bearer ${token}`)
            .send({
                email: "new@stmary.edu",
                phone: "9988776655",
                address: "Bangalore",
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockTenantInstitutionUpdate).toHaveBeenCalled();
    });

    it("rejects institution update without institution.manage permission", async () => {
        mockTenantUserProfileFindUnique.mockResolvedValue({
            id: "profile-1",
            userId: "user-1",
            userRoles: [
                {
                    id: "ur-1",
                    roleId: "role-2",
                    role: { id: "role-2", name: "TEACHER" },
                },
            ],
        });

        mockTenantUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-2",
                role: { id: "role-2", name: "TEACHER" },
            },
        ]);

        mockTenantRoleFindMany.mockResolvedValue([
            {
                id: "role-2",
                name: "TEACHER",
                rolePermissions: [
                ],
            },
        ]);

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: 1 });

        const response = await request(app)
            .patch("/api/institution")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Changed" });

        expect(response.status).toBe(403);
    });

    it("rejects invalid institution field data", async () => {
        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: 1 });

        const response = await request(app)
            .patch("/api/institution")
            .set("Authorization", `Bearer ${token}`)
            .send({ code: "bad code" });

        expect(response.status).toBe(400);
    });

    it("no longer exposes a separate campus API (Tenant is the campus)", async () => {
        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: 1 });

        const response = await request(app)
            .get("/api/campuses")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });
});
