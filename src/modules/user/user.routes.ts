import { Router } from "express";
import { UserController } from "./user.controller.js";

const router = Router();
const controller = new UserController();
router.get("/users", controller.getAllUsers); // GET /api/v1/users
router.get("/users/:id", controller.getUser);
// router.post("/", controller.createUser);

export default router;
