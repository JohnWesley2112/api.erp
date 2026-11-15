// src/modules/auth/auth.controller.ts
import { AppError } from "../../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { AuthService } from "./auth.service.js";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "./auth-cookie.js";

const authService = new AuthService();
const setRefreshCookie = (res: AppResponse, token: string, expiresAt: Date) => {
    res.cookie(REFRESH_COOKIE_NAME, token, {
        ...refreshCookieOptions,
        maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
};

export class AuthController {
    async userLogin(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                throw new AppError("Email and password are required", 400, "VALIDATION_ERROR");
            }

            const result = await authService.login(email, password);
            const { refreshToken, refreshExpiresAt, ...responseData } = result;
            setRefreshCookie(res, refreshToken, refreshExpiresAt);
            return res.status(200).json({
                success: true,
                data: responseData,
            });
        } catch (error) {
            return next(error);
        }
    }

    async refresh(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const result = await authService.refresh(req.cookies?.[REFRESH_COOKIE_NAME]);
            setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
            return res.status(200).json({
                success: true,
                data: { accessToken: result.accessToken },
            });
        } catch (error) {
            if (error instanceof AppError && error.statusCode === 401) {
                res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
            }
            return next(error);
        }
    }

    async logout(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
            res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
            return res.status(200).json({ success: true, data: {} });
        } catch (error) {
            res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
            return next(error);
        }
    }

    async getCurrentUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }

            const result = await authService.getCurrentUser(req.user.userId, req.user.email);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }

    async selectTenant(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const rawTenantId = req.body?.tenantId;
            const tenantId = typeof rawTenantId === "number" ? rawTenantId : typeof rawTenantId === "string" && /^[1-9]\d*$/.test(rawTenantId) ? Number(rawTenantId) : NaN;
            if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
                throw new AppError("Tenant ID is required and must be a positive integer", 400, "VALIDATION_ERROR");
            }

            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }

            const result = await authService.selectTenant(req.user.userId, tenantId, req.user.email, req.user.sid);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }
}
