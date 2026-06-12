// docs/swagger.schemas.ts

export const schemas = {
    LoginRequest: {
        type: "object",
        required: ["userEmail", "password"],
        properties: {
            userEmail: {
                type: "string",
                example: "john@example.com",
            },
            password: {
                type: "string",
                example: "Password@123",
            },
        },
    },

    LoginResponse: {
        type: "object",
        properties: {
            accessToken: {
                type: "string",
            },
        },
    },
};
