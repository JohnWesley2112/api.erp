import prisma from "../../configs/db.js";
import { AppError } from "../../errors/app.error.js";
import { mapPrismaError } from "../../utils/prisma.error-mapper.js";

export class UserService {
    async findById(user_id: number) {
        try {
            const user = await prisma.users.findUnique({ where: { user_id } });
            if (!user) throw new AppError("User not found", 404);
            return user;
        } catch (error) {
            mapPrismaError(error);
        }
    }

    // async create(data: { email: string; name: string }) {
    //     try {
    //         return await prisma.users.create({ data });
    //     } catch (error) {
    //         mapPrismaError(error);
    //     }
    // }

    // async update(
    //     user_id: number,
    //     data: Partial<{ email: string; name: string }>,
    // ) {
    //     try {
    //         return await prisma.users.update({ where: { user_id }, data });
    //     } catch (error) {
    //         mapPrismaError(error);
    //     }
    // }

    async delete(user_id: number) {
        try {
            await prisma.users.delete({ where: { user_id } });
        } catch (error) {
            mapPrismaError(error);
        }
    }

    async findAll() {
        try {
            return await prisma.users.findMany();
        } catch (error) {
            mapPrismaError(error);
        }
    }
}
