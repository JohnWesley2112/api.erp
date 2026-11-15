/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";

const STUDENT_STATUSES = ["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"];
const MAX_SERIAL = 999_999;

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

export const formatAdmissionNumber = (academicYear: number, tenantId: number, serial: number) =>
    `${academicYear}${String(tenantId).padStart(3, "0")}${String(serial).padStart(6, "0")}`;

const guardianSelect = { id: true, firstName: true, lastName: true, phone: true, email: true, relationship: true };

const studentSelect = {
    id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
    dateOfBirth: true, gender: true, status: true, createdAt: true, updatedAt: true,
    enrollments: {
        orderBy: { enrolledAt: "desc" },
        include: {
            academicYear: { select: { id: true, name: true } },
            class: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true } },
        },
    },
    studentGuardians: { select: { isPrimary: true, guardian: { select: guardianSelect } } },
};

const isUniqueViolation = (error: any, field?: string) =>
    error?.code === "P2002" && (!field || JSON.stringify(error?.meta?.target ?? "").includes(field));

export class StudentService {
    // undefined = whole Tenant; array = section ids a Teacher-only actor is assigned to.
    private async sectionScope(db: any, actorUserId: string): Promise<string[] | undefined> {
        const profile = await db.userProfile.findUnique({ where: { userId: actorUserId }, select: { userRoles: { select: { role: { select: { name: true } } } } } });
        if (!profile) throw new AppError("User profile not found in this tenant", 404, "NOT_FOUND");
        const names = profile.userRoles.map((item: any) => item.role?.name);
        if (names.includes("INSTITUTION_ADMIN") || names.includes("CAMPUS_ADMIN")) return undefined;
        const teacher = await db.teacher.findUnique({ where: { userId: actorUserId }, select: { id: true, status: true } });
        if (!teacher || teacher.status !== "ACTIVE") return [];
        const assignments = await db.teacherAssignment.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } });
        return assignments.map((item: any) => item.sectionId);
    }

    private async scopedStudent(db: any, actorUserId: string, studentId: string) {
        const sectionIds = await this.sectionScope(db, actorUserId);
        const student = await db.student.findUnique({ where: { id: studentId }, select: studentSelect }) as any;
        if (!student) throw new AppError("Student not found in this tenant", 404, "NOT_FOUND");
        if (sectionIds) {
            student.enrollments = student.enrollments.filter((enrollment: any) => sectionIds.includes(enrollment.sectionId));
            if (!student.enrollments.length) throw new AppError("Student access denied", 403, "FORBIDDEN");
        }
        return student;
    }

    private async validateEnrollment(db: any, input: Record<string, unknown>, studentId?: string) {
        const academicYearId = text(input.academicYearId, "Academic year id", 100, true)!;
        const classId = text(input.classId, "Class id", 100, true)!;
        const sectionId = text(input.sectionId, "Section id", 100, true)!;
        const enrolledAt = date(input.enrolledAt ?? new Date().toISOString(), "Enrolled at")!;
        const [year, academicClass, section] = await Promise.all([
            db.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true, startDate: true } }),
            db.class.findUnique({ where: { id: classId }, select: { id: true } }),
            db.section.findUnique({ where: { id: sectionId }, select: { id: true, academicYearId: true, classId: true } }),
        ]);
        if (!year) throw new AppError("Academic year not found in this tenant", 404, "NOT_FOUND");
        if (!academicClass) throw new AppError("Class not found in this tenant", 404, "NOT_FOUND");
        if (!section) throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        if (section.academicYearId !== academicYearId || section.classId !== classId) throw new AppError("Section does not match the academic year and class", 400, "VALIDATION_ERROR");
        if (studentId && await db.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId } }, select: { id: true } })) throw new AppError("This student is already enrolled for the academic year", 409, "DUPLICATE_RESOURCE");
        return { academicYearId, classId, sectionId, enrolledAt, academicYearStart: year.startDate as Date };
    }

    private parseGuardian(value: unknown, index = 0) {
        if (typeof value !== "object" || value === null) throw new AppError(`guardians[${index}] must be an object`, 400, "VALIDATION_ERROR");
        const input = value as Record<string, unknown>;
        if (input.isPrimary !== undefined && typeof input.isPrimary !== "boolean") throw new AppError(`guardians[${index}].isPrimary must be a boolean`, 400, "VALIDATION_ERROR");
        return {
            firstName: text(input.firstName, `guardians[${index}].firstName`, 100, true)!,
            lastName: text(input.lastName, `guardians[${index}].lastName`, 100) ?? null,
            phone: text(input.phone, `guardians[${index}].phone`, 50) ?? null,
            email: text(input.email, `guardians[${index}].email`, 255) ?? null,
            relationship: text(input.relationship, `guardians[${index}].relationship`, 100) ?? null,
            isPrimary: input.isPrimary === true,
        };
    }

    private parseGuardians(value: unknown) {
        if (value === undefined || value === null) return [];
        if (!Array.isArray(value)) throw new AppError("guardians must be an array", 400, "VALIDATION_ERROR");
        const guardians = value.map((item, index) => this.parseGuardian(item, index));
        if (guardians.filter((guardian) => guardian.isPrimary).length > 1) throw new AppError("Only one guardian can be primary", 400, "VALIDATION_ERROR");
        return guardians;
    }

    private async attachGuardian(tx: any, studentId: string, guardian: ReturnType<StudentService["parseGuardian"]>) {
        const { isPrimary, ...data } = guardian;
        const created = await tx.guardian.create({ data, select: { id: true } });
        await tx.studentGuardian.create({ data: { studentId, guardianId: created.id, isPrimary } });
        return created.id as string;
    }

    async listStudents(db: any, actorUserId: string, options: Record<string, unknown> = {}) {
        const page = Math.max(Number(options.page ?? 1), 1); const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const sectionIds = await this.sectionScope(db, actorUserId);
        const enrollmentWhere: any = {};
        if (sectionIds) enrollmentWhere.sectionId = { in: sectionIds };
        for (const field of ["academicYearId", "classId", "sectionId"]) {
            const value = options[field];
            if (typeof value !== "string" || !value) continue;
            enrollmentWhere[field] = field === "sectionId" && sectionIds ? { in: sectionIds.filter((id) => id === value) } : value;
        }
        const where: any = Object.keys(enrollmentWhere).length ? { enrollments: { some: enrollmentWhere } } : {};
        if (typeof options.status === "string" && options.status) where.status = options.status.toUpperCase();
        const search = typeof options.search === "string" ? options.search.trim() : "";
        if (search) where.OR = ["firstName", "middleName", "lastName", "admissionNumber"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } }));
        const [total, items] = await Promise.all([db.student.count({ where }), db.student.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: studentSelect })]);
        if (sectionIds) for (const item of items) item.enrollments = item.enrollments.filter((enrollment: any) => sectionIds.includes(enrollment.sectionId));
        return { items, total, page, pageSize };
    }

    async getStudent(db: any, actorUserId: string, studentId: string) { return this.scopedStudent(db, actorUserId, studentId); }

    // First-ever admission: Student + first Enrollment + guardians + audit commit together, and the serial is only consumed on commit.
    async createStudent(db: any, tenantId: number, actorUserId: string, input: Record<string, unknown>) {
        if (!Number.isSafeInteger(tenantId) || tenantId <= 0) throw new AppError("Tenant context is required", 401, "UNAUTHORIZED");
        const firstName = text(input.firstName, "First name", 100, true)!;
        const status = text(input.status, "Status", 20) ?? "ACTIVE";
        if (!STUDENT_STATUSES.includes(status)) throw new AppError("Invalid student status", 400, "VALIDATION_ERROR");
        const data = { firstName, middleName: text(input.middleName, "Middle name", 100) ?? null, lastName: text(input.lastName, "Last name", 100) ?? null, dateOfBirth: date(input.dateOfBirth, "Date of birth") ?? null, gender: text(input.gender, "Gender", 50) ?? null, status };
        const guardians = this.parseGuardians(input.guardians);
        const { academicYearStart, ...enrollment } = await this.validateEnrollment(db, input);
        const admissionYear = academicYearStart.getUTCFullYear();

        try {
            return await db.$transaction(async (tx: any) => {
                const counter = await tx.admissionSerial.upsert({
                    where: { academicYearId: enrollment.academicYearId },
                    create: { academicYearId: enrollment.academicYearId, lastSerial: 1 },
                    update: { lastSerial: { increment: 1 } },
                    select: { lastSerial: true },
                });
                if (counter.lastSerial > MAX_SERIAL) throw new AppError("Admission serial capacity for this academic year is exhausted", 409, "ADMISSION_SERIAL_EXHAUSTED");
                const admissionNumber = formatAdmissionNumber(admissionYear, tenantId, counter.lastSerial);
                const student = await tx.student.create({ data: { ...data, admissionNumber }, select: { id: true } });
                const created = await tx.enrollment.create({ data: { ...enrollment, studentId: student.id, status: "ACTIVE" }, select: { id: true } });
                for (const guardian of guardians) await this.attachGuardian(tx, student.id, guardian);
                await tx.auditLog.create({ data: { actorUserId, action: "student.create", entityType: "Student", entityId: student.id, metadata: { studentId: student.id, admissionNumber, enrollmentId: created.id, academicYearId: enrollment.academicYearId } as Prisma.InputJsonValue } });
                return this.scopedStudent(tx, actorUserId, student.id);
            });
        } catch (error) {
            if (isUniqueViolation(error, "admission_number")) throw new AppError("This admission number already exists", 409, "DUPLICATE_RESOURCE");
            throw error;
        }
    }

    async updateStudent(db: any, actorUserId: string, studentId: string, input: Record<string, unknown>) {
        if (Object.prototype.hasOwnProperty.call(input, "admissionNumber")) throw new AppError("The admission number is permanent and cannot be changed", 400, "VALIDATION_ERROR");
        await this.scopedStudent(db, actorUserId, studentId); const data: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(input, "firstName")) data.firstName = text(input.firstName, "First name", 100, true);
        if (Object.prototype.hasOwnProperty.call(input, "middleName")) data.middleName = text(input.middleName, "Middle name", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "lastName")) data.lastName = text(input.lastName, "Last name", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "dateOfBirth")) data.dateOfBirth = date(input.dateOfBirth, "Date of birth") ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "gender")) data.gender = text(input.gender, "Gender", 50) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "status")) {
            const nextStatus = text(input.status, "Status", 20);
            if (!nextStatus || !STUDENT_STATUSES.includes(nextStatus)) throw new AppError("Invalid student status", 400, "VALIDATION_ERROR");
            data.status = nextStatus;
        }
        if (!Object.keys(data).length) throw new AppError("No valid student fields were provided for update", 400, "VALIDATION_ERROR");
        await db.student.update({ where: { id: studentId }, data }); await db.auditLog.create({ data: { actorUserId, action: "student.updated", entityType: "Student", entityId: studentId, metadata: { studentId, changes: Object.keys(data) } as Prisma.InputJsonValue } });
        return this.scopedStudent(db, actorUserId, studentId);
    }

    // Later-year placement; keeps the Student's permanent Admission Number and never touches the serial counter.
    async createEnrollment(db: any, actorUserId: string, studentId: string, input: Record<string, unknown>) {
        await this.scopedStudent(db, actorUserId, studentId);
        const validated = await this.validateEnrollment(db, input, studentId);
        const enrollment = { academicYearId: validated.academicYearId, classId: validated.classId, sectionId: validated.sectionId, enrolledAt: validated.enrolledAt };
        return db.$transaction(async (tx: any) => {
            const result = await tx.enrollment.create({ data: { ...enrollment, studentId, status: "ACTIVE" }, include: { academicYear: { select: { id: true, name: true } }, class: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true } } } });
            await tx.auditLog.create({ data: { actorUserId, action: "student.enrollment.created", entityType: "enrollment", entityId: result.id, metadata: { studentId, enrollmentId: result.id } as Prisma.InputJsonValue } });
            return result;
        });
    }

    async addGuardian(db: any, actorUserId: string, studentId: string, input: Record<string, unknown>) {
        await this.scopedStudent(db, actorUserId, studentId);
        const guardian = this.parseGuardian(input);
        return db.$transaction(async (tx: any) => {
            if (guardian.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId, isPrimary: true }, data: { isPrimary: false } });
            const guardianId = await this.attachGuardian(tx, studentId, guardian);
            await tx.auditLog.create({ data: { actorUserId, action: "student.guardian.added", entityType: "Student", entityId: studentId, metadata: { studentId, guardianId } as Prisma.InputJsonValue } });
            return this.scopedStudent(tx, actorUserId, studentId);
        });
    }
}
