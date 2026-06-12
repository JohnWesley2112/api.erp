import type { users } from "@prisma/client";

/**
 * Expected shape of the incoming request body for logging in
 */
export interface LoginCredentials {
  email: users["user_email"]; // Borrows the exact type (string) from Prisma
  password: users["hsd_pwd"]; // Borrows the exact type (string) from Prisma
}

/**
 * The shape of the users object we safely return to the client.
 * Omit<users, 'password'> creates a new type that includes
 * every field from the users model EXCEPT the sensitive password hash.
 */
export type SafeUser = Omit<users, "password">;

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
  userId: users["user_id"];
  email: users["user_email"];
}
