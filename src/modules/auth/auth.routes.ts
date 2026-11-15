// modules/auth/auth.routes.ts
import { Router, type RequestHandler } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { AppError } from "../../errors/app.error.js";
import { env } from "../../config/env.js";

const router = Router();
const authController = new AuthController();

const requireClientOrigin: RequestHandler = (req, _res, next) => {
    if (req.get("origin") !== env.clientOrigin) {
        return next(new AppError("Request origin is not allowed", 403, "FORBIDDEN"));
    }

    return next();
};

router.post("/login", authController.userLogin);
router.post("/refresh", requireClientOrigin, authController.refresh);
router.post("/logout", requireClientOrigin, authController.logout);
router.get("/me", authenticate, authController.getCurrentUser);
router.post("/select-tenant", authenticate, authController.selectTenant);

export default router;
