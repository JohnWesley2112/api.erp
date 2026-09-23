import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { AuditController } from "./audit.controller.js";

const router = Router();
const controller = new AuditController();
const context = [authenticate, resolveTenantContext] as const;

router.get("/audit-logs", ...context, requirePermission("audit.read"), controller.list.bind(controller));

export default router;
