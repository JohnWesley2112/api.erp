import crypto from "crypto";

export const hashRefreshToken = (refreshToken: string) => {
    return crypto.createHash("sha256").update(refreshToken).digest("hex");
};
