import { describe, expect, it, vi } from "vitest";
import { TeacherService } from "../modules/teacher/teacher.service.js";
import { IamService } from "../modules/iam/iam.service.js";

const actor = "user-1";
const teacher = { id: "teacher-1", userId: null, employeeCode: "T-1", firstName: "Ada", lastName: "Lovelace", status: "ACTIVE" };
type RoleAssignment = { role: { name: string } };
const buildDb = (roles: RoleAssignment[] = [{ role: { name: "INSTITUTION_ADMIN" } }]) => ({
    userProfile: { findUnique: vi.fn().mockResolvedValue({ userRoles: roles }) },
    teacher: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([teacher]), findUnique: vi.fn().mockResolvedValue(teacher), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(teacher), update: vi.fn().mockResolvedValue(teacher) },
    userProfileForLink: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn().mockResolvedValue({ id: "subject-1" }) },
    section: { findUnique: vi.fn().mockResolvedValue({ id: "section-1" }) },
    teacherAssignment: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "assignment-1", teacherId: "teacher-1", subjectId: "subject-1", sectionId: "section-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
});

describe("Phase 9 teachers and assignments", () => {
    it("enforces teacher permissions through RBAC", async () => {
        const allowed = await new IamService().hasPermission({
            userId: actor,
            permission: "teacher.create",
            tenantDb: {
                userProfile: { findUnique: vi.fn().mockResolvedValue({ id: "profile-1" }) },
                userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: "role-1", role: { name: "CAMPUS_ADMIN" } }]) },
                role: { findMany: vi.fn().mockResolvedValue([{ rolePermissions: [{ permission: { code: "teacher.read" } }] }]) },
            },
        });
        expect(allowed).toBe(false);
    });

    it("creates a tenant-local teacher", async () => {
        const db = buildDb();
        const result = await new TeacherService().createTeacher(db, actor, { firstName: "Ada", employeeCode: "t-1" });
        expect(result.id).toBe("teacher-1");
        expect(db.teacher.create).toHaveBeenCalled();
    });

    it("lists teachers across the whole Tenant without a campus filter", async () => {
        const db = buildDb([{ role: { name: "CAMPUS_ADMIN" } }]);
        await new TeacherService().listTeachers(db, actor);
        expect(db.teacher.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it("rejects a duplicate employee code in the Tenant", async () => {
        const db = buildDb();
        db.teacher.findFirst.mockResolvedValue({ id: "existing" });
        await expect(new TeacherService().createTeacher(db, actor, { firstName: "Ada", employeeCode: "T-1" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("updates a teacher", async () => {
        const db = buildDb();
        await new TeacherService().updateTeacher(db, actor, "teacher-1", { lastName: "Byron" });
        expect(db.teacher.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "teacher-1" }, data: { lastName: "Byron" } }));
    });

    it("rejects duplicate assignments", async () => {
        const db = buildDb();
        db.teacherAssignment.findUnique.mockResolvedValue({ id: "existing" });
        await expect(new TeacherService().createAssignment(db, actor, "teacher-1", { subjectId: "subject-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 409 });
    });
});
