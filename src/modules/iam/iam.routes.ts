import { Router } from "express";
import { IamController } from "./iam.controller";

const router = Router();
const iamController = new IamController();

router.get("/get-roles", iamController.getRoles);

export default router;
