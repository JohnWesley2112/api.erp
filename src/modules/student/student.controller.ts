import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { StudentService } from "./student.service.js";

const service = new StudentService();
const param = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
export class StudentController {
    private db(req: AppRequest) { if (!req.tenantDb) throw new AppError("Tenant context is required", 401, "UNAUTHORIZED"); return req.tenantDb; }
    private actor(req: AppRequest) { return req.user?.userId ?? req.auth?.userId ?? "system"; }
    async list(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const result = await service.listStudents(this.db(req), this.actor(req), req.query as Record<string, unknown>); return res.json({ success: true, data: result.items, meta: { total: result.total, page: result.page, pageSize: result.pageSize } }); } catch (error) { return next(error); } }
    async get(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const studentId = param(req.params.studentId); if (!studentId) throw new AppError("Student id is required", 400, "VALIDATION_ERROR"); return res.json({ success: true, data: await service.getStudent(this.db(req), this.actor(req), studentId) }); } catch (error) { return next(error); } }
    async create(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { return res.status(201).json({ success: true, data: await service.createStudent(this.db(req), this.actor(req), req.body ?? {}) }); } catch (error) { return next(error); } }
    async update(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const studentId = param(req.params.studentId); if (!studentId) throw new AppError("Student id is required", 400, "VALIDATION_ERROR"); return res.json({ success: true, data: await service.updateStudent(this.db(req), this.actor(req), studentId, req.body ?? {}) }); } catch (error) { return next(error); } }
    async enrollment(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const studentId = param(req.params.studentId); if (!studentId) throw new AppError("Student id is required", 400, "VALIDATION_ERROR"); return res.status(201).json({ success: true, data: await service.createEnrollment(this.db(req), this.actor(req), studentId, req.body ?? {}) }); } catch (error) { return next(error); } }
}