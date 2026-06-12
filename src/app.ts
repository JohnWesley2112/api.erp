import express, { type RequestHandler } from "express";
import logger from "./logs/Logger.js"; // Note the mandatory .js extension for ESM
import cookieParser from "cookie-parser";
import cors from "cors";
import type {
    AppRequest,
    AppResponse,
    AppNextFunction,
} from "./types/express.js";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./configs/swagger.js";

const app: express.Application = express();

app.use(cors());
app.use(cookieParser()); // Cookies are fine to stay global

// Single point of entry for parsing bodies
app.use((req: AppRequest, res: AppResponse, next: AppNextFunction) => {
    // If the request is going to the dashboard, skip parsing and pass it raw to loggerverse
    if (req.originalUrl.startsWith("/admin/logs")) {
        return next();
    }

    // For all your regular routes (like /users), parse json and urlencoded data safely here
    express.json()(req, res, () => {
        express.urlencoded({ extended: true })(req, res, next);
    });
});

// Mount the dashboard safely
if (logger.dashboard) {
    app.use(logger.dashboard.middleware() as RequestHandler);
}

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default app;
