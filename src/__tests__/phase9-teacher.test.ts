import { describe, expect, it, vi } from "vitest";
import { TeacherService } from "../modules/teacher/teacher.service.js";
import { IamService } from "../modules/iam/iam.service.js";

const actor = "user-1";
const teacher = { id: "teacher-1", userId: null, campusId: "campus-1", employeeCode: "T-1", firstName: "Ada", lastName: "Lovelace", status: "ACTIVE", campus: { id: "campus-1", name: "Bangalore", code: "BLR" } };
type RoleAssignment = { campusId: string | null; role: { name: string } };
const buildDb = (roles: RoleAssignment[] = [{ campusId: null, role: { name: "INSTITUTION_ADMIN" } }]) => ({
    userProfile: { findUnique: vi.fn().mockResolvedValue({ userRoles: roles }) },
    campus: { findUnique: vi.fn().mockResolvedValue({ id: "campus-1" }) },
    teacher: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([teacher]), findUnique: vi.fn().mockResolvedValue(teacher), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(teacher), update: vi.fn().mockResolvedValue(teacher) },
    userProfileForLink: { findUnique: vi.fn() },
    subject: { findUnique: vi.fn().mockResolvedValue({ id: "subject-1" }) },
    section: { findUnique: vi.fn().mockResolvedValue({ id: "section-1", campusId: "campus-1" }) },
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
        const result = await new TeacherService().createTeacher(db, actor, { firstName: "Ada", employeeCode: "t-1", campusId: "campus-1" });
        expect(result.id).toBe("teacher-1");
        expect(db.teacher.create).toHaveBeenCalled();
    });

    it("lists only the actor's campus for campus-scoped access", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "CAMPUS_ADMIN" } }]);
        await new TeacherService().listTeachers(db, actor);
        expect(db.teacher.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { campusId: { in: ["campus-1"] } } }));
    });

    it("rejects access to a teacher from another campus", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "CAMPUS_ADMIN" } }]);
        db.teacher.findUnique.mockResolvedValue({ ...teacher, campusId: "campus-2" });
        await expect(new TeacherService().getTeacher(db, actor, "teacher-2")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("updates a teacher", async () => {
        const db = buildDb();
        await new TeacherService().updateTeacher(db, actor, "teacher-1", { lastName: "Byron" });
        expect(db.teacher.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "teacher-1" }, data: { lastName: "Byron" } }));
    });

    it("rejects an assignment when campuses differ", async () => {
        const db = buildDb();
        db.section.findUnique.mockResolvedValue({ id: "section-1", campusId: "campus-2" });
        await expect(new TeacherService().createAssignment(db, actor, "teacher-1", { subjectId: "subject-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects duplicate assignments", async () => {
        const db = buildDb();
        db.teacherAssignment.findUnique.mockResolvedValue({ id: "existing" });
        await expect(new TeacherService().createAssignment(db, actor, "teacher-1", { subjectId: "subject-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 409 });
    });
});
