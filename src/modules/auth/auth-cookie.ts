import { env } from "../../config/env.js";

export const REFRESH_COOKIE_NAME = "systra_refresh_token";
export const REFRESH_COOKIE_PATH = "/api";

export const refreshCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: env.refreshCookieSameSite,
    path: REFRESH_COOKIE_PATH,
} as const;
