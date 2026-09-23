import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Prisma } from "../../node_modules/.prisma/tenant-client/index.js";

import { errorHandler } from "../errors/error.handler.js";
import { AppError } from "../errors/app.error.js";

vi.mock("../logs/Logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

const buildApp = (handler: express.RequestHandler) => {
    const app = express();
    app.get("/test", handler);
    app.use(errorHandler);
    return app;
};

const makePrismaKnownError = (code: string, meta?: Record<string, unknown>) =>
    Object.assign(
        Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Prisma.PrismaClientKnownRequestError,
        {
            name: "PrismaClientKnownRequestError",
            message: "Invalid `prisma.user.create()` invocation: Unique constraint failed on the fields: (`email`) table `users` column `email`",
            code,
            meta,
            clientVersion: "6.19.3",
            stack: "PrismaClientKnownRequestError: leaked stack trace at internal/db.ts:42",
        },
    );

describe("errorHandler", () => {
    it("does not expose internal database details on a Prisma unique-constraint error", async () => {
        const app = buildApp((_req, _res, next) => {
            next(makePrismaKnownError("P2002", { target: ["email"] }));
        });

        const response = await request(app).get("/test");

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe("DUPLICATE_RESOURCE");
        expect(response.body.error.message).not.toMatch(/table|column|email|users/i);
        expect(JSON.stringify(response.body)).not.toMatch(/prisma/i);
        expect(JSON.stringify(response.body)).not.toMatch(/target/i);
    });

    it("returns a generic safe response for unexpected Prisma errors without raw message or stack", async () => {
        const app = buildApp((_req, _res, next) => {
            next(makePrismaKnownError("P2011", { target: ["name"] }));
        });

        const response = await request(app).get("/test");

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
        expect(response.body.error.message).not.toMatch(/invocation|constraint failed|table|column/i);
        expect(JSON.stringify(response.body)).not.toMatch(/leaked stack trace/i);
        expect(JSON.stringify(response.body)).not.toMatch(/internal\/db\.ts/i);
    });

    it("returns a generic safe response for unexpected internal errors without raw message or stack", async () => {
        const app = buildApp((_req, _res, next) => {
            next(new Error("Sensitive internal failure: connection string leaked at internal/db.ts:99"));
        });

        const response = await request(app).get("/test");

        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe("INTERNAL_ERROR");
        expect(response.body.error.message).toBe("Internal server error");
        expect(JSON.stringify(response.body)).not.toMatch(/Sensitive internal failure/i);
        expect(JSON.stringify(response.body)).not.toMatch(/internal\/db\.ts/i);
    });

    it("still returns the intended safe message for known application errors", async () => {
        const app = buildApp((_req, _res, next) => {
            next(new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS"));
        });

        const response = await request(app).get("/test");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            success: false,
            error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials", details: {} },
        });
    });
});
