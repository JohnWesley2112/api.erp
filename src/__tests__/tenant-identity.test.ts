import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../node_modules/.prisma/tenant-client/index.js", () => ({ PrismaClient: vi.fn() }));
vi.mock("../../node_modules/.prisma/admin-client/index.js", () => ({ PrismaClient: vi.fn() }));
vi.mock("../logs/Logger.js", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { generateAccessToken, verifyToken } from "../helpers/jwt-helper.js";
import { buildTenantDatabaseUrl } from "../infrastructure/database/tenant-connection-manager.js";

const adminSchema = readFileSync(new URL("../../prisma/admin/schema.prisma", import.meta.url), "utf8");

const modelBlock = (name: string) => {
    const match = adminSchema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    if (!match) throw new Error(`model ${name} not found`);
    return match[0];
};

describe("Tenant identity (admin schema)", () => {
    it("uses a sequential integer primary key", () => {
        expect(modelBlock("Tenant")).toMatch(/\bid\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
    });

    it("keeps code as required unique metadata, not the identity", () => {
        const tenant = modelBlock("Tenant");
        expect(tenant).toMatch(/\bcode\s+String\s+@unique/);
        expect(tenant).not.toMatch(/\bcode\s+String\?/);
        expect(tenant).not.toMatch(/@@id/);
    });

    it("references Tenant.id with integer foreign keys", () => {
        for (const name of ["UserTenantMembership", "TenantDatabaseConfig"]) {
            const block = modelBlock(name);
            expect(block).toMatch(/\btenantId\s+Int\b/);
            expect(block).toMatch(/references: \[id\]/);
            expect(block).not.toMatch(/tenantId\s+String/);
        }
    });

    it("does not introduce a Campus model or campusId in the admin schema", () => {
        expect(adminSchema).not.toMatch(/model Campus/);
        expect(adminSchema).not.toMatch(/campusId/);
    });
});

describe("Tenant DB schema (Tenant is the campus)", () => {
    const tenantSchema = readFileSync(new URL("../../prisma/tenant/schema.prisma", import.meta.url), "utf8");

    it("has no Campus model, enum or campusId column", () => {
        expect(tenantSchema).not.toMatch(/model Campus\b/);
        expect(tenantSchema).not.toMatch(/CampusStatus/);
        expect(tenantSchema).not.toMatch(/campusId|campus_id/);
    });

    it("stores a unique permanent admission number on Student only", () => {
        const student = tenantSchema.match(/model Student \{[\s\S]*?\n\}/)![0];
        const enrollment = tenantSchema.match(/model Enrollment \{[\s\S]*?\n\}/)![0];
        expect(student).toMatch(/admissionNumber\s+String\s+@unique/);
        expect(enrollment).not.toMatch(/admissionNumber/);
    });

    it("keeps a per-academic-year admission serial counter", () => {
        expect(tenantSchema).toMatch(/model AdmissionSerial \{[\s\S]*?academicYearId\s+String\s+@id[\s\S]*?lastSerial\s+Int/);
    });

    it("does not cascade-delete historical student data", () => {
        const enrollment = tenantSchema.match(/model Enrollment \{[\s\S]*?\n\}/)![0];
        expect(enrollment).not.toMatch(/onDelete: Cascade/);
        expect(tenantSchema.match(/model AttendanceRecord \{[\s\S]*?\n\}/)![0]).toMatch(/student\s+Student\s+@relation\([^)]*onDelete: Restrict/);
    });
});

describe("numeric tenantId handling", () => {
    it("round-trips a numeric tenantId through the JWT", () => {
        const token = generateAccessToken({ userId: "u1", email: "u@example.com", tenantId: 4 });
        expect(verifyToken(token).tenantId).toBe(4);
    });

    it("ignores non-numeric tenantId claims", () => {
        const token = generateAccessToken({ userId: "u1", email: "u@example.com", tenantId: "abc" as unknown as number });
        expect(verifyToken(token).tenantId).toBeUndefined();
    });

    it("builds tenant database names from the numeric id without padding", () => {
        expect(buildTenantDatabaseUrl(1)).toMatch(/\/systra_tenant_1$/);
        expect(buildTenantDatabaseUrl(1234)).toMatch(/\/systra_tenant_1234$/);
    });

    it("rejects invalid tenant ids", () => {
        for (const bad of [0, -1, 1.5, Number.NaN]) {
            expect(() => buildTenantDatabaseUrl(bad)).toThrow();
        }
    });
});
