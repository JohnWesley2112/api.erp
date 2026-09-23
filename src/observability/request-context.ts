import { randomUUID } from "node:crypto";
import type { AppRequest, AppResponse, AppNextFunction } from "../types/express.js";

export type RequestStage =
    | "REQUEST"
    | "AUTHENTICATION"
    | "TENANT_MEMBERSHIP"
    | "TENANT_DATABASE_CONFIGURATION"
    | "TENANT_DATABASE_CONNECTION"
    | "RBAC_PERMISSION_RESOLUTION"
    | "RBAC_PERMISSION_CHECK"
    | "CONTROLLER";

export interface RequestDiagnosticContext {
    stage: RequestStage;
    operation?: string;
}

export const requestContext = (
    req: AppRequest,
    res: AppResponse,
    next: AppNextFunction,
) => {
    const incomingRequestId = req.header("x-request-id");
    req.requestId = incomingRequestId && incomingRequestId.length <= 128
        ? incomingRequestId
        : randomUUID();
    req.diagnosticContext = { stage: "REQUEST" };
    res.setHeader("x-request-id", req.requestId);
    next();
};

export const setRequestDiagnosticContext = (
    req: AppRequest,
    context: RequestDiagnosticContext,
) => {
    req.diagnosticContext = context;
};
