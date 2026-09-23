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
    mockTenantCampusFindMany,
    mockTenantCampusFindUnique,
    mockTenantCampusCreate,
    mockTenantCampusUpdate,
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
    mockTenantCampusFindMany: vi.fn(),
    mockTenantCampusFindUnique: vi.fn(),
    mockTenantCampusCreate: vi.fn(),
    mockTenantCampusUpdate: vi.fn(),
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
        campus: {
            findMany: mockTenantCampusFindMany,
            findUnique: mockTenantCampusFindUnique,
            findFirst: vi.fn(),
            count: vi.fn(),
            create: mockTenantCampusCreate,
            update: mockTenantCampusUpdate,
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
            campus: {
                findMany: mockTenantCampusFindMany,
                findUnique: mockTenantCampusFindUnique,
                findFirst: vi.fn(),
                count: vi.fn(),
                create: mockTenantCampusCreate,
                update: mockTenantCampusUpdate,
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

describe("Phase 7 institution and campus management", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";

        mockAdminMembershipFindFirst.mockReset();
        mockAdminTenantFindUnique.mockReset();
        mockAdminTenantDatabaseConfigFindUnique.mockReset();
        mockTenantInstitutionFindFirst.mockReset();
        mockTenantInstitutionUpdate.mockReset();
        mockTenantCampusFindMany.mockReset();
        mockTenantCampusFindUnique.mockReset();
        mockTenantCampusCreate.mockReset();
        mockTenantCampusUpdate.mockReset();
        mockTenantUserProfileFindUnique.mockReset();
        mockTenantUserRoleFindMany.mockReset();
        mockTenantRoleFindMany.mockReset();
        mockTenantAuditLogCreate.mockReset();
        process.env.TENANT_DB_PASSWORD = "test-tenant-db-password";

        mockAdminTenantDatabaseConfigFindUnique.mockResolvedValue({
            id: "tdc-1",
            tenantId: "tenant-1",
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
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "St. Mary Institution", status: "ACTIVE" },
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
            campusId: null,
            userRoles: [
                {
                    id: "ur-1",
                    roleId: "role-1",
                    campusId: null,
                    role: { id: "role-1", name: "INSTITUTION_ADMIN" },
                },
            ],
        });

        mockTenantUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-1",
                campusId: null,
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
                    { permission: { code: "campus.read" } },
                    { permission: { code: "campus.manage" } },
                ],
            },
        ]);

        mockTenantAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    });

    it("retrieves the current tenant institution", async () => {
        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

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

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

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
            campusId: null,
            userRoles: [
                {
                    id: "ur-1",
                    roleId: "role-2",
                    campusId: null,
                    role: { id: "role-2", name: "TEACHER" },
                },
            ],
        });

        mockTenantUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-1",
                userId: "user-1",
                roleId: "role-2",
                campusId: null,
                role: { id: "role-2", name: "TEACHER" },
            },
        ]);

        mockTenantRoleFindMany.mockResolvedValue([
            {
                id: "role-2",
                name: "TEACHER",
                rolePermissions: [
                    { permission: { code: "campus.read" } },
                ],
            },
        ]);

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .patch("/api/institution")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Changed" });

        expect(response.status).toBe(403);
    });

    it("rejects invalid institution field data", async () => {
        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .patch("/api/institution")
            .set("Authorization", `Bearer ${token}`)
            .send({ code: "bad code" });

        expect(response.status).toBe(400);
    });

    it("lists campuses within the current tenant", async () => {
        mockTenantCampusFindMany.mockResolvedValue([
            { id: "campus-1", institutionId: "institution-1", name: "Bangalore Campus", code: "BLR", address: "Bangalore", status: "ACTIVE" },
            { id: "campus-2", institutionId: "institution-1", name: "Raichur Campus", code: "RCR", address: "Raichur", status: "ACTIVE" },
        ]);

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .get("/api/campuses")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBe(2);
    });

    it("returns a tenant-scoped campus detail", async () => {
        mockTenantCampusFindUnique.mockResolvedValue({
            id: "campus-1",
            institutionId: "institution-1",
            name: "Bangalore Campus",
            code: "BLR",
            address: "Bangalore",
            status: "ACTIVE",
        });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .get("/api/campuses/campus-1")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.data.code).toBe("BLR");
    });

    it("creates a campus for the current tenant", async () => {
        mockTenantCampusCreate.mockResolvedValue({
            id: "campus-3",
            institutionId: "institution-1",
            name: "Mangalore Campus",
            code: "MLR",
            address: "Mangalore",
            status: "ACTIVE",
        });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .post("/api/campuses")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Mangalore Campus", code: "MLR", address: "Mangalore" });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mockTenantCampusCreate).toHaveBeenCalled();
    });

    it("updates a campus and records an audit entry", async () => {
        mockTenantCampusFindUnique.mockResolvedValue({
            id: "campus-1",
            institutionId: "institution-1",
            name: "Bangalore Campus",
            code: "BLR",
            address: "Bangalore",
            status: "ACTIVE",
        });
        mockTenantCampusUpdate.mockResolvedValue({
            id: "campus-1",
            institutionId: "institution-1",
            name: "Bangalore Main Campus",
            code: "BLR",
            address: "Bangalore",
            status: "ACTIVE",
        });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .patch("/api/campuses/campus-1")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Bangalore Main Campus" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockTenantAuditLogCreate).toHaveBeenCalled();
    });

    it("rejects duplicate campus code in the same institution", async () => {
        mockTenantCampusCreate.mockRejectedValue({ code: "P2002" });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .post("/api/campuses")
            .set("Authorization", `Bearer ${token}`)
            .send({ name: "Bangalore Campus", code: "BLR", address: "Bangalore" });

        expect(response.status).toBe(409);
    });

    it("denies a campus admin outside their assigned campus scope", async () => {
        mockTenantUserProfileFindUnique.mockResolvedValue({
            id: "profile-1",
            userId: "user-1",
            campusId: null,
            userRoles: [
                {
                    id: "ur-2",
                    roleId: "role-3",
                    campusId: "campus-1",
                    role: { id: "role-3", name: "CAMPUS_ADMIN" },
                },
            ],
        });

        mockTenantUserRoleFindMany.mockResolvedValue([
            {
                id: "ur-2",
                userId: "user-1",
                roleId: "role-3",
                campusId: "campus-1",
                role: { id: "role-3", name: "CAMPUS_ADMIN" },
            },
        ]);

        mockTenantRoleFindMany.mockResolvedValue([
            {
                id: "role-3",
                name: "CAMPUS_ADMIN",
                rolePermissions: [
                    { permission: { code: "campus.read" } },
                    { permission: { code: "campus.manage" } },
                ],
            },
        ]);

        mockTenantCampusFindUnique.mockResolvedValue({
            id: "campus-2",
            institutionId: "institution-1",
            name: "Raichur Campus",
            code: "RCR",
            address: "Raichur",
            status: "ACTIVE",
        });

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .get("/api/campuses/campus-2")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
    });

    it("returns 404 for a campus id not in the current tenant", async () => {
        mockTenantCampusFindUnique.mockResolvedValue(null);

        const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

        const response = await request(app)
            .get("/api/campuses/tenant-b-campus")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(404);
    });
});
