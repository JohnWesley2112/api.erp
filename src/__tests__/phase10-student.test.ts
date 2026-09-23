import { describe, expect, it, vi } from "vitest";
import { StudentService } from "../modules/student/student.service.js";

const actor = "user-1";
const student = { id: "student-1", admissionNumber: "ADM-1", firstName: "John", middleName: null, lastName: "Doe", dateOfBirth: null, gender: null, status: "ACTIVE", enrollments: [{ id: "enrollment-1", campusId: "campus-1" }] };
const buildDb = (roles = [{ campusId: "campus-1", role: { name: "CAMPUS_ADMIN" } }]) => ({
    userProfile: { findUnique: vi.fn().mockResolvedValue({ userRoles: roles }) },
    student: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([student]), findUnique: vi.fn().mockResolvedValue(student), create: vi.fn().mockResolvedValue({ id: "student-1" }), update: vi.fn().mockResolvedValue(student) },
    enrollment: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "enrollment-1" }) },
    academicYear: { findUnique: vi.fn().mockResolvedValue({ id: "year-1" }) }, campus: { findUnique: vi.fn().mockResolvedValue({ id: "campus-1" }) }, class: { findUnique: vi.fn().mockResolvedValue({ id: "class-1" }) },
    section: { findUnique: vi.fn().mockResolvedValue({ id: "section-1", academicYearId: "year-1", campusId: "campus-1", classId: "class-1" }) }, auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (callback: (db: unknown) => unknown) => callback(undefined)),
});

describe("Phase 10 students and enrollment", () => {
    it("filters student lists to the actor's campus", async () => {
        const db = buildDb(); await new StudentService().listStudents(db, actor);
        expect(db.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollments: { some: { campusId: { in: ["campus-1"] } } } } }));
    });

    it("rejects a section whose campus, year, or class does not match", async () => {
        const db = buildDb(); db.section.findUnique.mockResolvedValue({ id: "section-1", academicYearId: "year-2", campusId: "campus-1", classId: "class-1" });
        await expect(new StudentService().createStudent(db, actor, { admissionNumber: "ADM-1", firstName: "John", academicYearId: "year-1", campusId: "campus-1", classId: "class-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a duplicate admission number in the campus and year", async () => {
        const db = buildDb(); db.enrollment.findFirst.mockResolvedValue({ id: "existing" });
        await expect(new StudentService().createStudent(db, actor, { admissionNumber: "ADM-1", firstName: "John", academicYearId: "year-1", campusId: "campus-1", classId: "class-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects enrollment into a campus outside the actor scope", async () => {
        const db = buildDb();
        await expect(new StudentService().createEnrollment(db, actor, "student-1", { admissionNumber: "ADM-2", academicYearId: "year-1", campusId: "campus-2", classId: "class-1", sectionId: "section-1" })).rejects.toMatchObject({ statusCode: 403 });
    });

    it("updates student identity without changing enrollment history", async () => {
        const db = buildDb(); await new StudentService().updateStudent(db, actor, "student-1", { lastName: "Smith" });
        expect(db.student.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "student-1" }, data: { lastName: "Smith" } }));
        expect(db.enrollment.create).not.toHaveBeenCalled();
    });
});