import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const getJwtSecret = () => process.env.JWT_SECRET ?? env.jwtSecret;

export interface AuthTokenPayload {
    userId: string;
    email: string;
    tenantId?: string | undefined;
    sub?: string | undefined;
}

export const generateAccessToken = ({
    userId,
    email,
    tenantId,
}: {
    userId: string;
    email: string;
    tenantId?: string | undefined;
}) => {
    const payload: AuthTokenPayload = {
        userId,
        email,
        tenantId: tenantId ?? undefined,
        sub: userId,
    };

    return jwt.sign(payload, getJwtSecret(), {
        expiresIn: "15m",
    });
};

export const generateRefreshToken = (userId: string) => {
    return jwt.sign({ userId, sub: userId }, getJwtSecret(), {
        expiresIn: "7d",
    });
};

export const verifyToken = (token: string): AuthTokenPayload => {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    const userId = String(decoded.userId ?? decoded.sub ?? "");
    const email = String(decoded.email ?? "");

    if (!userId || !email) {
        throw new Error("Invalid token payload");
    }

    return {
        userId,
        email,
        tenantId: decoded.tenantId ? String(decoded.tenantId) : undefined,
        sub: userId,
    };
};
