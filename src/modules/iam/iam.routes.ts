import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { IamController } from "./iam.controller.js";

const router = Router();
const iamController = new IamController();

router.get("/roles", authenticate, resolveTenantContext, iamController.getRoles);
router.get("/permissions", authenticate, resolveTenantContext, iamController.getAllPermissions);
router.get("/permissions/roles", authenticate, resolveTenantContext, iamController.getAllPermissionsWithRoles);
router.get("/all-role-permissions", authenticate, resolveTenantContext, iamController.getRolePermissions);
router.get("/permissions/:id/roles", authenticate, resolveTenantContext, iamController.getPermissionWithRole);
router.get("/user/:userId/permissions", authenticate, resolveTenantContext, iamController.getAllUserRolePermission);
router.get("/check", authenticate, resolveTenantContext, requirePermission("student.read"), iamController.getPermissionCheck);

export default router;
