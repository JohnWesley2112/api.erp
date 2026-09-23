export interface IJwtPayload {
    userId: string;
    email: string;
    tenantId?: string;
    sub?: string;
}
