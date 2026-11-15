import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { IamController } from "./iam.controller.js";

const router = Router();
const iamController = new IamController();

router.get("/roles", authenticate, resolveTenantContext, requirePermission("user.read"), iamController.getRoles);
router.get("/permissions", authenticate, resolveTenantContext, requirePermission("role.read"), iamController.getAllPermissions);
router.get("/permissions/roles", authenticate, resolveTenantContext, requirePermission("role.read"), iamController.getAllPermissionsWithRoles);
router.get("/role-permissions", authenticate, resolveTenantContext, requirePermission("role.read"), iamController.getRolePermissions);
router.put(
    "/roles/:roleId/permissions/:permissionCode",
    authenticate,
    resolveTenantContext,
    requirePermission("role.manage"),
    iamController.grantRolePermission,
);
router.delete(
    "/roles/:roleId/permissions/:permissionCode",
    authenticate,
    resolveTenantContext,
    requirePermission("role.manage"),
    iamController.revokeRolePermission,
);
router.get("/all-role-permissions", authenticate, resolveTenantContext, requirePermission("role.read"), iamController.getRolePermissions);
router.get("/permissions/:id/roles", authenticate, resolveTenantContext, requirePermission("role.read"), iamController.getPermissionWithRole);
router.get("/user/:userId/permissions", authenticate, resolveTenantContext, requirePermission("user.read"), iamController.getAllUserRolePermission);
router.get("/me/permissions", authenticate, resolveTenantContext, iamController.getPermissionCheck);
router.get("/check", authenticate, resolveTenantContext, requirePermission("student.read"), iamController.getPermissionCheck);

export default router;
