import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../../node_modules/.prisma/admin-client";

const prisma = new PrismaClient({
    datasourceUrl: process.env.ADMIN_DATABASE_URL,
});

async function main() {
    const email = "admin@systra.local";
    const password = "Admin@123";

    const passwordHash = await bcrypt.hash(password, 12);

    const tenant = await prisma.tenant.upsert({
        where: { code: "DEMO" },
        update: {
            name: "Systra Demo School",
            status: "ACTIVE",
        },
        create: {
            name: "Systra Demo School",
            code: "DEMO",
            status: "ACTIVE",
        },
    });

    await prisma.tenantDatabaseConfig.upsert({
        where: { tenantId: tenant.id },
        update: {
            databaseName: "erpdb_tenant",
            host: "localhost",
            port: 5432,
            username: "postgres",
            passwordSecretRef: "TENANT_DB_PASSWORD",
            status: "ACTIVE",
        },
        create: {
            tenantId: tenant.id,
            databaseName: "erpdb_tenant",
            host: "localhost",
            port: 5432,
            username: "postgres",
            passwordSecretRef: "TENANT_DB_PASSWORD",
            status: "ACTIVE",
        },
    });

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash,
            firstName: "John",
            lastName: "Wesley",
            status: "ACTIVE",
        },
        create: {
            email,
            passwordHash,
            firstName: "John",
            lastName: "Wesley",
            status: "ACTIVE",
        },
    });

    await prisma.userTenantMembership.upsert({
        where: {
            userId_tenantId: {
                userId: user.id,
                tenantId: tenant.id,
            },
        },
        update: {
            status: "ACTIVE",
        },
        create: {
            userId: user.id,
            tenantId: tenant.id,
            status: "ACTIVE",
        },
    });

    console.log("Admin seed completed.");
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Tenant: ${tenant.name}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });