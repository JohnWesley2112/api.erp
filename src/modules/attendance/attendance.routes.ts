import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { AttendanceController } from "./attendance.controller.js";

const router = Router();
const controller = new AttendanceController();
const context = [authenticate, resolveTenantContext] as const;

router.get("/attendance/sessions", ...context, requirePermission("attendance.read"), controller.list.bind(controller));
router.get("/attendance/sessions/:sessionId", ...context, requirePermission("attendance.read"), controller.get.bind(controller));
router.post("/attendance/sessions", ...context, requirePermission("attendance.mark"), controller.create.bind(controller));
router.post("/attendance/sessions/:sessionId/records", ...context, requirePermission("attendance.mark"), controller.addRecords.bind(controller));
router.post("/attendance/sessions/:sessionId/submit", ...context, requirePermission("attendance.submit"), controller.submit.bind(controller));

export default router;
