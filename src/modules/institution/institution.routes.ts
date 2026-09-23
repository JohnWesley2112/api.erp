import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { InstitutionController } from "./institution.controller.js";

const router = Router();
const controller = new InstitutionController();

router.get("/institution", authenticate, resolveTenantContext, requirePermission("institution.read"), controller.getInstitution.bind(controller));
router.patch("/institution", authenticate, resolveTenantContext, requirePermission("institution.manage"), controller.updateInstitution.bind(controller));

export default router;
