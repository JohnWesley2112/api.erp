import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { AcademicYearController } from "./academic-year.controller.js";

const router = Router();
const controller = new AcademicYearController();

router.get("/academic-years", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.listAcademicYears.bind(controller));
router.get("/academic-years/:academicYearId", authenticate, resolveTenantContext, requirePermission("academic.read"), controller.getAcademicYear.bind(controller));
router.post("/academic-years", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.createAcademicYear.bind(controller));
router.patch("/academic-years/:academicYearId", authenticate, resolveTenantContext, requirePermission("academic.manage"), controller.updateAcademicYear.bind(controller));

export default router;
