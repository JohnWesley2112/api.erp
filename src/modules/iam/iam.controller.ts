import { AppError } from "../../errors/app.error.js";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { IamService } from "./iam.service.js";

const iamService = new IamService();

export class IamController {
    async getRoles(req: AppRequest, res: AppResponse, next: AppNextFunction) {
        try {
            const allRoles = await iamService.roles();
            return res.json(allRoles);
        } catch (error) {
            next(error);
        }
    }
}
