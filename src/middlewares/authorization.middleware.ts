import { AppError } from "../errors/app.error.js";
import type { AppRequest, AppResponse, AppNextFunction } from "../types/express.js";
import { IamService } from "../modules/iam/iam.service.js";
import { setRequestDiagnosticContext } from "../observability/request-context.js";

const iamService = new IamService();

export const requirePermission = (
    permission: string,
    resourceResolver?: (req: AppRequest) => unknown | Promise<unknown>,
) => {
    return async (req: AppRequest, _res: AppResponse, next: AppNextFunction) => {
        try {
            setRequestDiagnosticContext(req, { stage: "RBAC_PERMISSION_RESOLUTION", operation: `resolve permission ${permission}` });
            if (!req.user?.userId) {
                throw new AppError("Authentication required", 401, "UNAUTHORIZED");
            }

            if (!req.tenant?.tenantId || !req.tenantDb) {
                throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
            }

            const resource = resourceResolver ? await resourceResolver(req) : null;
            const resourceCampusId = typeof resource === "object" && resource !== null
                ? ((resource as { campusId?: string | null }).campusId ??
                    (resource as { campus?: { id?: string | null } }).campus?.id ??
                    (resource as { section?: { campusId?: string | null } }).section?.campusId ??
                    (resource as { enrollment?: { campusId?: string | null } }).enrollment?.campusId ?? null)
                : null;

            setRequestDiagnosticContext(req, { stage: "RBAC_PERMISSION_CHECK", operation: `check permission ${permission}` });
            const allowed = await iamService.hasPermission({
                userId: req.user.userId,
                tenantDb: req.tenantDb,
                permission,
                resourceCampusId,
            });

            if (!allowed) {
                throw new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN");
            }

            setRequestDiagnosticContext(req, { stage: "CONTROLLER", operation: `${req.method} ${req.route?.path ?? req.path}` });
            return next();
        } catch (error) {
            if (error instanceof AppError) {
                return next(error);
            }

            return next(new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN", true, {
                cause: error,
                ...(req.diagnosticContext ? { context: { ...req.diagnosticContext } } : {}),
            }));
        }
    };
};
