interface AuthUserRole {
    id: number;
}

interface AuthUser {
    userEmail: string;
    firstname: string;
    lastname: string;
    assignedRoles?: AuthUserRole[];
}

export class AuthMapper {
    static toResponse(dbUser: AuthUser, token: string) {
        return {
            userEmail: dbUser.userEmail,
            firstname: dbUser.firstname,
            lastname: dbUser.lastname,
            token,
            roles: dbUser.assignedRoles?.map((role) => role.id) ?? [],
        };
    }
}
