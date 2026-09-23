// src/middlewares/auth.middleware.ts
import { AppError } from "../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../types/express.js";
import { verifyToken } from "../helpers/jwt-helper.js";
import { setRequestDiagnosticContext } from "../observability/request-context.js";

export const authenticate = (
    req: AppRequest,
    _res: AppResponse,
    next: AppNextFunction,
) => {
    try {
        setRequestDiagnosticContext(req, { stage: "AUTHENTICATION", operation: "verify access token" });
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError("Access token is required", 401, "UNAUTHORIZED");
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            throw new AppError("Access token is required", 401, "UNAUTHORIZED");
        }

        const decoded = verifyToken(token);

        const authUser: AppRequest["auth"] = {
            userId: decoded.userId,
            email: decoded.email,
            tenantId: decoded.tenantId ?? undefined,
            id: decoded.userId,
        };

        req.auth = authUser;
        req.user = authUser;

        setRequestDiagnosticContext(req, { stage: "CONTROLLER", operation: "authenticated request" });
        next();
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }

        return next(new AppError("Invalid or expired token", 401, "UNAUTHORIZED", true, {
            cause: error,
            context: { stage: "AUTHENTICATION", operation: "verify access token" },
        }));
    }
};
