/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "../../../node_modules/.prisma/tenant-client/index.js";
import { AppError } from "../../errors/app.error.js";

type TeacherRecord = {
    id: string;
    userId: string | null;
    campusId: string;
    employeeCode: string;
    firstName: string;
    lastName: string | null;
    status: string;
    campus?: { id: string; name: string; code: string };
};

type AssignmentRecord = {
    id: string;
    teacherId: string;
    subjectId: string;
    sectionId: string;
    createdAt: Date;
    subject?: { id: string; name: string; code: string };
    section?: { id: string; name: string; campusId: string; class?: { name: string } };
};

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

const status = (value: unknown) => {
    const result = text(value, "Status", 20) ?? "ACTIVE";
    if (result !== "ACTIVE" && result !== "INACTIVE") throw new AppError("Teacher status must be ACTIVE or INACTIVE", 400, "VALIDATION_ERROR");
    return result;
};

export class TeacherService {
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

    private selectTeacher() {
        return {
            id: true, userId: true, campusId: true, employeeCode: true,
            firstName: true, lastName: true, status: true,
            campus: { select: { id: true, name: true, code: true } },
        };
    }

    async listTeachers(tenantDb: any, actorUserId: string, options: { page?: number; pageSize?: number; search?: string; status?: string; campusId?: string } = {}) {
        const page = Math.max(Number(options.page ?? 1), 1);
        const pageSize = Math.min(Math.max(Number(options.pageSize ?? 20), 1), 100);
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        const where: any = {};
        if (campusIds) where.campusId = options.campusId ? (campusIds.includes(options.campusId) ? options.campusId : "__no_campus_access__") : { in: campusIds };
        else if (options.campusId) where.campusId = options.campusId;
        if (options.search?.trim()) where.OR = [
            { firstName: { contains: options.search.trim(), mode: "insensitive" } },
            { lastName: { contains: options.search.trim(), mode: "insensitive" } },
            { employeeCode: { contains: options.search.trim(), mode: "insensitive" } },
        ];
        if (options.status) where.status = options.status.trim().toUpperCase();
        const [total, items] = await Promise.all([
            tenantDb.teacher.count({ where }),
            tenantDb.teacher.findMany({ where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: this.selectTeacher() }),
        ]);
        return { items, total, page, pageSize };
    }

    async getTeacher(tenantDb: any, actorUserId: string, teacherId: string) {
        const teacher = await tenantDb.teacher.findUnique({ where: { id: teacherId }, select: this.selectTeacher() }) as TeacherRecord | null;
        if (!teacher) throw new AppError("Teacher not found in this tenant", 404, "NOT_FOUND");
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        if (campusIds && !campusIds.includes(teacher.campusId)) throw new AppError("Teacher access denied", 403, "FORBIDDEN");
        return teacher;
    }

    async createTeacher(tenantDb: any, actorUserId: string, input: Record<string, unknown>) {
        const firstName = text(input.firstName, "First name", 100, true)!;
        const lastName = text(input.lastName, "Last name", 100);
        const employeeCode = text(input.employeeCode, "Employee code", 100, true)!.toUpperCase();
        const campusId = text(input.campusId, "Campus id", 100, true)!;
        const userId = text(input.userId, "User id", 100);
        const teacherStatus = status(input.status);
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        if (campusIds && !campusIds.includes(campusId)) throw new AppError("Campus access denied", 403, "FORBIDDEN");
        if (!await tenantDb.campus.findUnique({ where: { id: campusId }, select: { id: true } })) throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        if (userId && !await tenantDb.userProfile.findUnique({ where: { userId }, select: { userId: true } })) throw new AppError("User not found in this tenant", 404, "NOT_FOUND");
        if (await tenantDb.teacher.findFirst({ where: { campusId, employeeCode }, select: { id: true } })) throw new AppError("A teacher with this employee code already exists on this campus", 409, "DUPLICATE_RESOURCE");
        const teacher = await tenantDb.teacher.create({ data: { firstName, lastName: lastName ?? null, employeeCode, campusId, userId: userId ?? null, status: teacherStatus }, select: this.selectTeacher() }) as TeacherRecord;
        await tenantDb.auditLog.create({ data: { actorUserId, action: "teacher.created", entityType: "teacher", entityId: teacher.id, metadata: { teacherId: teacher.id } as Prisma.InputJsonValue } });
        return teacher;
    }

    async updateTeacher(tenantDb: any, actorUserId: string, teacherId: string, input: Record<string, unknown>) {
        const existing = await this.getTeacher(tenantDb, actorUserId, teacherId);
        const data: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(input, "firstName")) data.firstName = text(input.firstName, "First name", 100, true);
        if (Object.prototype.hasOwnProperty.call(input, "lastName")) data.lastName = text(input.lastName, "Last name", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "employeeCode")) data.employeeCode = text(input.employeeCode, "Employee code", 100, true)!.toUpperCase();
        if (Object.prototype.hasOwnProperty.call(input, "campusId")) data.campusId = text(input.campusId, "Campus id", 100, true);
        if (Object.prototype.hasOwnProperty.call(input, "userId")) data.userId = text(input.userId, "User id", 100) ?? null;
        if (Object.prototype.hasOwnProperty.call(input, "status")) data.status = status(input.status);
        const campusId = (data.campusId as string | undefined) ?? existing.campusId;
        const employeeCode = (data.employeeCode as string | undefined) ?? existing.employeeCode;
        const campusIds = await this.campusScope(tenantDb, actorUserId);
        if (campusIds && !campusIds.includes(campusId)) throw new AppError("Campus access denied", 403, "FORBIDDEN");
        if (data.campusId && !await tenantDb.campus.findUnique({ where: { id: campusId }, select: { id: true } })) throw new AppError("Campus not found in this tenant", 404, "NOT_FOUND");
        if (data.userId && !await tenantDb.userProfile.findUnique({ where: { userId: data.userId }, select: { userId: true } })) throw new AppError("User not found in this tenant", 404, "NOT_FOUND");
        if ((campusId !== existing.campusId || employeeCode !== existing.employeeCode) && await tenantDb.teacher.findFirst({ where: { campusId, employeeCode, NOT: { id: teacherId } }, select: { id: true } })) throw new AppError("A teacher with this employee code already exists on this campus", 409, "DUPLICATE_RESOURCE");
        if (!Object.keys(data).length) throw new AppError("No valid teacher fields were provided for update", 400, "VALIDATION_ERROR");
        const teacher = await tenantDb.teacher.update({ where: { id: teacherId }, data, select: this.selectTeacher() }) as TeacherRecord;
        await tenantDb.auditLog.create({ data: { actorUserId, action: "teacher.updated", entityType: "teacher", entityId: teacher.id, metadata: { teacherId: teacher.id, changes: Object.keys(data) } as Prisma.InputJsonValue } });
        return teacher;
    }

    async listAssignments(tenantDb: any, actorUserId: string, teacherId: string) {
        await this.getTeacher(tenantDb, actorUserId, teacherId);
        return tenantDb.teacherAssignment.findMany({ where: { teacherId }, orderBy: { createdAt: "desc" }, include: { subject: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true, campusId: true, class: { select: { name: true } } } } } }) as Promise<AssignmentRecord[]>;
    }

    async createAssignment(tenantDb: any, actorUserId: string, teacherId: string, input: Record<string, unknown>) {
        const subjectId = text(input.subjectId, "Subject id", 100, true)!;
        const sectionId = text(input.sectionId, "Section id", 100, true)!;
        const teacher = await this.getTeacher(tenantDb, actorUserId, teacherId);
        const [subject, section] = await Promise.all([
            tenantDb.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
            tenantDb.section.findUnique({ where: { id: sectionId }, select: { id: true, campusId: true } }),
        ]);
        if (!subject) throw new AppError("Subject not found in this tenant", 404, "NOT_FOUND");
        if (!section) throw new AppError("Section not found in this tenant", 404, "NOT_FOUND");
        if (section.campusId !== teacher.campusId) throw new AppError("Teacher and section must belong to the same campus", 400, "VALIDATION_ERROR");
        if (await tenantDb.teacherAssignment.findUnique({ where: { teacherId_subjectId_sectionId: { teacherId, subjectId, sectionId } }, select: { id: true } })) throw new AppError("This teacher assignment already exists", 409, "DUPLICATE_RESOURCE");
        const assignment = await tenantDb.teacherAssignment.create({ data: { teacherId, subjectId, sectionId }, include: { subject: { select: { id: true, name: true, code: true } }, section: { select: { id: true, name: true, campusId: true, class: { select: { name: true } } } } } }) as AssignmentRecord;
        await tenantDb.auditLog.create({ data: { actorUserId, action: "teacher.assignment.created", entityType: "teacher_assignment", entityId: assignment.id, metadata: { teacherId, subjectId, sectionId } as Prisma.InputJsonValue } });
        return assignment;
    }
}
