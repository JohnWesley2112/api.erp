import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { resolveTenantContext } from "../../middlewares/tenant.middleware.js";
import { requirePermission } from "../../middlewares/authorization.middleware.js";
import { UserController } from "./user.controller.js";

const router = Router();
const controller = new UserController();

router.get("/users", authenticate, resolveTenantContext, requirePermission("user.read"), controller.getAllUsers.bind(controller));
router.get("/users/:userId", authenticate, resolveTenantContext, requirePermission("user.read"), controller.getUser.bind(controller));
router.post("/users", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.createUser.bind(controller));
router.patch("/users/:userId", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.updateUser.bind(controller));
router.post("/users/:userId/activate", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.activateUser.bind(controller));
router.post("/users/:userId/deactivate", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.deactivateUser.bind(controller));
router.get("/users/:userId/roles", authenticate, resolveTenantContext, requirePermission("user.read"), controller.getUserRoles.bind(controller));
router.post("/users/:userId/roles", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.assignUserRole.bind(controller));
router.delete("/users/:userId/roles/:roleId", authenticate, resolveTenantContext, requirePermission("user.manage"), controller.removeUserRole.bind(controller));

export default router;
