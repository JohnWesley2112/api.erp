import logger from "../../logs/Logger.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { UserService } from "./user.service.js";

const userService = new UserService();

export class UserController {
    async getUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const idParam = Array.isArray(req.params.id)
                ? req.params.id[0]
                : req.params.id;
            const userId = Number(idParam);

            if (!idParam || Number.isNaN(userId)) {
                return res.status(400).json({ error: "Invalid user id" });
            }

            const user = await userService.findById(userId);
            res.json(user);
        } catch (error) {
            next(error); // ✅ all errors go to your errorHandler
        }
    }

    async getAllUsers(
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) {
        try {
            const users = await userService.findAll();
            logger.info("Fetching users list", { ip: req.ip });
            res.json(users);
        } catch (error) {
            next(error);
        }
    }
}
