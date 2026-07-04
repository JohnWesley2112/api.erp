// src/modules/iam/iam.service.ts
import prisma from "../../configs/db.js";
import { mapPrismaError } from "../../utils/prisma.error-mapper.js";

export class IamService {
    /**
     * Fetches all roles from the database safely
     */
    async getAllRoles() {
        try {
            return await prisma.role.findMany({
                select: {
                    id: true,
                    roleName: true,
                },
            });
        } catch (error) {
            // mapPrismaError throws AppError or rethrows, fulfilling execution halt
            mapPrismaError(error);
        }
    }
}
