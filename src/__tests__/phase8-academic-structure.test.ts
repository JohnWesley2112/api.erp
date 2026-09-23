import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import { generateAccessToken } from "../helpers/jwt-helper.js";

const {
  mockAdminMembershipFindFirst,
  mockTenantAcademicYearFindMany,
  mockTenantAcademicYearCount,
  mockTenantAcademicYearFindFirst,
  mockTenantAcademicYearCreate,
  mockTenantAcademicYearUpdate,
  mockTenantClassFindMany,
  mockTenantClassCount,
  mockTenantClassFindFirst,
  mockTenantClassCreate,
  mockTenantClassUpdate,
  mockTenantSectionFindMany,
  mockTenantSectionCount,
  mockTenantSectionFindFirst,
  mockTenantSectionCreate,
  mockTenantSectionUpdate,
  mockTenantSubjectFindMany,
  mockTenantSubjectCount,
  mockTenantSubjectFindFirst,
  mockTenantSubjectCreate,
  mockTenantSubjectUpdate,
  mockTenantCampusFindUnique,
  mockTenantAcademicYearFindUnique,
  mockTenantClassFindUnique,
  mockTenantSectionFindUnique,
  mockTenantSubjectFindUnique,
  mockTenantUserProfileFindUnique,
  mockTenantUserRoleFindMany,
  mockTenantRoleFindMany,
  mockTenantAuditLogCreate,
  mockAdminTenantDatabaseConfigFindUnique,
} = vi.hoisted(() => ({
  mockAdminMembershipFindFirst: vi.fn(),
  mockTenantAcademicYearFindMany: vi.fn(),
  mockTenantAcademicYearCount: vi.fn(),
  mockTenantAcademicYearFindFirst: vi.fn(),
  mockTenantAcademicYearCreate: vi.fn(),
  mockTenantAcademicYearUpdate: vi.fn(),
  mockTenantClassFindMany: vi.fn(),
  mockTenantClassCount: vi.fn(),
  mockTenantClassFindFirst: vi.fn(),
  mockTenantClassCreate: vi.fn(),
  mockTenantClassUpdate: vi.fn(),
  mockTenantSectionFindMany: vi.fn(),
  mockTenantSectionCount: vi.fn(),
  mockTenantSectionFindFirst: vi.fn(),
  mockTenantSectionCreate: vi.fn(),
  mockTenantSectionUpdate: vi.fn(),
  mockTenantSubjectFindMany: vi.fn(),
  mockTenantSubjectCount: vi.fn(),
  mockTenantSubjectFindFirst: vi.fn(),
  mockTenantSubjectCreate: vi.fn(),
  mockTenantSubjectUpdate: vi.fn(),
  mockTenantCampusFindUnique: vi.fn(),
  mockTenantAcademicYearFindUnique: vi.fn(),
  mockTenantClassFindUnique: vi.fn(),
  mockTenantSectionFindUnique: vi.fn(),
  mockTenantSubjectFindUnique: vi.fn(),
  mockTenantUserProfileFindUnique: vi.fn(),
  mockTenantUserRoleFindMany: vi.fn(),
  mockTenantRoleFindMany: vi.fn(),
  mockTenantAuditLogCreate: vi.fn(),
  mockAdminTenantDatabaseConfigFindUnique: vi.fn(),
}));

vi.mock("../infrastructure/database/tenant-connection-manager.js", () => {
  const buildTenantDb = () => ({
    academicYear: {
      count: mockTenantAcademicYearCount,
      findMany: mockTenantAcademicYearFindMany,
      findUnique: mockTenantAcademicYearFindUnique,
      findFirst: mockTenantAcademicYearFindFirst,
      create: mockTenantAcademicYearCreate,
      update: mockTenantAcademicYearUpdate,
    },
    class: {
      count: mockTenantClassCount,
      findMany: mockTenantClassFindMany,
      findUnique: mockTenantClassFindUnique,
      findFirst: mockTenantClassFindFirst,
      create: mockTenantClassCreate,
      update: mockTenantClassUpdate,
    },
    section: {
      count: mockTenantSectionCount,
      findMany: mockTenantSectionFindMany,
      findUnique: mockTenantSectionFindUnique,
      findFirst: mockTenantSectionFindFirst,
      create: mockTenantSectionCreate,
      update: mockTenantSectionUpdate,
    },
    subject: {
      count: mockTenantSubjectCount,
      findMany: mockTenantSubjectFindMany,
      findUnique: mockTenantSubjectFindUnique,
      findFirst: mockTenantSubjectFindFirst,
      create: mockTenantSubjectCreate,
      update: mockTenantSubjectUpdate,
    },
    campus: {
      findUnique: mockTenantCampusFindUnique,
    },
    userProfile: {
      findUnique: mockTenantUserProfileFindUnique,
    },
    userRole: {
      findMany: mockTenantUserRoleFindMany,
    },
    role: {
      findMany: mockTenantRoleFindMany,
    },
    auditLog: {
      create: mockTenantAuditLogCreate,
    },
  });

  return {
    createAdminPrismaClient: vi.fn(() => ({
      userTenantMembership: {
        findFirst: mockAdminMembershipFindFirst,
      },
      tenantDatabaseConfig: {
        findUnique: mockAdminTenantDatabaseConfigFindUnique,
      },
    })),
    createTenantPrismaClient: vi.fn(buildTenantDb),
    tenantConnectionManager: { getClient: vi.fn(buildTenantDb) },
  };
});

describe("Phase 8 academic structure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.JWT_SECRET = "test-secret";

    mockAdminMembershipFindFirst.mockReset();
    mockAdminTenantDatabaseConfigFindUnique.mockReset();
    process.env.TENANT_DB_PASSWORD = "test-tenant-db-password";
    mockAdminTenantDatabaseConfigFindUnique.mockResolvedValue({
      id: "tdc-1",
      tenantId: "tenant-1",
      databaseName: "tenant_db",
      host: "localhost",
      port: 5432,
      username: "tenant_user",
      passwordSecretRef: "TENANT_DB_PASSWORD",
      status: "ACTIVE",
    });
    mockTenantAcademicYearFindMany.mockReset();
    mockTenantAcademicYearCount.mockReset();
    mockTenantAcademicYearFindFirst.mockReset();
    mockTenantAcademicYearCreate.mockReset();
    mockTenantAcademicYearUpdate.mockReset();
    mockTenantClassFindMany.mockReset();
    mockTenantClassCount.mockReset();
    mockTenantClassFindFirst.mockReset();
    mockTenantClassCreate.mockReset();
    mockTenantClassUpdate.mockReset();
    mockTenantSectionFindMany.mockReset();
    mockTenantSectionCount.mockReset();
    mockTenantSectionFindFirst.mockReset();
    mockTenantSectionCreate.mockReset();
    mockTenantSectionUpdate.mockReset();
    mockTenantSubjectFindMany.mockReset();
    mockTenantSubjectCount.mockReset();
    mockTenantSubjectFindFirst.mockReset();
    mockTenantSubjectCreate.mockReset();
    mockTenantSubjectUpdate.mockReset();
    mockTenantCampusFindUnique.mockReset();
    mockTenantAcademicYearFindUnique.mockReset();
    mockTenantClassFindUnique.mockReset();
    mockTenantSectionFindUnique.mockReset();
    mockTenantSubjectFindUnique.mockReset();
    mockTenantUserProfileFindUnique.mockReset();
    mockTenantUserRoleFindMany.mockReset();
    mockTenantRoleFindMany.mockReset();
    mockTenantAuditLogCreate.mockReset();

    mockAdminMembershipFindFirst.mockResolvedValue({
      id: "membership-1",
      userId: "user-1",
      tenantId: "tenant-1",
      status: "ACTIVE",
      tenant: { id: "tenant-1", name: "Tenant A", status: "ACTIVE" },
    });

    mockTenantUserProfileFindUnique.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      campusId: null,
      userRoles: [
        {
          id: "ur-1",
          roleId: "role-1",
          campusId: null,
          role: { id: "role-1", name: "INSTITUTION_ADMIN" },
        },
      ],
    });

    mockTenantUserRoleFindMany.mockResolvedValue([
      {
        id: "ur-1",
        userId: "user-1",
        roleId: "role-1",
        campusId: null,
        role: { id: "role-1", name: "INSTITUTION_ADMIN" },
      },
    ]);

    mockTenantRoleFindMany.mockResolvedValue([
      {
        id: "role-1",
        name: "INSTITUTION_ADMIN",
        rolePermissions: [
          { permission: { code: "academic.read" } },
          { permission: { code: "academic.manage" } },
          { permission: { code: "campus.read" } },
          { permission: { code: "campus.manage" } },
        ],
      },
    ]);

    mockTenantAuditLogCreate.mockResolvedValue({ id: "audit-1" });
    mockTenantAcademicYearFindMany.mockResolvedValue([]);
    mockTenantAcademicYearCount.mockResolvedValue(0);
    mockTenantAcademicYearFindFirst.mockResolvedValue(null);
    mockTenantClassFindMany.mockResolvedValue([]);
    mockTenantClassCount.mockResolvedValue(0);
    mockTenantClassFindFirst.mockResolvedValue(null);
    mockTenantSectionFindMany.mockResolvedValue([]);
    mockTenantSectionCount.mockResolvedValue(0);
    mockTenantSectionFindFirst.mockResolvedValue(null);
    mockTenantSubjectFindMany.mockResolvedValue([]);
    mockTenantSubjectCount.mockResolvedValue(0);
    mockTenantSubjectFindFirst.mockResolvedValue(null);
    mockTenantCampusFindUnique.mockResolvedValue({ id: "campus-1", institutionId: "institution-1", name: "Bangalore Campus", code: "BLR", status: "ACTIVE" });
    mockTenantAcademicYearFindUnique.mockResolvedValue(null);
    mockTenantClassFindUnique.mockResolvedValue(null);
    mockTenantSectionFindUnique.mockResolvedValue(null);
    mockTenantSubjectFindUnique.mockResolvedValue(null);
  });

  it("creates an academic year with valid dates", async () => {
    mockTenantAcademicYearFindUnique.mockResolvedValue(null);
    mockTenantAcademicYearCreate.mockResolvedValue({
      id: "academic-year-1",
      name: "2026-2027",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2027-03-31T00:00:00.000Z",
      status: "ACTIVE",
    });

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/academic-years")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "2026-2027",
        startDate: "2026-06-01",
        endDate: "2027-03-31",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockTenantAcademicYearCreate).toHaveBeenCalled();
  });

  it("rejects invalid academic year date ranges", async () => {
    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/academic-years")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "2026-2027",
        startDate: "2027-03-31",
        endDate: "2026-06-01",
      });

    expect(response.status).toBe(400);
  });

  it("creates a class with validation", async () => {
    mockTenantClassFindUnique.mockResolvedValue(null);
    mockTenantClassCreate.mockResolvedValue({
      id: "class-1",
      name: "Grade 10",
      code: "G10",
      displayOrder: 10,
      status: "ACTIVE",
    });

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Grade 10",
        code: "G10",
        displayOrder: 10,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockTenantClassCreate).toHaveBeenCalled();
  });

  it("rejects duplicate class codes", async () => {
    mockTenantClassFindUnique.mockResolvedValue({ id: "class-existing" });

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/classes")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Grade 10",
        code: "G10",
        displayOrder: 10,
      });

    expect(response.status).toBe(409);
  });

  it("creates a section with a valid academic year, campus, and class relationship", async () => {
    mockTenantAcademicYearFindUnique.mockResolvedValue({ id: "academic-year-1", name: "2026-2027", startDate: "2026-06-01", endDate: "2027-03-31", status: "ACTIVE" });
    mockTenantCampusFindUnique.mockResolvedValue({ id: "campus-1", institutionId: "institution-1", name: "Bangalore Campus", code: "BLR", status: "ACTIVE" });
    mockTenantClassFindUnique.mockResolvedValue({ id: "class-1", name: "Grade 10", code: "G10", displayOrder: 10, status: "ACTIVE" });
    mockTenantSectionFindUnique.mockResolvedValue(null);
    mockTenantSectionCreate.mockResolvedValue({
      id: "section-1",
      academicYearId: "academic-year-1",
      campusId: "campus-1",
      classId: "class-1",
      name: "A",
      status: "ACTIVE",
    });

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/sections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        academicYearId: "academic-year-1",
        campusId: "campus-1",
        classId: "class-1",
        name: "A",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockTenantSectionCreate).toHaveBeenCalled();
  });

  it("rejects a section with an invalid campus relation", async () => {
    mockTenantCampusFindUnique.mockResolvedValue(null);

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/sections")
      .set("Authorization", `Bearer ${token}`)
      .send({
        academicYearId: "academic-year-1",
        campusId: "campus-99",
        classId: "class-1",
        name: "A",
      });

    expect(response.status).toBe(404);
  });

  it("creates a subject with validation", async () => {
    mockTenantSubjectFindUnique.mockResolvedValue(null);
    mockTenantSubjectCreate.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
      code: "MATH",
      status: "ACTIVE",
    });

    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const response = await request(app)
      .post("/api/subjects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mathematics",
        code: "MATH",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(mockTenantSubjectCreate).toHaveBeenCalled();
  });

  it("lists academic structure records in the current tenant", async () => {
    const token = generateAccessToken({ userId: "user-1", email: "user@example.com", tenantId: "tenant-1" });

    const academicYears = await request(app)
      .get("/api/academic-years")
      .set("Authorization", `Bearer ${token}`);
    const classes = await request(app)
      .get("/api/classes")
      .set("Authorization", `Bearer ${token}`);
    const sections = await request(app)
      .get("/api/sections")
      .set("Authorization", `Bearer ${token}`);
    const subjects = await request(app)
      .get("/api/subjects")
      .set("Authorization", `Bearer ${token}`);

    expect(academicYears.status).toBe(200);
    expect(classes.status).toBe(200);
    expect(sections.status).toBe(200);
    expect(subjects.status).toBe(200);
  });
});
