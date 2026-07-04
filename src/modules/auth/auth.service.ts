import bcrypt from "bcrypt";
import prisma from "../../configs/db.js";
import { AppError } from "../../errors/app.error.js";
import { mapPrismaError } from "../../utils/prisma.error-mapper.js";
import { AuthMapper } from "./auth.mapper.js";
import { generateAccessToken } from "../../helpers/jwt-helper.js";

export class AuthService {
    async login(userEmail: string, password: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { userEmail: userEmail },
                include: {
                    assignedRoles: true,
                },
            });

            if (!user) {
                throw new AppError("Invalid email or password", 401);
            }

            if (!user.password) {
                throw new AppError("User password is not configured", 500);
            }

            const isValidUser = await AuthService.verifyPassword(
                password,
                user.password,
            );

            if (!isValidUser) {
                throw new AppError("Invalid email or password", 401);
            }

            const token = generateAccessToken(
                user.id,
                user.userEmail!,
                user.assignedRoles?.[0]?.roleName || "guest",
            );

            return AuthMapper.toResponse(user, token);
        } catch (error) {
            mapPrismaError(error);
        }
    }

    static async verifyPassword(
        plainPassword: string,
        hashedPassword: string,
    ): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }
}
