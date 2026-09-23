// modules/auth/auth.routes.ts
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();
const authController = new AuthController();

router.post("/login", authController.userLogin);
router.get("/me", authenticate, authController.getCurrentUser);
router.post("/select-tenant", authenticate, authController.selectTenant);

export default router;
