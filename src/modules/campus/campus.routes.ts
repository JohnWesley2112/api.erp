import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { CampusController } from "./campus.controller.js";

const router = Router();
const controller = new CampusController();

router.get("/campuses", authenticate, resolveTenantContext, requirePermission("campus.read"), controller.listCampuses.bind(controller));
router.get("/campuses/:campusId", authenticate, resolveTenantContext, requirePermission("campus.read", async (req) => ({ campusId: req.params.campusId })), controller.getCampus.bind(controller));
router.post("/campuses", authenticate, resolveTenantContext, requirePermission("campus.manage"), controller.createCampus.bind(controller));
router.patch("/campuses/:campusId", authenticate, resolveTenantContext, requirePermission("campus.manage", async (req) => ({ campusId: req.params.campusId })), controller.updateCampus.bind(controller));

export default router;
