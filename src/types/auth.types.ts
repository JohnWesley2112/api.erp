import type { User } from "@prisma/client";

/**
 * Expected shape of the incoming request body for logging in
 */
export interface LoginCredentials {
    email: User["userEmail"]; // Borrows the exact type (string) from Prisma
    password: User["password"]; // Borrows the exact type (string) from Prisma
}

/**
 * The shape of the users object we safely return to the client.
 * Omit<users, 'password'> creates a new type that includes
 * every field from the users model EXCEPT the sensitive password hash.
 */
export type SafeUser = Omit<User, "password">;

/**
 * The expected return payload from the authService layer
 */
export interface AuthResult {
    user: SafeUser;
    token: string;
}

/**
 * Optional: The payload structure encoded inside your JWT
 */
export interface JWTPayload {
    userId: User["id"];
    email: User["userEmail"];
}
