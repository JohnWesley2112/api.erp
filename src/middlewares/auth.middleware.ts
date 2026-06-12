import { AppError } from "../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../types/express.js";
import { verifyToken } from "../helpers/jwt-helper.js";

export const authenticate = (
    req: AppRequest,
    res: AppResponse,
    next: AppNextFunction,
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw new AppError("Access token is required", 401);
        }

        const token = authHeader.split(" ")[1];

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new AppError("Secret token is not configured", 500);
        }

        const decoded = verifyToken(token!);
        console.log(decoded);
        
        (req as any).user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
        };

        next();
    } catch (error) {
        next(new AppError("Invalid or expired token", 401));
    }
};
