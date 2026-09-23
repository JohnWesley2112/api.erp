// src/modules/auth/auth.controller.ts
import { AppError } from "../../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { AuthService } from "./auth.service.js";

const authService = new AuthService();

export class AuthController {
    async userLogin(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                throw new AppError("Email and password are required", 400, "VALIDATION_ERROR");
            }

            const result = await authService.login(email, password);
            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
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
            const { tenantId } = req.body;
            if (!tenantId) {
                throw new AppError("Tenant ID is required", 400, "VALIDATION_ERROR");
            }

            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }

            const result = await authService.selectTenant(req.user.userId, tenantId, req.user.email);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }
}
