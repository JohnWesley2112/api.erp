import jwt from "jsonwebtoken";
import type { IJwtPayload } from "../middlewares/middleware.types.js";
const jwtSecret = process.env.JWT_SECRET!;

export const generateAccessToken = (
    userId: number,
    email: string,
    role: string,
) => {
    return jwt.sign({ userId, email, role }, jwtSecret, {
        expiresIn: "1d",
    });
};

export const generateRefreshToken = (userId: number) => {
    return jwt.sign({ userId }, jwtSecret, {
        expiresIn: "7d",
    });
};

export const verifyToken = (token: string): IJwtPayload => {
    return jwt.verify(token, jwtSecret) as IJwtPayload;
};
