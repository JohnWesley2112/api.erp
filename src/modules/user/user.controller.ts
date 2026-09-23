import logger from "../../logs/Logger.js";
import { AppError } from "../../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { UserService } from "./user.service.js";

const userService = new UserService();

export class UserController {
    async getUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const user = await userService.findById(req.tenant.tenantId, userId);
            logger.info("User fetched", { ip: req.ip, userId, tenantId: req.tenant.tenantId });
            return res.status(200).json({ success: true, data: user });
        } catch (error) {
            return next(error);
        }
    }

    async getAllUsers(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const page = Number(req.query.page ?? 1);
            const pageSize = Number(req.query.pageSize ?? 20);
            const campusId = typeof req.query.campusId === "string" ? req.query.campusId : undefined;
            const status = typeof req.query.status === "string" ? req.query.status : undefined;

            const listOptions: {
                search?: string;
                page?: number;
                pageSize?: number;
                campusId?: string;
                status?: string;
            } = {
                page,
                pageSize,
            };

            if (search) {
                listOptions.search = search;
            }
            if (campusId) {
                listOptions.campusId = campusId;
            }
            if (status) {
                listOptions.status = status;
            }

            const result = await userService.findAll(req.tenant.tenantId, listOptions);

            logger.info("Users listed", { ip: req.ip, tenantId: req.tenant.tenantId });
            return res.status(200).json({ success: true, data: result.items, meta: {
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
            } });
        } catch (error) {
            return next(error);
        }
    }

    async createUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const { email, firstName, lastName, campusId, role, password } = req.body ?? {};

            if (!email || !firstName || !campusId || !role) {
                throw new AppError("Email, first name, campus, and role are required", 400, "VALIDATION_ERROR");
            }

            const createdUser = await userService.create(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                {
                    email,
                    firstName,
                    lastName,
                    campusId,
                    role,
                    password,
                },
            );

            logger.info("User created", { ip: req.ip, tenantId: req.tenant.tenantId, userId: createdUser.id });
            return res.status(201).json({ success: true, data: createdUser });
        } catch (error) {
            return next(error);
        }
    }

    async updateUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const payload = (req.body ?? {}) as {
                firstName?: string;
                lastName?: string;
                status?: string;
                campusId?: string;
                role?: string;
            };

            const updatedUser = await userService.updateUser(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                userId,
                payload,
            );

            return res.status(200).json({ success: true, data: updatedUser });
        } catch (error) {
            return next(error);
        }
    }

    async getUserRoles(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const roles = await userService.getUserRoles(req.tenant.tenantId, userId);
            return res.status(200).json({ success: true, data: roles });
        } catch (error) {
            return next(error);
        }
    }

    async assignUserRole(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const { role, campusId } = req.body ?? {};
            if (!role) {
                throw new AppError("Role is required", 400, "VALIDATION_ERROR");
            }

            const assignment = await userService.assignRole(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                userId,
                { role, campusId: campusId ?? null },
            );

            return res.status(201).json({ success: true, data: assignment });
        } catch (error) {
            return next(error);
        }
    }

    async removeUserRole(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;
            const roleId = Array.isArray(req.params.roleId)
                ? req.params.roleId[0]
                : req.params.roleId;

            if (!userId || !roleId) {
                throw new AppError("User id and role id are required", 400, "VALIDATION_ERROR");
            }

            const removed = await userService.removeRole(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                userId,
                roleId,
            );

            return res.status(200).json({ success: true, data: removed });
        } catch (error) {
            return next(error);
        }
    }

    async activateUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const result = await userService.activateUser(req.tenant.tenantId, req.user?.userId ?? req.auth?.userId ?? "system", userId);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }

    async deactivateUser(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            if (!req.tenant?.tenantId) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const userId = Array.isArray(req.params.userId)
                ? req.params.userId[0]
                : req.params.userId;

            if (!userId) {
                throw new AppError("User id is required", 400, "VALIDATION_ERROR");
            }

            const result = await userService.deactivateUser(req.tenant.tenantId, req.user?.userId ?? req.auth?.userId ?? "system", userId);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }
}
