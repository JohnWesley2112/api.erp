import { AppError } from "../../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { IamService } from "./iam.service.js";

export class IamController {
    private iamService = new IamService();

    getRoles = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            const allRoles = await this.iamService.getAllRoles(req.tenantDb);
            return res.status(200).json({
                success: true,
                data: allRoles,
            });
        } catch (error) {
            return next(error);
        }
    };

    getAllPermissions = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            const allPermissions = await this.iamService.getAllPermissions(req.tenantDb);
            return res.status(200).json({
                success: true,
                data: allPermissions,
            });
        } catch (error) {
            return next(error);
        }
    };

    getAllPermissionsWithRoles = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }
            const permissions = await this.iamService.getAllPermissionsWithRoles(req.tenantDb, req.user.userId);
            return res.status(200).json({
                success: true,
                data: permissions,
            });
        } catch (error) {
            return next(error);
        }
    };

    getRolePermissions = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }
            const allRolesPermissions = await this.iamService.getAllRolePermissions(req.tenantDb, req.user.userId);
            return res.status(200).json({
                success: true,
                data: allRolesPermissions,
            });
        } catch (error) {
            return next(error);
        }
    };

    getAllUserRolePermission = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        const rawUserId = Array.isArray(req.params.userId)
            ? req.params.userId[0]
            : req.params.userId;

        try {
            if (!rawUserId) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "User id is required",
                    },
                });
            }

            const allRolesPermissions = await this.iamService.getAllUserPermissions(rawUserId, req.tenantDb);
            return res.status(200).json({
                success: true,
                data: allRolesPermissions,
            });
        } catch (error) {
            return next(error);
        }
    };

    getPermissionWithRole = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        try {
            if (!rawId) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Permission id is required",
                    },
                });
            }

            const allPermissions = await this.iamService.getPermissionWithRoles(rawId, req.tenantDb);
            return res.status(200).json({
                success: true,
                data: allPermissions,
            });
        } catch (error) {
            return next(error);
        }
    };

    grantRolePermission = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => this.changeRolePermission(req, res, next, true);

    revokeRolePermission = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => this.changeRolePermission(req, res, next, false);

    private changeRolePermission = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
        granted: boolean,
    ) => {
        const roleId = Array.isArray(req.params.roleId) ? req.params.roleId[0] : req.params.roleId;
        const permissionCode = Array.isArray(req.params.permissionCode)
            ? req.params.permissionCode[0]
            : req.params.permissionCode;

        try {
            const actorUserId = req.user?.userId;
            if (!actorUserId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }
            if (!roleId || !permissionCode) {
                throw new AppError("Role id and permission code are required", 400, "VALIDATION_ERROR");
            }

            const result = await this.iamService.changeRolePermission({
                tenantDb: req.tenantDb,
                actorUserId,
                roleId,
                permissionCode,
                granted,
            });
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    };

    getPermissionCheck = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            if (!req.user?.userId || !req.tenant?.tenantId) {
                throw new AppError("Authentication and tenant context are required", 401, "UNAUTHORIZED");
            }

            const permissions = await this.iamService.getEffectivePermissions({
                userId: req.user.userId,
                tenantDb: req.tenantDb,
            });

            return res.status(200).json({
                success: true,
                data: {
                    permissions,
                },
            });
        } catch (error) {
            return next(error);
        }
    };
}
