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

            const user = await userService.findById(req.tenant.tenantId, userId, req.tenantDb);
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
            const status = typeof req.query.status === "string" ? req.query.status : undefined;
            if (status && !["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
                throw new AppError("User status filter is invalid", 400, "VALIDATION_ERROR");
            }

            const listOptions: {
                search?: string;
                page?: number;
                pageSize?: number;
                status?: string;
            } = {
                page,
                pageSize,
            };

            if (search) {
                listOptions.search = search;
            }
            if (status) {
                listOptions.status = status;
            }

            const result = await userService.findAll(req.tenant.tenantId, listOptions, req.tenantDb);

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

            const { email, firstName, lastName, role, password } = req.body ?? {};

            if (!email || !firstName || !role) {
                throw new AppError("Email, first name, and role are required", 400, "VALIDATION_ERROR");
            }

            const createdUser = await userService.create(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                {
                    email,
                    firstName,
                    lastName,
                    role,
                    password,
                },
                req.tenantDb,
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
                role?: string;
            };

            const updatedUser = await userService.updateUser(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                userId,
                payload,
                req.tenantDb,
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

            const roles = await userService.getUserRoles(req.tenant.tenantId, userId, req.tenantDb);
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

            const { role } = req.body ?? {};
            if (!role) {
                throw new AppError("Role is required", 400, "VALIDATION_ERROR");
            }

            const assignment = await userService.assignRole(
                req.tenant.tenantId,
                req.user?.userId ?? req.auth?.userId ?? "system",
                userId,
                { role },
                req.tenantDb,
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
                req.tenantDb,
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

            const result = await userService.activateUser(req.tenant.tenantId, req.user?.userId ?? req.auth?.userId ?? "system", userId, req.tenantDb);
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

            const result = await userService.deactivateUser(req.tenant.tenantId, req.user?.userId ?? req.auth?.userId ?? "system", userId, req.tenantDb);
            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return next(error);
        }
    }
}
