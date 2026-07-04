// src/modules/iam/iam.routes.ts
import { Router } from "express";
import { IamController } from "./iam.controller.js";

const router = Router();
const iamController = new IamController();

// Mounts handler securely to the /roles endpoint paths
router.get("/roles", iamController.getRoles);

export default router;