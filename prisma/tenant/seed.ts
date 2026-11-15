import "dotenv/config";
import { PrismaClient } from "../../node_modules/.prisma/tenant-client";
import { DEFAULT_ROLE_PERMISSIONS } from "../../src/modules/iam/iam.service.js";

// const prisma = new PrismaClient({
//     datasourceUrl: process.env.TENANT_DATABASE_URL,
// });

const prisma = new PrismaClient({
    datasourceUrl: `postgresql://${encodeURIComponent(process.env.TENANT_DB_USERNAME)}:${encodeURIComponent(
        process.env.TENANT_DB_PASSWORD ?? ""
    )}@localhost:5432/erpdb_tenant`,
});

async function main() {

    await prisma.institution.upsert({
        where: { code: "DEMO" },
        update: {
            name: "Systra Demo School",
            email: "admin@systra.local",
        },
        create: {
            id: crypto.randomUUID(),
            name: "Systra Demo School",
            code: "DEMO",
            email: "admin@systra.local",
        },
    });

    const roles = [
        { name: "INSTITUTION_ADMIN", description: "Institution-wide administration" },
        { name: "CAMPUS_ADMIN", description: "Tenant (campus) administration" },
        { name: "TEACHER", description: "Teacher access to assigned academic resources" },
    ] as const;

    const permissions = [
        { code: "institution.read", description: "Read institution profile" },
        { code: "institution.manage", description: "Manage institution profile" },
        { code: "student.read", description: "Read student records" },
        { code: "student.create", description: "Create student records" },
        { code: "student.update", description: "Update student records" },
        { code: "teacher.read", description: "Read teacher records" },
        { code: "teacher.create", description: "Create teacher records" },
        { code: "teacher.update", description: "Update teacher records" },
        { code: "academic.read", description: "Read academic data" },
        { code: "academic.manage", description: "Manage academic data" },
        { code: "user.read", description: "Read user data" },
        { code: "user.manage", description: "Manage user data" },
        { code: "role.read", description: "Read role data" },
        { code: "role.manage", description: "Manage role data" },
        { code: "attendance.read", description: "Read attendance data" },
        { code: "attendance.mark", description: "Mark attendance" },
        { code: "attendance.submit", description: "Submit attendance" },
        { code: "audit.read", description: "Read audit logs" },
    ] as const;

    for (const item of permissions) {
        await prisma.permission.upsert({
            where: { code: item.code },
            update: { description: item.description },
            create: { id: crypto.randomUUID(), ...item },
        });
    }

    const createdRoles = [] as Array<{ id: string; name: string }>;
    for (const role of roles) {
        const record = await prisma.role.upsert({
            where: { name: role.name },
            update: { description: role.description },
            create: { id: crypto.randomUUID(), ...role },
        });
        createdRoles.push(record);
    }

    const permissionRecords = await prisma.permission.findMany({
        where: { code: { in: permissions.map((permission) => permission.code) } },
        select: { id: true, code: true },
    });
    const permissionIdsByCode = new Map(
        permissionRecords.map((permission) => [permission.code, permission.id]),
    );

    await prisma.$transaction(async (tx) => {
        for (const role of createdRoles) {
            const permissionCodes = DEFAULT_ROLE_PERMISSIONS[role.name] ?? [];
            const permissionIds = permissionCodes.map((code) => {
                const permissionId = permissionIdsByCode.get(code);
                if (!permissionId) {
                    throw new Error(`Seeded permission ${code} was not found`);
                }

                return permissionId;
            });

            await tx.rolePermission.deleteMany({
                where: {
                    roleId: role.id,
                    permissionId: { notIn: permissionIds },
                },
            });

            for (const permissionId of permissionIds) {
                await tx.rolePermission.upsert({
                    where: { roleId_permissionId: { roleId: role.id, permissionId } },
                    update: {},
                    create: { roleId: role.id, permissionId },
                });
            }
        }
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
