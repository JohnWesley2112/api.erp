/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";

const RECORD_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

const text = (value: unknown, field: string, maxLength: number, required = false) => {
    if (value === undefined || value === null) {
        if (required) throw new AppError(`${field} is required`, 400, "VALIDATION_ERROR");
        return undefined;
    }
    if (typeof value !== "string") throw new AppError(`${field} must be a string`, 400, "VALIDATION_ERROR");
    const result = value.trim();
    if (!result && required) throw new AppError(`${field} is required`, 400, "VALIDATION_ERROR");
    if (result.length > maxLength) throw new AppError(`${field} exceeds ${maxLength} characters`, 400, "VALIDATION_ERROR");
    return result || undefined;
};

const parseDate = (value: unknown, field: string, required = false) => {
    if (value === undefined || value === null || value === "") {
        if (required) throw new AppError(`${field} is required`, 400, "VALIDATION_ERROR");
        return undefined;
    }
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new AppError(`${field} must be a valid date`, 400, "VALIDATION_ERROR");
    const isoDate = value.length > 10 ? value.slice(0, 10) : value;
    return new Date(`${isoDate}T00:00:00.000Z`);
};

const sessionSelect = {
    id: true, academicYearId: true, campusId: true, sectionId: true, attendanceDate: true,
    status: true, createdByUserId: true, createdAt: true, updatedAt: true,
    section: { select: { id: true, name: true, campusId: true, classId: true, class: { select: { id: true, name: true } } } },
};

const sessionDetailSelect = {
    ...sessionSelect,
    attendanceRecords: {
        orderBy: { createdAt: "asc" },
        select: {
            id: true, studentId: true, status: true, remarks: true, createdAt: true, updatedAt: true,
            student: { select: { id: true, admissionNumber: true, firstName: true, lastName: true } },
        },
    },
};

export class AttendanceService {
    private async campusScope(tenantDb: any, actorUserId?: string) {
        if (!actorUserId) return undefined;
        const profile = await tenantDb.userProfile.findUnique({
            where: { userId: actorUserId },
            select: { userRoles: { select: { campusId: true, role: { select: { name: true } } } } },
        });
        if (!profile) throw new AppError("User profile not found in this tenant", 404, "NOT_FOUND");
        if (profile.userRoles.some((assignment: any) => assignment.role?.name === "INSTITUTION_ADMIN")) return undefined;
        const campusIds = profile.userRoles
            .filter((assignment: any) => assignment.role?.name === "CAMPUS_ADMIN" || assignment.role?.name === "TEACHER")
            .map((assignment: any) => assignment.campusId)
            .filter(Boolean);
        return campusIds.length ? campusIds : ["__no_campus_access__"];
    }

    // Enforces that the actor is active, campus-scoped, and (for teachers) assigned to the section.
    private async assertSectionAccess(tenantDb: any, actorUserId: string, section: { id: string; campusId: string }) {
        const profile = await tenantDb.userProfile.findUnique({
            where: { userId: actorUserId },
            select: { userRoles: { select: { campusId: true, role: { select: { name: true } } } } },
        });
        if (!profile) throw new AppError("User profile not found in this tenant", 404, "NOT_FOUND");
        const roles = profile.userRoles as Array<{ campusId: string | null; role?: { name?: string } }>;
        if (roles.some((assignment) => assignment.role?.name === "INSTITUTION_ADMIN")) return;
        const campusMatch = roles.some((assignment) => assignment.campusId === section.campusId
            && (assignment.role?.name === "CAMPUS_ADMIN" || assignment.role?.name === "TEACHER"));
        if (!campusMatch) throw new AppError("You are not authorized for this section", 403, "FORBIDDEN");
        const isTeacher = roles.some((assignment) => assignment.role?.name === "TEACHER");
        if (!isTeacher) return;
        const teacher = await tenantDb.teacher.findUnique({ where: { userId: actorUserId }, select: { id: true, status: true } });
        if (!teacher || teacher.status !== "ACTIVE") throw new AppError("Teacher profile is inactive or not found", 403, "FORBIDDEN");
        const assignment = await tenantDb.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId: section.id }, select: { id: true } });
        if (!assignment) throw new AppError("You are not assigned to this section", 403, "FORBIDDEN");
    }

    async listSessions(tenantDb: any, actorUserId: string, options: { page?: number; pageSize?: number; sectionId?: string; date?: string } = {}) {
        const page = Math.max(Number(options.page ?? 1), 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        const where: any = {};
        if (campusIds) where.campusId = { in: campusIds };
        if (typeof options.sectionId === "string" && options.sectionId.trim()) where.sectionId = options.sectionId.trim();
        if (typeof options.date === "string" && options.date.trim()) where.attendanceDate = parseDate(options.date, "Date", true);
        const [total, items] = await Promise.all([
            tenantDb.attendanceSession.count({ where }),
            tenantDb.attendanceSession.findMany({ where, orderBy: { attendanceDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: sessionSelect }),
        ]);
        return { items, total, page, pageSize };
    }

    async getSession(tenantDb: any, actorUserId: string, sessionId: string) {
        const session = await tenantDb.attendanceSession.findUnique({ where: { id: sessionId }, select: sessionDetailSelect });
        if (!session) throw new AppError("Attendance session not found in this tenant", 404, "NOT_FOUND");
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        if (campusIds && !campusIds.includes(session.campusId)) throw new AppError("Attendance session access denied", 403, "FORBIDDEN");
        return session;
    }

    async createSession(tenantDb: any, actorUserId: string, input: Record<string, unknown>) {
        const sectionId = text(input.sectionId, "Section id", 100, true)!;
        const attendanceDate = parseDate(input.attendanceDate, "Attendance date", true)!;
        const section = await tenantDb.section.findUnique({ where: { id: sectionId }, select: { id: true, campusId: true, academicYearId: true } });
        if (!section) throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        await this.assertSectionAccess(tenantDb, actorUserId, section);
        if (await tenantDb.attendanceSession.findUnique({ where: { sectionId_attendanceDate: { sectionId, attendanceDate } }, select: { id: true } })) {
            throw new AppError("An attendance session already exists for this section and date", 409, "DUPLICATE_RESOURCE");
        }
        const session = await tenantDb.attendanceSession.create({
            data: { sectionId, campusId: section.campusId, academicYearId: section.academicYearId, attendanceDate, createdByUserId: actorUserId },
            select: sessionSelect,
        });
        await tenantDb.auditLog.create({ data: { actorUserId, action: "attendance.created", entityType: "attendance_session", entityId: session.id, metadata: { sessionId: session.id, sectionId, attendanceDate } as Prisma.InputJsonValue } });
        return session;
    }

    async addRecords(tenantDb: any, actorUserId: string, sessionId: string, input: Record<string, unknown>) {
        const rawRecords = Array.isArray(input.records) ? input.records : undefined;
        if (!rawRecords || !rawRecords.length) throw new AppError("At least one attendance record is required", 400, "VALIDATION_ERROR");

        const session = await tenantDb.attendanceSession.findUnique({ where: { id: sessionId }, select: { id: true, sectionId: true, campusId: true, status: true } });
        if (!session) throw new AppError("Attendance session not found in this tenant", 404, "NOT_FOUND");
        if (session.status !== "DRAFT") throw new AppError("Attendance records can only be added while the session is in DRAFT status", 409, "INVALID_STATE");
        await this.assertSectionAccess(tenantDb, actorUserId, { id: session.sectionId, campusId: session.campusId });

        const seen = new Set<string>();
        const parsed = rawRecords.map((record: any, index: number) => {
            const studentId = text(record?.studentId, `records[${index}].studentId`, 100, true)!;
            const recordStatus = text(record?.status, `records[${index}].status`, 20) ?? "PRESENT";
            if (!RECORD_STATUSES.includes(recordStatus)) throw new AppError(`records[${index}].status must be one of ${RECORD_STATUSES.join(", ")}`, 400, "VALIDATION_ERROR");
            const remarks = text(record?.remarks, `records[${index}].remarks`, 255) ?? null;
            if (seen.has(studentId)) throw new AppError("Duplicate student in attendance records", 400, "VALIDATION_ERROR");
            seen.add(studentId);
            return { studentId, status: recordStatus, remarks };
        });

        const enrolledCount = await tenantDb.enrollment.count({ where: { sectionId: session.sectionId, status: "ACTIVE", studentId: { in: [...seen] } } });
        if (enrolledCount !== seen.size) throw new AppError("One or more students do not belong to this section", 400, "VALIDATION_ERROR");

        const existing = await tenantDb.attendanceRecord.findMany({ where: { attendanceSessionId: sessionId, studentId: { in: [...seen] } }, select: { studentId: true } });
        if (existing.length) throw new AppError("An attendance record already exists for one or more students in this session", 409, "DUPLICATE_RESOURCE");

        return tenantDb.$transaction(async (tx: any) => {
            for (const record of parsed) {
                await tx.attendanceRecord.create({ data: { attendanceSessionId: sessionId, ...record } });
            }
            await tx.auditLog.create({ data: { actorUserId, action: "attendance.marked", entityType: "attendance_session", entityId: sessionId, metadata: { sessionId, studentIds: [...seen] } as Prisma.InputJsonValue } });
            return tx.attendanceSession.findUnique({ where: { id: sessionId }, select: sessionDetailSelect });
        });
    }

    async submitSession(tenantDb: any, actorUserId: string, sessionId: string) {
        const session = await tenantDb.attendanceSession.findUnique({ where: { id: sessionId }, select: { id: true, sectionId: true, campusId: true, status: true } });
        if (!session) throw new AppError("Attendance session not found in this tenant", 404, "NOT_FOUND");
        if (session.status !== "DRAFT") throw new AppError("Attendance session has already been submitted", 409, "INVALID_STATE");
        await this.assertSectionAccess(tenantDb, actorUserId, { id: session.sectionId, campusId: session.campusId });
        await tenantDb.attendanceSession.update({ where: { id: sessionId }, data: { status: "SUBMITTED" } });
        await tenantDb.auditLog.create({ data: { actorUserId, action: "attendance.submitted", entityType: "attendance_session", entityId: sessionId, metadata: { sessionId } as Prisma.InputJsonValue } });
        return this.getSession(tenantDb, actorUserId, sessionId);
    }
}
