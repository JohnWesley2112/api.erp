/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { StudentService, formatAdmissionNumber } from "../modules/student/student.service.js";

const admin = "admin-1";
const teacherUser = "teacher-user-1";

type Row = Record<string, any>;

// Minimal stateful Tenant DB double; $transaction rolls everything back when the callback throws.
const buildDb = (options: { teacherSections?: string[]; failAudit?: boolean } = {}) => {
    const state = {
        serials: new Map<string, number>(),
        students: [] as Row[],
        enrollments: [] as Row[],
        guardians: [] as Row[],
        studentGuardians: [] as Row[],
        audits: [] as Row[],
    };
    const years: Record<string, Row> = {
        "year-2026": { id: "year-2026", startDate: new Date("2026-06-01T00:00:00Z") },
        "year-2027": { id: "year-2027", startDate: new Date("2027-06-01T00:00:00Z") },
    };
    const sections: Record<string, Row> = {
        "sec-2026": { id: "sec-2026", academicYearId: "year-2026", classId: "class-1" },
        "sec-2027": { id: "sec-2027", academicYearId: "year-2027", classId: "class-2" },
        "sec-other": { id: "sec-other", academicYearId: "year-2026", classId: "class-1" },
    };
    const roles: Record<string, string> = { [admin]: "CAMPUS_ADMIN", [teacherUser]: "TEACHER", "inst-1": "INSTITUTION_ADMIN" };
    const hydrate = (student: Row) => ({
        ...student,
        enrollments: state.enrollments.filter((item) => item.studentId === student.id),
        studentGuardians: state.studentGuardians.filter((item) => item.studentId === student.id).map((link) => ({ isPrimary: link.isPrimary, guardian: state.guardians.find((g) => g.id === link.guardianId) })),
    });
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}-${++sequence}`;

    const db: any = {
        userProfile: { findUnique: vi.fn(async ({ where }: any) => (roles[where.userId] ? { userRoles: [{ role: { name: roles[where.userId] } }] } : null)) },
        teacher: { findUnique: vi.fn(async () => ({ id: "teacher-1", status: "ACTIVE" })) },
        teacherAssignment: { findMany: vi.fn(async () => (options.teacherSections ?? []).map((sectionId) => ({ sectionId }))) },
        academicYear: { findUnique: vi.fn(async ({ where }: any) => years[where.id] ?? null) },
        class: { findUnique: vi.fn(async ({ where }: any) => (["class-1", "class-2"].includes(where.id) ? { id: where.id } : null)) },
        section: { findUnique: vi.fn(async ({ where }: any) => sections[where.id] ?? null) },
        admissionSerial: {
            upsert: vi.fn(async ({ where, create, update }: any) => {
                const next = state.serials.has(where.academicYearId) ? state.serials.get(where.academicYearId)! + update.lastSerial.increment : create.lastSerial;
                state.serials.set(where.academicYearId, next);
                return { lastSerial: next };
            }),
        },
        student: {
            count: vi.fn(async () => state.students.length),
            findMany: vi.fn(async () => state.students.map(hydrate)),
            findUnique: vi.fn(async ({ where }: any) => { const row = state.students.find((item) => item.id === where.id); return row ? hydrate(row) : null; }),
            create: vi.fn(async ({ data }: any) => {
                if (state.students.some((item) => item.admissionNumber === data.admissionNumber)) throw Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["admission_number"] } });
                const row = { id: nextId("student"), ...data }; state.students.push(row); return row;
            }),
            update: vi.fn(async ({ where, data }: any) => Object.assign(state.students.find((item) => item.id === where.id)!, data)),
        },
        enrollment: {
            findUnique: vi.fn(async ({ where }: any) => state.enrollments.find((item) => item.studentId === where.studentId_academicYearId.studentId && item.academicYearId === where.studentId_academicYearId.academicYearId) ?? null),
            create: vi.fn(async ({ data }: any) => { const row = { id: nextId("enrollment"), ...data }; state.enrollments.push(row); return row; }),
        },
        guardian: { create: vi.fn(async ({ data }: any) => { const row = { id: nextId("guardian"), ...data }; state.guardians.push(row); return row; }) },
        studentGuardian: {
            create: vi.fn(async ({ data }: any) => { state.studentGuardians.push({ ...data }); return data; }),
            updateMany: vi.fn(async ({ where, data }: any) => { state.studentGuardians.filter((item) => item.studentId === where.studentId && item.isPrimary === where.isPrimary).forEach((item) => Object.assign(item, data)); }),
        },
        auditLog: { create: vi.fn(async ({ data }: any) => { if (options.failAudit) throw new Error("audit failed"); state.audits.push({ ...data }); return data; }) },
        $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
            const snapshot = { serials: new Map(state.serials), students: [...state.students], enrollments: [...state.enrollments], guardians: [...state.guardians], studentGuardians: [...state.studentGuardians], audits: [...state.audits] };
            try { return await callback(db); } catch (error) { Object.assign(state, snapshot); throw error; }
        }),
    };
    return { db, state };
};

const admission = (overrides: Record<string, unknown> = {}) => ({ firstName: "John", lastName: "Doe", academicYearId: "year-2026", classId: "class-1", sectionId: "sec-2026", ...overrides });

describe("Student first admission", () => {
    const service = new StudentService();

    it("formats year + 3-digit Tenant ID + 6-digit serial", () => {
        expect(formatAdmissionNumber(2026, 4, 1)).toBe("2026004000001");
        expect(formatAdmissionNumber(2026, 4, 123)).toBe("2026004000123");
    });

    it("creates Student, first Enrollment and audit event together with a generated admission number", async () => {
        const { db, state } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission({ admissionNumber: "CLIENT-SUPPLIED" }));
        expect(student.admissionNumber).toBe("2026004000001");
        expect(state.enrollments).toHaveLength(1);
        expect(state.enrollments[0]).toMatchObject({ studentId: student.id, academicYearId: "year-2026", sectionId: "sec-2026", status: "ACTIVE" });
        expect(state.audits).toEqual([expect.objectContaining({ actorUserId: admin, action: "student.create", entityType: "Student", entityId: student.id })]);
        expect(state.students[0]).not.toHaveProperty("campusId");
        expect(state.enrollments[0]).not.toHaveProperty("campusId");
    });

    it("issues sequential, unique serials within a Tenant and academic year", async () => {
        const { db } = buildDb();
        const numbers = [];
        for (let i = 0; i < 3; i += 1) numbers.push((await service.createStudent(db, 4, admin, admission({ firstName: `S${i}` }))).admissionNumber);
        expect(numbers).toEqual(["2026004000001", "2026004000002", "2026004000003"]);
        expect(new Set(numbers).size).toBe(3);
    });

    it("restarts the serial for a new academic year", async () => {
        const { db } = buildDb();
        await service.createStudent(db, 4, admin, admission());
        await service.createStudent(db, 4, admin, admission());
        const next = await service.createStudent(db, 4, admin, admission({ academicYearId: "year-2027", classId: "class-2", sectionId: "sec-2027" }));
        expect(next.admissionNumber).toBe("2027004000001");
    });

    it("rolls back the serial and all rows when any step of admission fails", async () => {
        const { db, state } = buildDb({ failAudit: true });
        await expect(service.createStudent(db, 4, admin, admission())).rejects.toThrow("audit failed");
        expect(state.students).toHaveLength(0);
        expect(state.enrollments).toHaveLength(0);
        expect(state.serials.size).toBe(0);
    });

    it("rejects a duplicate admission number with a conflict", async () => {
        const { db, state } = buildDb();
        await service.createStudent(db, 4, admin, admission());
        state.serials.set("year-2026", 0);
        await expect(service.createStudent(db, 4, admin, admission())).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_RESOURCE" });
        expect(state.students).toHaveLength(1);
    });

    it.each([
        ["section from a different academic year", { sectionId: "sec-2027" }],
        ["section from a different class", { classId: "class-2" }],
    ])("rejects a %s", async (_label, overrides) => {
        const { db, state } = buildDb();
        await expect(service.createStudent(db, 4, admin, admission(overrides))).rejects.toMatchObject({ statusCode: 400 });
        expect(state.students).toHaveLength(0);
        expect(state.serials.size).toBe(0);
    });

    it("rejects unknown academic year or section", async () => {
        const { db } = buildDb();
        await expect(service.createStudent(db, 4, admin, admission({ academicYearId: "nope" }))).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.createStudent(db, 4, admin, admission({ sectionId: "nope" }))).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe("Later enrollments", () => {
    const service = new StudentService();

    it("keeps the permanent admission number and does not consume a serial", async () => {
        const { db, state } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission());
        const enrollment = await service.createEnrollment(db, admin, student.id, { academicYearId: "year-2027", classId: "class-2", sectionId: "sec-2027" });
        expect(enrollment).toMatchObject({ studentId: student.id, academicYearId: "year-2027" });
        expect(state.serials.get("year-2027")).toBeUndefined();
        expect(state.serials.get("year-2026")).toBe(1);
        const reloaded = await service.getStudent(db, admin, student.id);
        expect(reloaded.admissionNumber).toBe("2026004000001");
        expect(reloaded.enrollments).toHaveLength(2);
    });

    it("rejects a second enrollment in the same academic year", async () => {
        const { db } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission());
        await expect(service.createEnrollment(db, admin, student.id, { academicYearId: "year-2026", classId: "class-1", sectionId: "sec-other" })).rejects.toMatchObject({ statusCode: 409 });
    });

    it("rejects invalid section relationships", async () => {
        const { db } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission());
        await expect(service.createEnrollment(db, admin, student.id, { academicYearId: "year-2027", classId: "class-1", sectionId: "sec-2027" })).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("Student profile", () => {
    const service = new StudentService();

    it("never lets an update change the admission number", async () => {
        const { db } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission());
        await expect(service.updateStudent(db, admin, student.id, { admissionNumber: "X" })).rejects.toMatchObject({ statusCode: 400 });
        const updated = await service.updateStudent(db, admin, student.id, { lastName: "Smith" });
        expect(updated).toMatchObject({ lastName: "Smith", admissionNumber: "2026004000001" });
        expect(db.enrollment.create).toHaveBeenCalledTimes(1);
    });

    it("does not physically delete historical data", () => {
        const { db } = buildDb();
        expect(db.student.delete).toBeUndefined();
        expect(db.enrollment.delete).toBeUndefined();
    });
});

describe("Guardians", () => {
    const service = new StudentService();

    it("creates guardians and links within the admission transaction", async () => {
        const { db, state } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission({ guardians: [{ firstName: "Jane", phone: "123", relationship: "Mother", isPrimary: true }, { firstName: "Jim" }] }));
        expect(state.guardians).toHaveLength(2);
        expect(student.studentGuardians).toEqual([
            expect.objectContaining({ isPrimary: true, guardian: expect.objectContaining({ firstName: "Jane" }) }),
            expect.objectContaining({ isPrimary: false, guardian: expect.objectContaining({ firstName: "Jim" }) }),
        ]);
    });

    it("rolls back the student when a guardian is invalid", async () => {
        const { db, state } = buildDb();
        await expect(service.createStudent(db, 4, admin, admission({ guardians: [{ lastName: "NoFirstName" }] }))).rejects.toMatchObject({ statusCode: 400 });
        expect(state.students).toHaveLength(0);
        expect(state.serials.size).toBe(0);
    });

    it("rejects more than one primary guardian", async () => {
        const { db } = buildDb();
        await expect(service.createStudent(db, 4, admin, admission({ guardians: [{ firstName: "A", isPrimary: true }, { firstName: "B", isPrimary: true }] }))).rejects.toMatchObject({ statusCode: 400 });
    });

    it("adds a guardian later and moves the primary flag", async () => {
        const { db, state } = buildDb();
        const student = await service.createStudent(db, 4, admin, admission({ guardians: [{ firstName: "Jane", isPrimary: true }] }));
        const updated = await service.addGuardian(db, admin, student.id, { firstName: "Joe", isPrimary: true });
        expect(updated.studentGuardians.filter((link: Row) => link.isPrimary).map((link: Row) => link.guardian.firstName)).toEqual(["Joe"]);
        expect(state.audits.at(-1)).toMatchObject({ action: "student.guardian.added", entityType: "Student" });
    });
});

describe("Authorization scope (Tenant is the campus)", () => {
    const service = new StudentService();

    it("lets admins see every student in the Tenant without any campus filter", async () => {
        const { db } = buildDb();
        await service.createStudent(db, 4, admin, admission());
        await service.listStudents(db, admin, {});
        expect(db.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it("restricts a teacher to students enrolled in assigned sections", async () => {
        const { db } = buildDb({ teacherSections: ["sec-2026"] });
        await service.createStudent(db, 4, admin, admission());
        const other = await service.createStudent(db, 4, admin, admission({ sectionId: "sec-other" }));
        await service.listStudents(db, teacherUser, {});
        expect(db.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { enrollments: { some: { sectionId: { in: ["sec-2026"] } } } } }));
        await expect(service.getStudent(db, teacherUser, other.id)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("denies a teacher with no assignments", async () => {
        const { db } = buildDb({ teacherSections: [] });
        const student = await service.createStudent(db, 4, admin, admission());
        await expect(service.getStudent(db, teacherUser, student.id)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("requires a valid Tenant id for admission", async () => {
        const { db } = buildDb();
        await expect(service.createStudent(db, 0, admin, admission())).rejects.toMatchObject({ statusCode: 401 });
    });
});
