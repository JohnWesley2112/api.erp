import bcrypt from "bcrypt";
import { AppError } from "../../errors/app.error.js";
import { generateAccessToken, generateRefreshToken } from "../../helpers/jwt-helper.js";
import { hashRefreshToken } from "../../helpers/hash-helper.js";
import { createAdminPrismaClient } from "../../infrastructure/database/tenant-connection-manager.js";

const adminPrisma = createAdminPrismaClient();
const REFRESH_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const unauthorizedRefresh = () => new AppError("Invalid or expired refresh token", 401, "UNAUTHORIZED");

interface IssuedSession {
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
}

export class AuthService {
    async login(email: string, password: string) {
        const normalizedEmail = normalizeEmail(email);

        const user = await adminPrisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (!user) {
            throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
        }

        if (user.status !== "ACTIVE") {
            throw new AppError(
                user.status === "LOCKED" ? "Account locked" : "Account inactive",
                401,
                user.status === "LOCKED" ? "ACCOUNT_LOCKED" : "ACCOUNT_INACTIVE",
            );
        }

        const isValidPassword = await AuthService.verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
            throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
        }

        const memberships = await adminPrisma.userTenantMembership.findMany({
            where: {
                userId: user.id,
                status: "ACTIVE",
            },
            include: {
                tenant: true,
            },
        });

        const activeTenants = memberships
            .filter((membership) => membership.tenant && membership.tenant.status === "ACTIVE")
            .map((membership) => ({
                id: membership.tenant.id,
                name: membership.tenant.name,
                code: membership.tenant.code,
                status: membership.tenant.status,
            }));

        if (activeTenants.length === 0) {
            throw new AppError("No active tenant memberships found", 401, "TENANT_ACCESS_DENIED");
        }

        const selectedTenantId = activeTenants.length === 1 ? activeTenants[0]?.id : undefined;
        const refreshToken = generateRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + REFRESH_SESSION_LIFETIME_MS);
        const session = await adminPrisma.$transaction(async (tx) => {
            const createdSession = await tx.refreshSession.create({
                data: {
                    userId: user.id,
                    selectedTenantId: selectedTenantId ?? null,
                    expiresAt: refreshExpiresAt,
                },
            });

            await tx.refreshSessionToken.create({
                data: {
                    sessionId: createdSession.id,
                    tokenHash: hashRefreshToken(refreshToken),
                },
            });

            return createdSession;
        });
        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            tenantId: selectedTenantId,
            sid: session.id,
        });

        return {
            accessToken,
            refreshToken,
            refreshExpiresAt,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
            tenants: activeTenants,
            tenantId: selectedTenantId,
        };
    }

    async refresh(rawRefreshToken?: string): Promise<IssuedSession> {
        if (!rawRefreshToken) {
            throw unauthorizedRefresh();
        }

        const tokenHash = hashRefreshToken(rawRefreshToken);
        const replacementToken = generateRefreshToken();
        const result = await adminPrisma.$transaction(async (tx) => {
            const initialToken = await tx.refreshSessionToken.findUnique({
                where: { tokenHash },
                select: { sessionId: true },
            });

            if (!initialToken) {
                return { kind: "invalid" as const };
            }

            await tx.$queryRaw`SELECT "id" FROM "refresh_sessions" WHERE "id" = ${initialToken.sessionId}::uuid FOR UPDATE`;

            const token = await tx.refreshSessionToken.findUnique({
                where: { tokenHash },
                include: {
                    session: {
                        include: {
                            user: true,
                            selectedTenant: true,
                        },
                    },
                },
            });

            if (!token?.session) {
                return { kind: "invalid" as const };
            }

            const now = new Date();
            if (token.consumedAt) {
                await tx.refreshSession.updateMany({
                    where: { id: token.sessionId, revokedAt: null },
                    data: { revokedAt: now },
                });
                return { kind: "replayed" as const };
            }

            const session = token.session;
            if (
                session.revokedAt
                || session.expiresAt <= now
            ) {
                return { kind: "invalid" as const };
            }

            if (session.user.status !== "ACTIVE") {
                await tx.refreshSession.updateMany({
                    where: { id: session.id, revokedAt: null },
                    data: { revokedAt: now },
                });
                return { kind: "invalid" as const };
            }

            if (session.selectedTenantId !== null) {
                const selectedTenant = session.selectedTenant;
                const activeMembership = await tx.userTenantMembership.findFirst({
                    where: {
                        userId: session.userId,
                        tenantId: session.selectedTenantId,
                        status: "ACTIVE",
                        tenant: { status: "ACTIVE" },
                    },
                    select: { id: true },
                });

                if (!selectedTenant || selectedTenant.status !== "ACTIVE" || !activeMembership) {
                    await tx.refreshSession.updateMany({
                        where: { id: session.id, revokedAt: null },
                        data: { revokedAt: now },
                    });
                    return { kind: "invalid" as const };
                }
            }

            const consumed = await tx.refreshSessionToken.updateMany({
                where: { id: token.id, consumedAt: null },
                data: { consumedAt: now },
            });

            if (consumed.count !== 1) {
                await tx.refreshSession.updateMany({
                    where: { id: session.id, revokedAt: null },
                    data: { revokedAt: now },
                });
                return { kind: "replayed" as const };
            }

            await tx.refreshSessionToken.create({
                data: {
                    sessionId: session.id,
                    tokenHash: hashRefreshToken(replacementToken),
                    rotatedFromId: token.id,
                },
            });

            return {
                kind: "success" as const,
                userId: session.userId,
                email: session.user.email,
                tenantId: session.selectedTenantId ?? undefined,
                sessionId: session.id,
                expiresAt: session.expiresAt,
            };
        });

        if (result.kind !== "success") {
            throw unauthorizedRefresh();
        }

        return {
            accessToken: generateAccessToken({
                userId: result.userId,
                email: result.email,
                tenantId: result.tenantId,
                sid: result.sessionId,
            }),
            refreshToken: replacementToken,
            refreshExpiresAt: result.expiresAt,
        };
    }

    async logout(rawRefreshToken?: string) {
        if (!rawRefreshToken) {
            return;
        }

        const token = await adminPrisma.refreshSessionToken.findUnique({
            where: { tokenHash: hashRefreshToken(rawRefreshToken) },
            select: { sessionId: true },
        });

        if (!token) {
            return;
        }

        await adminPrisma.refreshSession.updateMany({
            where: { id: token.sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async getCurrentUser(userId: string, email?: string) {
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

        if (!user || user.status !== "ACTIVE") {
            throw new AppError("Authentication required", 401, "UNAUTHORIZED");
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
            },
            email,
        };
    }

    async selectTenant(userId: string, tenantId: number, email: string | undefined, sessionId?: string) {
        if (!sessionId) {
            throw new AppError("A refresh session is required", 401, "UNAUTHORIZED");
        }

        const membership = await adminPrisma.userTenantMembership.findFirst({
            where: {
                userId,
                tenantId,
                status: "ACTIVE",
            },
            include: {
                tenant: true,
            },
        });

        if (!membership || !membership.tenant || membership.tenant.status !== "ACTIVE") {
            throw new AppError("Unauthorized tenant selection", 403, "TENANT_ACCESS_DENIED");
        }

        const sessionUpdate = await adminPrisma.refreshSession.updateMany({
            where: {
                id: sessionId,
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            data: { selectedTenantId: tenantId },
        });

        if (sessionUpdate.count !== 1) {
            throw new AppError("Refresh session is invalid or expired", 401, "UNAUTHORIZED");
        }

        const accessToken = generateAccessToken({
            userId,
            email: email ?? "",
            tenantId,
            sid: sessionId,
        });

        return {
            accessToken,
            tenant: {
                id: membership.tenant.id,
                name: membership.tenant.name,
                code: membership.tenant.code,
                status: membership.tenant.status,
            },
        };
    }

    static async verifyPassword(
        plainPassword: string,
        hashedPassword: string,
    ): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
}
