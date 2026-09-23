import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { ClassController } from "./class.controller.js";

const router = Router();
const controller = new ClassController();

router.get("/classes", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.listClasses.bind(controller));
router.get("/classes/:classId", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.getClass.bind(controller));
router.post("/classes", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.createClass.bind(controller));
router.patch("/classes/:classId", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.updateClass.bind(controller));

export default router;
