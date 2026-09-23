import { describe, expect, it, vi } from "vitest";
import { AttendanceService } from "../modules/attendance/attendance.service.js";

const actor = "user-1";

const session = {
    id: "session-1", academicYearId: "year-1", campusId: "campus-1", sectionId: "section-1",
    attendanceDate: new Date("2026-09-19T00:00:00.000Z"), status: "DRAFT", createdByUserId: actor,
};

const buildDb = (roles: Array<{ campusId: string | null; role: { name: string } }> = [{ campusId: null, role: { name: "INSTITUTION_ADMIN" } }]) => {
    const db: Record<string, unknown> = {
        userProfile: { findUnique: vi.fn().mockResolvedValue({ userRoles: roles }) },
        section: { findUnique: vi.fn().mockResolvedValue({ id: "section-1", campusId: "campus-1", academicYearId: "year-1" }) },
        teacher: { findUnique: vi.fn().mockResolvedValue({ id: "teacher-1", status: "ACTIVE" }) },
        teacherAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "assignment-1" }) },
        enrollment: { count: vi.fn().mockResolvedValue(1) },
        attendanceRecord: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
        attendanceSession: {
            count: vi.fn().mockResolvedValue(1),
            findMany: vi.fn().mockResolvedValue([session]),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(session),
            update: vi.fn().mockResolvedValue({ ...session, status: "SUBMITTED" }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    db.$transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback(db));
    return db as unknown as {
        userProfile: { findUnique: ReturnType<typeof vi.fn> };
        section: { findUnique: ReturnType<typeof vi.fn> };
        teacher: { findUnique: ReturnType<typeof vi.fn> };
        teacherAssignment: { findFirst: ReturnType<typeof vi.fn> };
        enrollment: { count: ReturnType<typeof vi.fn> };
        attendanceRecord: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
        attendanceSession: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
        auditLog: { create: ReturnType<typeof vi.fn> };
        $transaction: ReturnType<typeof vi.fn>;
    };
};

describe("Phase 11 attendance", () => {
    it("creates an attendance session for a valid section", async () => {
        const db = buildDb();
        const result = await new AttendanceService().createSession(db, actor, { sectionId: "section-1", attendanceDate: "2026-09-19" });
        expect(result.id).toBe("session-1");
        expect(db.attendanceSession.create).toHaveBeenCalled();
    });

    it("rejects a duplicate attendance session for the same section and date", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue(session);
        await expect(new AttendanceService().createSession(db, actor, { sectionId: "section-1", attendanceDate: "2026-09-19" }))
            .rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects marking attendance for a teacher with no section assignment", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "TEACHER" } }]);
        db.teacherAssignment.findFirst.mockResolvedValue(null);
        await expect(new AttendanceService().createSession(db, actor, { sectionId: "section-1", attendanceDate: "2026-09-19" }))
            .rejects.toMatchObject({ statusCode: 403 });
    });

    it("allows a teacher assigned to the section to mark attendance", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "TEACHER" } }]);
        const result = await new AttendanceService().createSession(db, actor, { sectionId: "section-1", attendanceDate: "2026-09-19" });
        expect(result.id).toBe("session-1");
    });

    it("rejects attendance records for students outside the session's section", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue(session);
        db.enrollment.count.mockResolvedValue(0);
        await expect(new AttendanceService().addRecords(db, actor, "session-1", { records: [{ studentId: "student-1", status: "PRESENT" }] }))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a duplicate attendance record for the same student and session", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue(session);
        db.attendanceRecord.findMany.mockResolvedValue([{ studentId: "student-1" }]);
        await expect(new AttendanceService().addRecords(db, actor, "session-1", { records: [{ studentId: "student-1", status: "PRESENT" }] }))
            .rejects.toMatchObject({ statusCode: 409 });
    });

    it("adds attendance records for a draft session", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue(session);
        db.enrollment.count.mockResolvedValue(2);
        const result = await new AttendanceService().addRecords(db, actor, "session-1", { records: [{ studentId: "student-1", status: "PRESENT" }, { studentId: "student-2", status: "ABSENT", remarks: "Sick" }] });
        expect(db.attendanceRecord.create).toHaveBeenCalledTimes(2);
        expect(result.id).toBe("session-1");
    });

    it("rejects records once the session has been submitted", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue({ ...session, status: "SUBMITTED" });
        await expect(new AttendanceService().addRecords(db, actor, "session-1", { records: [{ studentId: "student-1", status: "PRESENT" }] }))
            .rejects.toMatchObject({ statusCode: 409 });
    });

    it("submits a draft session", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique
            .mockResolvedValueOnce({ ...session, status: "DRAFT" })
            .mockResolvedValueOnce({ ...session, status: "SUBMITTED", attendanceRecords: [] });
        const result = await new AttendanceService().submitSession(db, actor, "session-1");
        expect(db.attendanceSession.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "session-1" }, data: { status: "SUBMITTED" } }));
        expect(result.status).toBe("SUBMITTED");
    });

    it("rejects submitting an already-submitted session", async () => {
        const db = buildDb();
        db.attendanceSession.findUnique.mockResolvedValue({ ...session, status: "SUBMITTED" });
        await expect(new AttendanceService().submitSession(db, actor, "session-1")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("filters attendance session lists to the actor's campus", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "CAMPUS_ADMIN" } }]);
        await new AttendanceService().listSessions(db, actor);
        expect(db.attendanceSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { campusId: { in: ["campus-1"] } } }));
    });

    it("rejects access to a session from another campus", async () => {
        const db = buildDb([{ campusId: "campus-1", role: { name: "CAMPUS_ADMIN" } }]);
        db.attendanceSession.findUnique.mockResolvedValue({ ...session, campusId: "campus-2", attendanceRecords: [] });
        await expect(new AttendanceService().getSession(db, actor, "session-1")).rejects.toMatchObject({ statusCode: 403 });
    });
});
