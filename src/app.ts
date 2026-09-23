// src/app.ts
import express, { type RequestHandler } from "express";
import logger, { loggerDashboardPath } from "./logs/Logger.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "./types/express.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./configs/swagger.js";
import { env } from "./config/env.js";
import { errorHandler } from "./errors/error.handler.js";
import { requestContext } from "./observability/request-context.js";
import authRoutes from "./modules/auth/auth.routes.js";
import tenantRoutes from "./modules/tenant/tenant.routes.js";
import iamRoutes from "./modules/iam/iam.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import institutionRoutes from "./modules/institution/institution.routes.js";
import campusRoutes from "./modules/campus/campus.routes.js";
import academicYearRoutes from "./modules/academic-year/academic-year.routes.js";
import classRoutes from "./modules/class/class.routes.js";
import sectionRoutes from "./modules/section/section.routes.js";
import subjectRoutes from "./modules/subject/subject.routes.js";
import teacherRoutes from "./modules/teacher/teacher.routes.js";
import studentRoutes from "./modules/student/student.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import auditRoutes from "./modules/audit/audit.routes.js";

const app: express.Application = express();

app.use(
    cors({
        origin: env.clientOrigin,
        credentials: true,
    }),
);
app.use(cookieParser());
app.use(requestContext);

app.use((req: AppRequest, res: AppResponse, next: AppNextFunction) => {
    if (req.originalUrl.startsWith(loggerDashboardPath)) {
        return next();
    }

    express.json()(req, res, () => {
        express.urlencoded({ extended: true })(req, res, next);
    });
});

app.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        data: {
            status: "ok",
            environment: env.nodeEnv,
            timestamp: new Date().toISOString(),
        },
    });
});

if (logger.dashboard) {
    app.use(logger.dashboard.middleware() as RequestHandler);
}

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/auth", authRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/v1/tenant", tenantRoutes);
app.use("/api/iam", iamRoutes);
app.use("/api/v1/iam", iamRoutes);
app.use("/api", institutionRoutes);
app.use("/api/v1", institutionRoutes);
app.use("/api", campusRoutes);
app.use("/api/v1", campusRoutes);
app.use("/api", academicYearRoutes);
app.use("/api/v1", academicYearRoutes);
app.use("/api", classRoutes);
app.use("/api/v1", classRoutes);
app.use("/api", sectionRoutes);
app.use("/api/v1", sectionRoutes);
app.use("/api", subjectRoutes);
app.use("/api/v1", subjectRoutes);
app.use("/api", teacherRoutes);
app.use("/api/v1", teacherRoutes);
app.use("/api", studentRoutes);
app.use("/api/v1", studentRoutes);
app.use("/api", attendanceRoutes);
app.use("/api/v1", attendanceRoutes);
app.use("/api", auditRoutes);
app.use("/api/v1", auditRoutes);
app.use("/api", userRoutes);
app.use("/api/v1", userRoutes);
app.use(errorHandler);

export default app;
