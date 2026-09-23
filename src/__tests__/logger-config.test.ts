import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("Logger dashboard credentials", () => {
    beforeEach(() => {
        vi.resetModules();
        process.env = { ...ORIGINAL_ENV };
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it("does not fall back to admin/123456 when the dashboard is enabled without credentials", async () => {
        process.env.LOGGER_DASHBOARD_ENABLED = "true";
        // Empty (not deleted) so dotenv/config does not refill these from the local .env file.
        process.env.LOGGER_USERNAME = "";
        process.env.LOGGER_PASSWORD = "";

        await expect(import("../logs/Logger.js")).rejects.toThrow(/LOGGER_USERNAME/);
    });

    it("fails clearly when only the password is missing", async () => {
        process.env.LOGGER_DASHBOARD_ENABLED = "true";
        process.env.LOGGER_USERNAME = "some-operator";
        process.env.LOGGER_PASSWORD = "";

        await expect(import("../logs/Logger.js")).rejects.toThrow(/LOGGER_PASSWORD/);
    });

    it("does not require dashboard credentials when the dashboard is disabled", async () => {
        process.env.LOGGER_DASHBOARD_ENABLED = "false";
        process.env.LOGGER_USERNAME = "";
        process.env.LOGGER_PASSWORD = "";

        const { default: logger } = await import("../logs/Logger.js");

        expect(logger.dashboard).toBeUndefined();
    });

    it("uses the configured credentials when explicitly provided", async () => {
        process.env.LOGGER_DASHBOARD_ENABLED = "true";
        process.env.LOGGER_USERNAME = "operator";
        process.env.LOGGER_PASSWORD = "a-strong-password";

        const { default: logger } = await import("../logs/Logger.js");

        expect(logger.dashboard).toBeDefined();
    });
});
