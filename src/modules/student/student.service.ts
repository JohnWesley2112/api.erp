/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";

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

const date = (value: unknown, field: string) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new AppError(`${field} must be a valid date`, 400, "VALIDATION_ERROR");
    return new Date(value);
};

const studentSelect = {
    id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
    dateOfBirth: true, gender: true, status: true, createdAt: true, updatedAt: true,
    enrollments: {
        orderBy: { enrolledAt: "desc" },
        include: {
            academicYear: { select: { id: true, name: true } }, campus: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true } },
        },
    },
};

export class StudentService {
    private async campusScope(db: any, actorUserId: string) {
        const profile = await db.userProfile.findUnique({ where: { userId: actorUserId }, select: { userRoles: { select: { campusId: true, role: { select: { name: true } } } } } });
        if (!profile) throw new AppError("User profile not found in this tenant", 404, "NOT_FOUND");
        if (profile.userRoles.some((item: any) => item.role?.name === "INSTITUTION_ADMIN")) return undefined;
        const ids = profile.userRoles.filter((item: any) => item.role?.name === "CAMPUS_ADMIN" || item.role?.name === "TEACHER").map((item: any) => item.campusId).filter(Boolean);
        return ids.length ? ids : ["__no_campus_access__"];
    }

    private async scopedStudent(db: any, actorUserId: string, studentId: string) {
        const campusIds = await this.campusScope(db, actorUserId);
        const student = await db.student.findUnique({ where: { id: studentId }, select: studentSelect }) as any;
        if (!student) throw new AppError("Student not found in this tenant", 404, "NOT_FOUND");
        if (campusIds && !student.enrollments.some((enrollment: any) => campusIds.includes(enrollment.campusId))) throw new AppError("Student access denied", 403, "FORBIDDEN");
        if (campusIds) student.enrollments = student.enrollments.filter((enrollment: any) => campusIds.includes(enrollment.campusId));
        return student;
    }

    private async validateEnrollment(db: any, actorUserId: string, input: Record<string, unknown>, studentId?: string) {
        const academicYearId = text(input.academicYearId, "Academic year id", 100, true)!;
        const campusId = text(input.campusId, "Campus id", 100, true)!;
        const classId = text(input.classId, "Class id", 100, true)!;
        const sectionId = text(input.sectionId, "Section id", 100, true)!;
        const admissionNumber = text(input.admissionNumber, "Admission number", 100, true)!.toUpperCase();
        const enrolledAt = date(input.enrolledAt ?? new Date().toISOString(), "Enrolled at")!;
        const campusIds = await this.campusScope(db, actorUserId);
        if (campusIds && !campusIds.includes(campusId)) throw new AppError("Campus access denied", 403, "FORBIDDEN");
        const [year, campus, academicClass, section] = await Promise.all([
            db.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } }),
            db.campus.findUnique({ where: { id: campusId }, select: { id: true } }),
            db.class.findUnique({ where: { id: classId }, select: { id: true } }),
            db.section.findUnique({ where: { id: sectionId }, select: { id: true, academicYearId: true, campusId: true, classId: true } }),
        ]);
        if (!year) throw new AppError("Academic year not found in this tenant", 404, "NOT_FOUND");
        if (!campus) throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        if (!academicClass) throw new AppError("Class not found in this tenant", 404, "NOT_FOUND");
        if (!section) throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        if (section.academicYearId !== academicYearId || section.campusId !== campusId || section.classId !== classId) throw new AppError("Section does not match the academic year, campus, and class", 400, "VALIDATION_ERROR");
        if (await db.enrollment.findFirst({ where: { campusId, academicYearId, admissionNumber }, select: { id: true } })) throw new AppError("This admission number is already enrolled on this campus for the academic year", 409, "DUPLICATE_RESOURCE");
        if (studentId && await db.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } }, select: { id: true } })) throw new AppError("This student is already enrolled for the academic year", 409, "DUPLICATE_RESOURCE");
        return { academicYearId, campusId, classId, sectionId, admissionNumber, enrolledAt };
    }

    async listStudents(db: any, actorUserId: string, options: Record<string, unknown> = {}) {
        const page = Math.max(Number(options.page ?? 1), 1); const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100); const campusIds = await this.campusScope(db, actorUserId);
        const enrollmentWhere: any = {};
        if (campusIds) enrollmentWhere.campusId = { in: campusIds };
        for (const field of ["campusId", "academicYearId", "classId", "sectionId"]) if (typeof options[field] === "string") enrollmentWhere[field] = options[field];
        if (typeof options.status === "string") enrollmentWhere.status = options.status.toUpperCase();
        const where: any = { enrollments: { some: enrollmentWhere } };
        const search = typeof options.search === "string" ? options.search.trim() : "";
        if (search) where.OR = ["firstName", "middleName", "lastName", "admissionNumber"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } }));
        const [total, items] = await Promise.all([db.student.count({ where }), db.student.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: studentSelect })]);
        if (campusIds) for (const item of items) item.enrollments = item.enrollments.filter((enrollment: any) => campusIds.includes(enrollment.campusId));
        return { items, total, page, pageSize };
    }

    async getStudent(db: any, actorUserId: string, studentId: string) { return this.scopedStudent(db, actorUserId, studentId); }

    async createStudent(db: any, actorUserId: string, input: Record<string, unknown>) {
        const admissionNumber = text(input.admissionNumber, "Admission number", 100, true)!.toUpperCase(); const firstName = text(input.firstName, "First name", 100, true)!;
        const data = { admissionNumber, firstName, middleName: text(input.middleName, "Middle name", 100) ?? null, lastName: text(input.lastName, "Last name", 100) ?? null, dateOfBirth: date(input.dateOfBirth, "Date of birth") ?? null, gender: text(input.gender, "Gender", 50) ?? null, status: (text(input.status, "Status", 20) ?? "ACTIVE") };
        if (!["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"].includes(data.status)) throw new AppError("Invalid student status", 400, "VALIDATION_ERROR");
        const enrollment = await this.validateEnrollment(db, actorUserId, input);
        return db.$transaction(async (tx: any) => {
            const student = await tx.student.create({ data, select: { id: true } });
            await tx.enrollment.create({ data: { ...enrollment, studentId: student.id, status: "ACTIVE" }, select: { id: true } });
            await tx.auditLog.create({ data: { actorUserId, action: "student.created", entityType: "student", entityId: student.id, metadata: { studentId: student.id, enrollment: { academicYearId: enrollment.academicYearId, campusId: enrollment.campusId } } as Prisma.InputJsonValue } });
            return this.scopedStudent(tx, actorUserId, student.id);
        });
    }

    async updateStudent(db: any, actorUserId: string, studentId: string, input: Record<string, unknown>) {
        await this.scopedStudent(db, actorUserId, studentId); const data: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(input, "firstName")) data.firstName = text(input.firstName, "First name", 100, true);
        if (Object.prototype.hasOwnProperty.call(input, "middleName")) data.middleName = text(input.middleName, "Middle name", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "lastName")) data.lastName = text(input.lastName, "Last name", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "dateOfBirth")) data.dateOfBirth = date(input.dateOfBirth, "Date of birth") ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "gender")) data.gender = text(input.gender, "Gender", 50) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const nextStatus = text(input.status, "Status", 20);
            if (!nextStatus || !["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"].includes(nextStatus)) throw new AppError("Invalid student status", 400, "VALIDATION_ERROR");
            data.status = nextStatus;
        }
        if (!Object.keys(data).length) throw new AppError("No valid student fields were provided for update", 400, "VALIDATION_ERROR");
        await db.student.update({ where: { id: studentId }, data }); await db.auditLog.create({ data: { actorUserId, action: "student.updated", entityType: "student", entityId: studentId, metadata: { studentId, changes: Object.keys(data) } as Prisma.InputJsonValue } });
        return this.scopedStudent(db, actorUserId, studentId);
    }

    async createEnrollment(db: any, actorUserId: string, studentId: string, input: Record<string, unknown>) {
        await this.scopedStudent(db, actorUserId, studentId); const enrollment = await this.validateEnrollment(db, actorUserId, input, studentId);
        return db.$transaction(async (tx: any) => { const result = await tx.enrollment.create({ data: { ...enrollment, studentId, status: "ACTIVE" }, include: { academicYear: { select: { id: true, name: true } }, campus: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true } } } }); await tx.auditLog.create({ data: { actorUserId, action: "student.enrollment.created", entityType: "enrollment", entityId: result.id, metadata: { studentId, enrollmentId: result.id } as Prisma.InputJsonValue } }); return result; });
    }
}