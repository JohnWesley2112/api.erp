// modules/auth/auth.routes.ts
import { Router } from "express";
import { AuthController } from "./auth.controller.js";

const router = Router();
const authController = new AuthController();

router.post("/login", authController.userLogin); // POST /api/v1/auth/login

export default router;
