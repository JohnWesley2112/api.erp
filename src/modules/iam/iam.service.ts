import prisma from "../../configs/db.js";
import { mapPrismaError } from "../../utils/prisma.error-mapper.js";

export class IamService {
    async roles() {
        try {
            const roles = await prisma.role.findMany({
                select: {
                    id: true,
                    roleName: true,
                },
            });
            return roles;
        } catch (error) {
            mapPrismaError(error);
        }
    }
}
