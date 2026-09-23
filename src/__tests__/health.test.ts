import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../app.js";

describe("GET /health", () => {
    it("returns a healthy API status", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("ok");
        expect(response.body.data.environment).toBeDefined();
    });
});
