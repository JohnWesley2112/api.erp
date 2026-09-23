export interface LoginCredentials {
    email: string;
    password: string;
}

export interface SafeUser {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
}

export interface AuthResult {
    user: SafeUser;
    token: string;
}

export interface JWTPayload {
    userId: string;
    email: string;
    tenantId?: string;
}
