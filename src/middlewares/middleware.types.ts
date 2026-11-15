export interface IJwtPayload {
    userId: string;
    email: string;
    tenantId?: number;
    sub?: string;
}
