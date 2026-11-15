import { createHash } from "node:crypto";

export const hashRefreshToken = (refreshToken: string) => {
    return createHash("sha256").update(refreshToken).digest("hex");
};
