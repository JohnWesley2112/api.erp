import type { UserResponseDTO } from "./auth.dto.js";

export class AuthMapper {
    static toResponse(dbUser: any, token: string): UserResponseDTO {
        return {
            userEmail: dbUser.user_email,
            firstname: dbUser.user_firstname,
            lastname: dbUser.user_lastname,
            token: token,
        };
    }
}
