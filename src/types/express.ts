import type { Request, Response, NextFunction } from "express";
import type { RequestDiagnosticContext } from "../observability/request-context.js";

export interface AuthenticatedRequestUser {
    id?: string;
    userId?: string;
    email?: string;
    tenantId?: number | undefined;
    sid?: string | undefined;
}

export interface TenantContext {
    userId: string;
    tenantId: number;
    membershipId: string;
}

export type AppRequest = Request & {
    auth?: AuthenticatedRequestUser;
    user?: AuthenticatedRequestUser;
    tenant?: TenantContext;
    tenantDb?: unknown;
    requestId?: string;
    diagnosticContext?: RequestDiagnosticContext;
};
export type AppResponse = Response;
export type AppNextFunction = NextFunction;
