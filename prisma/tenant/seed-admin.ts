import "dotenv/config";

import { PrismaClient as AdminPrismaClient } from "../../node_modules/.prisma/admin-client";
import { PrismaClient as TenantPrismaClient } from "../../node_modules/.prisma/tenant-client";

const adminPrisma = new AdminPrismaClient({
    datasourceUrl: process.env.ADMIN_DATABASE_URL,
});

const tenantPrisma = new TenantPrismaClient({
    datasourceUrl: process.env.TENANT_DATABASE_URL,
});

async function main() {
    const email = "admin@systra.local";

    const adminUser = await adminPrisma.user.findUnique({
        where: { email },
    });

    if (!adminUser) {
        throw new Error(`Admin user not found: ${email}`);
    }

    const membership = await adminPrisma.userTenantMembership.findFirst({
        where: {
            userId: adminUser.id,
            status: "ACTIVE",
            tenant: {
                status: "ACTIVE",
            },
        },
        include: {
            tenant: true,
        },
    });

    if (!membership) {
        throw new Error(`No active tenant membership found for ${email}`);
    }

    const profile = await tenantPrisma.userProfile.upsert({
        where: {
            userId: adminUser.id,
        },
        update: {
            displayName: `${adminUser.firstName} ${adminUser.lastName ?? ""}`.trim(),
            status: "ACTIVE",
        },
        create: {
            userId: adminUser.id,
            displayName: `${adminUser.firstName} ${adminUser.lastName ?? ""}`.trim(),
            status: "ACTIVE",
        },
    });

    const role = await tenantPrisma.role.findUnique({
        where: {
            name: "INSTITUTION_ADMIN",
        },
    });

    if (!role) {
        throw new Error("INSTITUTION_ADMIN role not found in tenant DB");
    }

    const existingAssignment = await tenantPrisma.userRole.findFirst({
        where: {
            userId: profile.id,
            roleId: role.id,
            campusId: null,
        },
    });

    if (!existingAssignment) {
        await tenantPrisma.userRole.create({
            data: {
                userId: profile.id,
                roleId: role.id,
                campusId: null,
            },
        });
    }

    console.log("Tenant admin assignment completed.");
    console.log(`User: ${email}`);
    console.log(`Tenant: ${membership.tenant.name}`);
    console.log("Role: INSTITUTION_ADMIN");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await adminPrisma.$disconnect();
        await tenantPrisma.$disconnect();
    });