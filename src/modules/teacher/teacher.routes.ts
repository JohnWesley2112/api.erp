import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { TeacherController } from "./teacher.controller.js";

const router = Router();
const controller = new TeacherController();
const context = [authenticate, resolveTenantContext] as const;

router.get("/teachers", ...context, requirePermission("teacher.read"), controller.list.bind(controller));
router.get("/teachers/:teacherId", ...context, requirePermission("teacher.read"), controller.get.bind(controller));
router.post("/teachers", ...context, requirePermission("teacher.create"), controller.create.bind(controller));
router.patch("/teachers/:teacherId", ...context, requirePermission("teacher.update"), controller.update.bind(controller));
router.get("/teachers/:teacherId/assignments", ...context, requirePermission("teacher.read"), controller.assignments.bind(controller));
router.post("/teachers/:teacherId/assignments", ...context, requirePermission("academic.manage"), controller.createAssignment.bind(controller));

export default router;
