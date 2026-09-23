import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { SectionController } from "./section.controller.js";

const router = Router();
const controller = new SectionController();

router.get("/sections", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.listSections.bind(controller));
router.get("/sections/:sectionId", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.getSection.bind(controller));
router.post("/sections", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.createSection.bind(controller));
router.patch("/sections/:sectionId", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.updateSection.bind(controller));

export default router;
