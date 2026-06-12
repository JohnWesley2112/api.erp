import bcrypt from "bcrypt";
import prisma from "../../configs/db.js";
import { AppError } from "../../errors/app.error.js";
import { mapPrismaError } from "../../utils/prisma.error-mapper.js";
import { AuthMapper } from "./auth.mapper.js";
import { generateAccessToken } from "../../helpers/jwt-helper.js";

export class AuthService {
    async login(userEmail: string, password: string) {
        try {
            const user = await prisma.users.findUnique({
                where: { user_email: userEmail },
                include: {
                    roles: true,
                },
            });

            if (!user) {
                throw new AppError("Invalid email or password", 401);
            }

            if (!user.hsd_pwd) {
                throw new AppError("User password is not configured", 500);
            }

            const isValidUser = await AuthService.verifyPassword(
                password,
                user.hsd_pwd,
            );

            if (!isValidUser) {
                throw new AppError("Invalid email or password", 401);
            }

            const token = generateAccessToken(
                user.user_id,
                user.user_email!,
                user.roles?.role_name || "guest",
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
