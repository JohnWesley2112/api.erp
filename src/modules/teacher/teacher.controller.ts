/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppError } from "../../errors/app.error.js";
import type { AppNextFunction, AppRequest, AppResponse } from "../../types/express.js";
import { TeacherService } from "./teacher.service.js";

const service = new TeacherService();
const id = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export class TeacherController {
    private db(req: AppRequest) { if (!req.tenantDb) throw new AppError("Tenant context is required", 401, "UNAUTHORIZED"); return req.tenantDb; }
    private actor(req: AppRequest) { return req.user?.userId ?? req.auth?.userId ?? "system"; }
    async list(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const options: { page: number; pageSize: number; search?: string; status?: string; campusId?: string } = { page: Number(req.query.page ?? 1), pageSize: Number(req.query.pageSize ?? 20) }; if (typeof req.query.search === "string") options.search = req.query.search; if (typeof req.query.status === "string") options.status = req.query.status; if (typeof req.query.campusId === "string") options.campusId = req.query.campusId; const result = await service.listTeachers(this.db(req) as any, this.actor(req), options); return res.json({ success: true, data: result.items, meta: { total: result.total, page: result.page, pageSize: result.pageSize } }); } catch (error) { return next(error); } }
    async get(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const teacherId = id(req.params.teacherId); if (!teacherId) throw new AppError("Teacher id is required", 400, "VALIDATION_ERROR"); return res.json({ success: true, data: await service.getTeacher(this.db(req) as any, this.actor(req), teacherId) }); } catch (error) { return next(error); } }
    async create(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { return res.status(201).json({ success: true, data: await service.createTeacher(this.db(req) as any, this.actor(req), req.body ?? {}) }); } catch (error) { return next(error); } }
    async update(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const teacherId = id(req.params.teacherId); if (!teacherId) throw new AppError("Teacher id is required", 400, "VALIDATION_ERROR"); return res.json({ success: true, data: await service.updateTeacher(this.db(req) as any, this.actor(req), teacherId, req.body ?? {}) }); } catch (error) { return next(error); } }
    async assignments(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const teacherId = id(req.params.teacherId); if (!teacherId) throw new AppError("Teacher id is required", 400, "VALIDATION_ERROR"); return res.json({ success: true, data: await service.listAssignments(this.db(req) as any, this.actor(req), teacherId) }); } catch (error) { return next(error); } }
    async createAssignment(req: AppRequest, res: AppResponse, next: AppNextFunction) { try { const teacherId = id(req.params.teacherId); if (!teacherId) throw new AppError("Teacher id is required", 400, "VALIDATION_ERROR"); return res.status(201).json({ success: true, data: await service.createAssignment(this.db(req) as any, this.actor(req), teacherId, req.body ?? {}) }); } catch (error) { return next(error); } }
}
