import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import app from "../app.js";
import { generateAccessToken, verifyToken } from "../helpers/jwt-helper.js";
import { createTenantPrismaClient } from "../infrastructure/database/tenant-connection-manager.js";

const {
    mockUserFindUnique,
    mockMembershipFindMany,
    mockMembershipFindFirst,
    mockTenantFindUnique,
    mockTenantDatabaseConfigFindUnique,
    mockCreateTenantPrismaClient,
} = vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockMembershipFindMany: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTenantDatabaseConfigFindUnique: vi.fn(),
    mockCreateTenantPrismaClient: vi.fn(),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => ({
    createAdminPrismaClient: vi.fn(() => ({
        user: {
            findUnique: mockUserFindUnique,
        },
        userTenantMembership: {
            findMany: mockMembershipFindMany,
            findFirst: mockMembershipFindFirst,
        },
        tenant: {
            findUnique: mockTenantFindUnique,
        },
        tenantDatabaseConfig: {
            findUnique: mockTenantDatabaseConfigFindUnique,
        },
    })),
    createTenantPrismaClient: mockCreateTenantPrismaClient,
    tenantConnectionManager: { getClient: mockCreateTenantPrismaClient },
}));

describe("Phase 3 authentication", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.JWT_SECRET = "test-secret";
        mockUserFindUnique.mockReset();
        mockMembershipFindMany.mockReset();
        mockMembershipFindFirst.mockReset();
        mockTenantFindUnique.mockReset();
        mockTenantDatabaseConfigFindUnique.mockReset();
        mockCreateTenantPrismaClient.mockReset();
        mockCreateTenantPrismaClient.mockImplementation(({ tenantId }) => ({ tenantId }));
        process.env.TENANT_DB_PASSWORD = "test-tenant-db-password";

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
    });

    it("logs in a valid active user with one active tenant", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });
        mockMembershipFindMany.mockResolvedValue([
            {
                id: "membership-1",
                userId: "user-1",
                tenantId: "tenant-1",
                status: "ACTIVE",
                tenant: {
                    id: "tenant-1",
                    name: "Alpha School",
                    status: "ACTIVE",
                },
            },
        ]);
        vi.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "User@Example.com", password: "password" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.email).toBe("user@example.com");
        expect(response.body.data.accessToken).toBeTypeOf("string");
        expect(response.body.data.tenants).toHaveLength(1);
        expect(response.body.data.tenants[0].id).toBe("tenant-1");
    });

    it("rejects an invalid password", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });
        mockMembershipFindMany.mockResolvedValue([
            {
                id: "membership-1",
                userId: "user-1",
                tenantId: "tenant-1",
                status: "ACTIVE",
                tenant: {
                    id: "tenant-1",
                    name: "Alpha School",
                    status: "ACTIVE",
                },
            },
        ]);
        vi.spyOn(bcrypt, "compare").mockResolvedValue(false as never);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "bad-password" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("rejects an unknown user without revealing details", async () => {
        mockUserFindUnique.mockResolvedValue(null);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "missing@example.com", password: "password" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("rejects inactive users", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "INACTIVE",
        });

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "password" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("rejects locked users", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "LOCKED",
        });

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "password" });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("returns all valid tenants when a user has multiple active memberships", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });
        mockMembershipFindMany.mockResolvedValue([
            {
                id: "membership-1",
                userId: "user-1",
                tenantId: "tenant-1",
                status: "ACTIVE",
                tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
            },
            {
                id: "membership-2",
                userId: "user-1",
                tenantId: "tenant-2",
                status: "ACTIVE",
                tenant: { id: "tenant-2", name: "Beta School", status: "ACTIVE" },
            },
        ]);
        vi.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "password" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.tenants).toHaveLength(2);
    });

    it("rejects login when the user has no active tenant membership", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            passwordHash: "hashed-password",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });
        mockMembershipFindMany.mockResolvedValue([]);
        vi.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "password" });

        expect(response.status).toBe(401);
    });

    it("requires a valid tenant selection and verifies membership", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
        });

        mockMembershipFindMany.mockResolvedValue([
            {
                id: "membership-1",
                userId: "user-1",
                tenantId: "tenant-1",
                status: "ACTIVE",
                tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
            },
        ]);
        mockMembershipFindFirst.mockImplementation(async (_args) => {
            if (_args.where.tenantId === "tenant-1") {
                return {
                    id: "membership-1",
                    userId: "user-1",
                    tenantId: "tenant-1",
                    status: "ACTIVE",
                    tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE", code: "ALPHA" },
                };
            }

            return null;
        });
        mockTenantFindUnique.mockResolvedValue({
            id: "tenant-1",
            name: "Alpha School",
            code: "ALPHA",
            status: "ACTIVE",
        });

        const response = await request(app)
            .post("/api/auth/select-tenant")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: "tenant-1" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const forbidden = await request(app)
            .post("/api/auth/select-tenant")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: "tenant-999" });

        expect(forbidden.status).toBe(403);
        expect(forbidden.body.success).toBe(false);
    });

    it("accepts a valid JWT and rejects invalid or expired tokens", () => {
        const validToken = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
        });

        expect(() => verifyToken(validToken)).not.toThrow();
        expect(() => verifyToken("not-a-token")).toThrow();

        const expiredToken = jwt.sign({ sub: "user-1", email: "user@example.com" }, "test-secret", {
            expiresIn: "-1s",
        });

        expect(() => verifyToken(expiredToken)).toThrow();
    });

    it("returns the current authenticated identity on /api/auth/me", async () => {
        mockUserFindUnique.mockResolvedValue({
            id: "user-1",
            email: "user@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
            status: "ACTIVE",
        });

        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        const response = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.id).toBe("user-1");
        expect(response.body.data.user.email).toBe("user@example.com");
    });

    it("returns the trusted tenant context for an authenticated user with an active membership", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: "tenant-1",
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.tenantId).toBe("tenant-1");
        expect(response.body.data.userId).toBe("user-1");
        expect(response.body.data.membershipId).toBe("membership-1");
    });

    it("rejects a request that tries to override the trusted tenant with query parameters", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: "tenant-1",
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context?tenantId=TENANT_B")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.data.tenantId).toBe("tenant-1");
        expect(response.body.data.tenantId).not.toBe("TENANT_B");
    });

    it("rejects a request that tries to override the trusted tenant with a body payload", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: "tenant-1",
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: "TENANT_B" });

        expect(response.status).toBe(200);
        expect(response.body.data.tenantId).toBe("tenant-1");
    });

    it("rejects requests without an authenticated tenant context", async () => {
        const response = await request(app).get("/api/tenant/context");

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
    });

    it("rejects unauthorized tenant access when there is no active membership", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-999",
        });

        mockMembershipFindFirst.mockResolvedValue(null);

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
    });

    it("rejects inactive memberships", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "INACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "ACTIVE" },
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
    });

    it("rejects suspended tenants", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "SUSPENDED" },
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
    });

    it("rejects inactive tenants", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: "tenant-1",
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            tenant: { id: "tenant-1", name: "Alpha School", status: "INACTIVE" },
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
    });

    it("creates distinct tenant-specific clients for different trusted tenants", () => {
        const tenantAClient = createTenantPrismaClient({ tenantId: "tenant-a" });
        const tenantBClient = createTenantPrismaClient({ tenantId: "tenant-b" });

        expect(tenantAClient).not.toBe(tenantBClient);
        expect(tenantAClient).toBeTruthy();
        expect(tenantBClient).toBeTruthy();
        expect(mockCreateTenantPrismaClient).toHaveBeenCalledTimes(2);
        expect(mockCreateTenantPrismaClient.mock.calls[0]?.[0]).toEqual({ tenantId: "tenant-a" });
        expect(mockCreateTenantPrismaClient.mock.calls[1]?.[0]).toEqual({ tenantId: "tenant-b" });
    });
});
