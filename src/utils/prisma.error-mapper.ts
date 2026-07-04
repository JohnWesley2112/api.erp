import { Prisma } from "@prisma/client";
import { AppError } from "../errors/app.error.js";

export function mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                throw new AppError(
                    `Unique constraint failed on: ${error.meta?.target}`,
                    409,
                );
            case "P2025":
                throw new AppError("Record not found", 404);
            default:
                throw new AppError(`Database error: ${error.message}`, 400);
        }
    }
    throw error; // rethrow unknown (will be caught by central handler)
}
