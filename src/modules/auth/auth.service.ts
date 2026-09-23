import bcrypt from "bcrypt";
import { AppError } from "../../errors/app.error.js";
import { generateAccessToken } from "../../helpers/jwt-helper.js";
import { createAdminPrismaClient } from "../../infrastructure/database/tenant-connection-manager.js";

const adminPrisma = createAdminPrismaClient();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

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
        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            tenantId: selectedTenantId,
        });

        return {
            accessToken,
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

    async selectTenant(userId: string, tenantId: string, email?: string) {
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

        const accessToken = generateAccessToken({
            userId,
            email: email ?? "",
            tenantId,
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
