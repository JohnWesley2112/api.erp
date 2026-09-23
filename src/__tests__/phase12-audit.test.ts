import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../modules/audit/audit.service.js";
import { AttendanceService } from "../modules/attendance/attendance.service.js";

describe("Phase 12 audit logs", () => {
    describe("AuditService.listAuditLogs", () => {
        const buildDb = (logs: unknown[] = []) => ({
            auditLog: {
                count: vi.fn().mockResolvedValue(logs.length),
                findMany: vi.fn().mockResolvedValue(logs),
            },
        });

        it("lists audit logs with pagination defaults", async () => {
            const logs = [{ id: "log-1", actorUserId: "user-1", action: "student.created", entityType: "student", entityId: "student-1", metadata: null, createdAt: new Date() }];
            const db = buildDb(logs);
            const result = await new AuditService().listAuditLogs(db, {});
            expect(result.items).toEqual(logs);
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
            expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {}, orderBy: { createdAt: "desc" }, skip: 0, take: 20 }));
        });

        it("filters audit logs by actorUserId, action, and entityType", async () => {
            const db = buildDb();
            await new AuditService().listAuditLogs(db, { actorUserId: "user-1", action: "student.created", entityType: "student" });
            expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { actorUserId: "user-1", action: "student.created", entityType: "student" },
            }));
        });

        it("filters audit logs by a date range", async () => {
            const db = buildDb();
            await new AuditService().listAuditLogs(db, { from: "2026-09-01", to: "2026-09-19" });
            expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { createdAt: { gte: new Date("2026-09-01T00:00:00.000Z"), lte: new Date("2026-09-19T23:59:59.999Z") } },
            }));
        });

        it("rejects an invalid date filter", async () => {
            const db = buildDb();
            await expect(new AuditService().listAuditLogs(db, { from: "not-a-date" })).rejects.toMatchObject({ statusCode: 400 });
        });
    });

    describe("Attendance module audit integration", () => {
        const actor = "user-1";
        const session = {
            id: "session-1", academicYearId: "year-1", campusId: "campus-1", sectionId: "section-1",
            attendanceDate: new Date("2026-09-19T00:00:00.000Z"), status: "DRAFT", createdByUserId: actor,
        };

        const buildDb = () => {
            const db: Record<string, unknown> = {
                userProfile: { findUnique: vi.fn().mockResolvedValue({ userRoles: [{ campusId: null, role: { name: "INSTITUTION_ADMIN" } }] }) },
                section: { findUnique: vi.fn().mockResolvedValue({ id: "section-1", campusId: "campus-1", academicYearId: "year-1" }) },
                enrollment: { count: vi.fn().mockResolvedValue(1) },
                attendanceRecord: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
                attendanceSession: {
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
                enrollment: { count: ReturnType<typeof vi.fn> };
                attendanceRecord: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
                attendanceSession: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
                auditLog: { create: ReturnType<typeof vi.fn> };
                $transaction: ReturnType<typeof vi.fn>;
            };
        };

        it("records an attendance.created audit event when a session is created", async () => {
            const db = buildDb();
            await new AttendanceService().createSession(db, actor, { sectionId: "section-1", attendanceDate: "2026-09-19" });
            expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: actor, action: "attendance.created", entityType: "attendance_session", entityId: "session-1" }) }));
        });

        it("records an attendance.marked audit event when records are added", async () => {
            const db = buildDb();
            db.attendanceSession.findUnique.mockResolvedValue({ ...session });
            db.enrollment.count.mockResolvedValue(1);
            await new AttendanceService().addRecords(db, actor, "session-1", { records: [{ studentId: "student-1", status: "PRESENT" }] });
            expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: actor, action: "attendance.marked", entityType: "attendance_session", entityId: "session-1" }) }));
        });

        it("records an attendance.submitted audit event when a session is submitted", async () => {
            const db = buildDb();
            db.attendanceSession.findUnique
                .mockResolvedValueOnce({ ...session, status: "DRAFT" })
                .mockResolvedValueOnce({ ...session, status: "SUBMITTED", attendanceRecords: [] });
            await new AttendanceService().submitSession(db, actor, "session-1");
            expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: actor, action: "attendance.submitted", entityType: "attendance_session", entityId: "session-1" }) }));
        });
    });
});
