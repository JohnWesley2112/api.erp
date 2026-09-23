import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { StudentController } from "./student.controller.js";

const router = Router(); const controller = new StudentController(); const context = [authenticate, resolveTenantContext] as const;
router.get("/students", ...context, requirePermission("student.read"), controller.list.bind(controller));
router.get("/students/:studentId", ...context, requirePermission("student.read"), controller.get.bind(controller));
router.post("/students", ...context, requirePermission("student.create"), controller.create.bind(controller));
router.patch("/students/:studentId", ...context, requirePermission("student.update"), controller.update.bind(controller));
router.post("/students/:studentId/enrollments", ...context, requirePermission("student.create"), controller.enrollment.bind(controller));
export default router;