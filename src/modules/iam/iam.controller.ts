// src/modules/iam/iam.controller.ts
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "../../types/express.js";
import { IamService } from "./iam.service.js";

export class IamController {
    // Instantiate service as an instance property
    private iamService = new IamService();

    /**
     * Express handler to manage getting roles
     */
    getRoles = async (
        req: AppRequest,
        res: AppResponse,
        next: AppNextFunction,
    ) => {
        try {
            const allRoles = await this.iamService.getAllRoles();
            return res.status(200).json({
                status: "success",
                data: allRoles,
            });
        } catch (error) {
            next(error); // Passes mapped error down to the central error handler middleware
        }
    };
}
