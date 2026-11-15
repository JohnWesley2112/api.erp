import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const getJwtSecret = () => process.env.JWT_SECRET ?? env.jwtSecret;

export interface AuthTokenPayload {
    userId: string;
    email: string;
    tenantId?: number | undefined;
    sid?: string | undefined;
    sub?: string | undefined;
}

export const generateAccessToken = ({
    userId,
    email,
    tenantId,
    sid,
}: {
    userId: string;
    email: string;
    tenantId?: number | undefined;
    sid?: string | undefined;
}) => {
    const payload: AuthTokenPayload = {
        userId,
        email,
        tenantId: tenantId ?? undefined,
        sid,
        sub: userId,
    };

    return jwt.sign(payload, getJwtSecret(), {
        expiresIn: "15m",
    });
};

export const generateRefreshToken = () => randomBytes(32).toString("base64url");

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
        tenantId: Number.isSafeInteger(decoded.tenantId) && decoded.tenantId > 0 ? (decoded.tenantId as number) : undefined,
        sid: typeof decoded.sid === "string" && decoded.sid.length > 0 ? decoded.sid : undefined,
        sub: userId,
    };
};
