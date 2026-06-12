import { AppError } from "../../errors/app.error.js";
import logger from "../../logs/Logger.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { AuthService } from "./auth.service.js";

const authService = new AuthService();

export class AuthController {
    // User Login
    async userLogin(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const { userEmail, password } = req.body;

            if (!userEmail || !password) {
                throw new AppError("Email and password are required", 400);
            }

            const userLoggedIn = await authService.login(userEmail, password);
            return res.json(userLoggedIn);
        } catch (error) {
            next(error);
        }
    }
}
