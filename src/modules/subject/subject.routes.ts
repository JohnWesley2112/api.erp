import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { SubjectController } from "./subject.controller.js";

const router = Router();
const controller = new SubjectController();

router.get("/subjects", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.listSubjects.bind(controller));
router.get("/subjects/:subjectId", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.getSubject.bind(controller));
router.post("/subjects", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.createSubject.bind(controller));
router.patch("/subjects/:subjectId", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.updateSubject.bind(controller));

export default router;
