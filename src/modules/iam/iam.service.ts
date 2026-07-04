import prisma from "../../configs/db";
import { mapPrismaError } from "../../utils/prisma.error-mapper";

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
