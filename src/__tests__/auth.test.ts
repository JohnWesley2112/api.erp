import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import app from "../app.js";
import { env } from "../config/env.js";
import { generateAccessToken, verifyToken } from "../helpers/jwt-helper.js";
import { hashRefreshToken } from "../helpers/hash-helper.js";
import { createTenantPrismaClient } from "../infrastructure/database/tenant-connection-manager.js";

const {
    mockUserFindUnique,
    mockMembershipFindMany,
    mockMembershipFindFirst,
    mockTenantFindUnique,
    mockTenantDatabaseConfigFindUnique,
    mockCreateTenantPrismaClient,
    mockRefreshSessionCreate,
    mockRefreshSessionUpdateMany,
    mockRefreshSessionTokenCreate,
    mockRefreshSessionTokenFindUnique,
    mockRefreshSessionTokenUpdateMany,
    mockTransaction,
    mockLockRefreshSession,
} = vi.hoisted(() => ({
    mockUserFindUnique: vi.fn(),
    mockMembershipFindMany: vi.fn(),
    mockMembershipFindFirst: vi.fn(),
    mockTenantFindUnique: vi.fn(),
    mockTenantDatabaseConfigFindUnique: vi.fn(),
    mockCreateTenantPrismaClient: vi.fn(),
    mockRefreshSessionCreate: vi.fn(),
    mockRefreshSessionUpdateMany: vi.fn(),
    mockRefreshSessionTokenCreate: vi.fn(),
    mockRefreshSessionTokenFindUnique: vi.fn(),
    mockRefreshSessionTokenUpdateMany: vi.fn(),
    mockTransaction: vi.fn(),
    mockLockRefreshSession: vi.fn(),
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
        refreshSession: {
            updateMany: mockRefreshSessionUpdateMany,
        },
        refreshSessionToken: {
            findUnique: mockRefreshSessionTokenFindUnique,
        },
        $transaction: mockTransaction,
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
        mockRefreshSessionCreate.mockReset().mockResolvedValue({ id: "session-1" });
        mockRefreshSessionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
        mockRefreshSessionTokenCreate.mockReset().mockResolvedValue({ id: "refresh-token-1" });
        mockRefreshSessionTokenFindUnique.mockReset().mockResolvedValue(null);
        mockRefreshSessionTokenUpdateMany.mockReset().mockResolvedValue({ count: 1 });
        mockLockRefreshSession.mockReset().mockResolvedValue([]);
        mockTransaction.mockReset().mockImplementation((callback) => callback({
            refreshSession: {
                create: mockRefreshSessionCreate,
                updateMany: mockRefreshSessionUpdateMany,
            },
            refreshSessionToken: {
                create: mockRefreshSessionTokenCreate,
                findUnique: mockRefreshSessionTokenFindUnique,
                updateMany: mockRefreshSessionTokenUpdateMany,
            },
            userTenantMembership: {
                findFirst: mockMembershipFindFirst,
            },
            $queryRaw: mockLockRefreshSession,
        }));

        mockTenantDatabaseConfigFindUnique.mockResolvedValue({
            id: "tdc-1",
            tenantId: 1,
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
                tenantId: 1,
                status: "ACTIVE",
                tenant: {
                    id: 1,
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
        expect(response.body.data.tenants[0].id).toBe(1);
        expect(response.body.data).not.toHaveProperty("refreshToken");
        expect(jwt.decode(response.body.data.accessToken)).toMatchObject({ sid: "session-1", tenantId: 1 });
        expect(mockRefreshSessionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ userId: "user-1", selectedTenantId: 1, expiresAt: expect.any(Date) }),
        });
        const loginCookie = response.headers["set-cookie"]?.[0] ?? "";
        expect(loginCookie).toMatch(/;\s*HttpOnly/i);
        expect(loginCookie).toMatch(/;\s*Secure/i);
        expect(loginCookie).toMatch(new RegExp(`;\\s*SameSite=${env.refreshCookieSameSite}`, "i"));
        expect(loginCookie).toMatch(/;\s*Path=\/api/i);
        const rawRefreshToken = loginCookie.match(/systra_refresh_token=([^;]+)/)?.[1];
        expect(rawRefreshToken).toMatch(/^[\w-]{43}$/);
        const storedTokenHash = mockRefreshSessionTokenCreate.mock.calls[0]?.[0].data.tokenHash;
        expect(storedTokenHash).toBe(hashRefreshToken(decodeURIComponent(rawRefreshToken ?? "")));
        expect(storedTokenHash).not.toBe(rawRefreshToken);
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
                tenantId: 1,
                status: "ACTIVE",
                tenant: {
                    id: 1,
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
                tenantId: 1,
                status: "ACTIVE",
                tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
            },
            {
                id: "membership-2",
                userId: "user-1",
                tenantId: 2,
                status: "ACTIVE",
                tenant: { id: 2, name: "Beta School", status: "ACTIVE" },
            },
        ]);
        vi.spyOn(bcrypt, "compare").mockResolvedValue(true as never);

        const response = await request(app)
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "password" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.tenants).toHaveLength(2);
        expect(mockRefreshSessionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ selectedTenantId: null }),
        });
    });

    it("rotates the opaque refresh token and preserves tenant context", async () => {
        const sessionExpiry = new Date(Date.now() + 60_000);
        mockRefreshSessionTokenFindUnique
            .mockResolvedValueOnce({ sessionId: "session-1" })
            .mockResolvedValueOnce({
                id: "refresh-token-1",
                sessionId: "session-1",
                consumedAt: null,
                session: {
                    id: "session-1",
                    userId: "user-1",
                    selectedTenantId: 1,
                    expiresAt: sessionExpiry,
                    revokedAt: null,
                    user: { id: "user-1", email: "user@example.com", status: "ACTIVE" },
                    selectedTenant: { id: 1, status: "ACTIVE" },
                },
            });
        mockMembershipFindFirst.mockResolvedValue({ id: "membership-1" });

        const response = await request(app)
            .post("/api/auth/refresh")
            .set("Origin", env.clientOrigin)
            .set("Cookie", "systra_refresh_token=prior-opaque-token");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, data: { accessToken: expect.any(String) } });
        expect(response.body.data).not.toHaveProperty("refreshToken");
        expect(jwt.decode(response.body.data.accessToken)).toMatchObject({ sid: "session-1", tenantId: 1 });
        expect(mockLockRefreshSession).toHaveBeenCalledTimes(1);
        expect(mockRefreshSessionTokenUpdateMany).toHaveBeenCalledWith({
            where: { id: "refresh-token-1", consumedAt: null },
            data: { consumedAt: expect.any(Date) },
        });
        expect(mockRefreshSessionTokenCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                sessionId: "session-1",
                rotatedFromId: "refresh-token-1",
                tokenHash: expect.not.stringMatching("prior-opaque-token"),
            }),
        });
        const rotatedCookie = response.headers["set-cookie"]?.[0] ?? "";
        expect(rotatedCookie).toMatch(/;\s*HttpOnly/i);
        expect(rotatedCookie).toMatch(/;\s*Secure/i);
        expect(rotatedCookie).toMatch(new RegExp(`;\\s*SameSite=${env.refreshCookieSameSite}`, "i"));
        expect(rotatedCookie).toMatch(/;\s*Path=\/api/i);
        const rotatedRawToken = rotatedCookie.match(/systra_refresh_token=([^;]+)/)?.[1];
        expect(mockRefreshSessionTokenCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                sessionId: "session-1",
                rotatedFromId: "refresh-token-1",
                tokenHash: hashRefreshToken(decodeURIComponent(rotatedRawToken ?? "")),
            }),
        });
    });

    it("does not add tenant context to refresh access tokens before tenant selection", async () => {
        mockRefreshSessionTokenFindUnique
            .mockResolvedValueOnce({ sessionId: "session-1" })
            .mockResolvedValueOnce({
                id: "refresh-token-1",
                sessionId: "session-1",
                consumedAt: null,
                session: {
                    id: "session-1",
                    userId: "user-1",
                    selectedTenantId: null,
                    expiresAt: new Date(Date.now() + 60_000),
                    revokedAt: null,
                    user: { id: "user-1", email: "user@example.com", status: "ACTIVE" },
                    selectedTenant: null,
                },
            });

        const response = await request(app)
            .post("/api/v1/auth/refresh")
            .set("Origin", env.clientOrigin)
            .set("Cookie", "systra_refresh_token=valid-token");

        expect(response.status).toBe(200);
        expect(verifyToken(response.body.data.accessToken).tenantId).toBeUndefined();
        expect(verifyToken(response.body.data.accessToken).sid).toBe("session-1");
    });

    it("revokes a refresh-token family when a consumed token is reused", async () => {
        mockRefreshSessionTokenFindUnique
            .mockResolvedValueOnce({ sessionId: "session-1" })
            .mockResolvedValueOnce({
                id: "refresh-token-1",
                sessionId: "session-1",
                consumedAt: new Date(),
                session: {
                    id: "session-1",
                    userId: "user-1",
                    selectedTenantId: null,
                    expiresAt: new Date(Date.now() + 60_000),
                    revokedAt: null,
                    user: { id: "user-1", email: "user@example.com", status: "ACTIVE" },
                    selectedTenant: null,
                },
            });

        const response = await request(app)
            .post("/api/auth/refresh")
            .set("Origin", env.clientOrigin)
            .set("Cookie", "systra_refresh_token=already-used-token");

        expect(response.status).toBe(401);
        expect(mockRefreshSessionUpdateMany).toHaveBeenCalledWith({
            where: { id: "session-1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
        expect(mockRefreshSessionTokenCreate).not.toHaveBeenCalled();
    });

    it("rejects refresh when the selected tenant membership is no longer active", async () => {
        mockRefreshSessionTokenFindUnique
            .mockResolvedValueOnce({ sessionId: "session-1" })
            .mockResolvedValueOnce({
                id: "refresh-token-1",
                sessionId: "session-1",
                consumedAt: null,
                session: {
                    id: "session-1",
                    userId: "user-1",
                    selectedTenantId: 1,
                    expiresAt: new Date(Date.now() + 60_000),
                    revokedAt: null,
                    user: { id: "user-1", email: "user@example.com", status: "ACTIVE" },
                    selectedTenant: { id: 1, status: "ACTIVE" },
                },
            });
        mockMembershipFindFirst.mockResolvedValue(null);

        const response = await request(app)
            .post("/api/auth/refresh")
            .set("Origin", env.clientOrigin)
            .set("Cookie", "systra_refresh_token=valid-token");

        expect(response.status).toBe(401);
        expect(mockRefreshSessionUpdateMany).toHaveBeenCalledWith({
            where: { id: "session-1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
    });

    it("revokes the session on logout even when the access header is invalid", async () => {
        mockRefreshSessionTokenFindUnique.mockResolvedValue({ sessionId: "session-1" });

        const response = await request(app)
            .post("/api/auth/logout")
            .set("Origin", env.clientOrigin)
            .set("Authorization", "Bearer invalid-access-token")
            .set("Cookie", "systra_refresh_token=logout-token");

        expect(response.status).toBe(200);
        const logoutCookie = response.headers["set-cookie"]?.[0] ?? "";
        expect(logoutCookie).toMatch(/systra_refresh_token=;/i);
        expect(logoutCookie).toMatch(/;\s*HttpOnly/i);
        expect(logoutCookie).toMatch(/;\s*Secure/i);
        expect(mockRefreshSessionUpdateMany).toHaveBeenCalledWith({
            where: { id: "session-1", revokedAt: null },
            data: { revokedAt: expect.any(Date) },
        });
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
            sid: "session-1",
        });

        mockMembershipFindMany.mockResolvedValue([
            {
                id: "membership-1",
                userId: "user-1",
                tenantId: 1,
                status: "ACTIVE",
                tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
            },
        ]);
        mockMembershipFindFirst.mockImplementation(async (_args) => {
            if (_args.where.tenantId === 1) {
                return {
                    id: "membership-1",
                    userId: "user-1",
                    tenantId: 1,
                    status: "ACTIVE",
                    tenant: { id: 1, name: "Alpha School", status: "ACTIVE", code: "ALPHA" },
                };
            }

            return null;
        });
        mockTenantFindUnique.mockResolvedValue({
            id: 1,
            name: "Alpha School",
            code: "ALPHA",
            status: "ACTIVE",
        });

        const response = await request(app)
            .post("/api/auth/select-tenant")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: 1 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockRefreshSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: "session-1", userId: "user-1" }),
            data: { selectedTenantId: 1 },
        }));

        const forbidden = await request(app)
            .post("/api/auth/select-tenant")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: 999 });

        expect(forbidden.status).toBe(403);
        expect(forbidden.body.success).toBe(false);

        const accepted = await request(app)
            .post("/api/auth/select-tenant")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: "1" });
        expect(accepted.status).toBe(200);
        expect(verifyToken(accepted.body.data.accessToken).tenantId).toBe(1);
        expect(verifyToken(accepted.body.data.accessToken).sid).toBe("session-1");

        for (const invalid of ["tenant-1", "1.5", 0, -1, "abc"]) {
            const bad = await request(app)
                .post("/api/auth/select-tenant")
                .set("Authorization", `Bearer ${token}`)
                .send({ tenantId: invalid });
            expect(bad.status).toBe(400);
        }
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
            tenantId: 1,
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
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: 1,
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.tenantId).toBe(1);
        expect(response.body.data.userId).toBe("user-1");
        expect(response.body.data.membershipId).toBe("membership-1");
    });

    it("rejects a request that tries to override the trusted tenant with query parameters", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: 1,
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context?tenantId=TENANT_B")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.data.tenantId).toBe(1);
        expect(response.body.data.tenantId).not.toBe("TENANT_B");
    });

    it("rejects a request that tries to override the trusted tenant with a body payload", async () => {
        const token = generateAccessToken({
            userId: "user-1",
            email: "user@example.com",
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
        });
        mockTenantFindUnique.mockResolvedValue({
            id: 1,
            name: "Alpha School",
            status: "ACTIVE",
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`)
            .send({ tenantId: "TENANT_B" });

        expect(response.status).toBe(200);
        expect(response.body.data.tenantId).toBe(1);
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
            tenantId: 999,
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
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "INACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "ACTIVE" },
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
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "SUSPENDED" },
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
            tenantId: 1,
        });

        mockMembershipFindFirst.mockResolvedValue({
            id: "membership-1",
            userId: "user-1",
            tenantId: 1,
            status: "ACTIVE",
            tenant: { id: 1, name: "Alpha School", status: "INACTIVE" },
        });

        const response = await request(app)
            .get("/api/tenant/context")
            .set("Authorization", `Bearer ${token}`);

        expect(response.status).toBe(403);
    });

    it("creates distinct tenant-specific clients for different trusted tenants", () => {
        const tenantAClient = createTenantPrismaClient({ tenantId: 1 });
        const tenantBClient = createTenantPrismaClient({ tenantId: 2 });

        expect(tenantAClient).not.toBe(tenantBClient);
        expect(tenantAClient).toBeTruthy();
        expect(tenantBClient).toBeTruthy();
        expect(mockCreateTenantPrismaClient).toHaveBeenCalledTimes(2);
        expect(mockCreateTenantPrismaClient.mock.calls[0]?.[0]).toEqual({ tenantId: 1 });
        expect(mockCreateTenantPrismaClient.mock.calls[1]?.[0]).toEqual({ tenantId: 2 });
    });
});
