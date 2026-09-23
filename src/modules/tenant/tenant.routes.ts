import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { TenantController } from "./tenant.controller.js";

const router = Router();
const tenantController = new TenantController();

router.get("/context", authenticate, resolveTenantContext, tenantController.getTenantContext);

export default router;
