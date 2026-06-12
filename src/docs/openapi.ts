export const openapi = {
    openapi: "3.0.0",
    info: {
        title: "Web ERP",
        version: "1.0.0",
    },
    paths: {
        "/auth/login": {
            post: {
                tags: ["Auth"],
                summary: "User login",
                description: "Authenticate a user using email and password",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["userEmail", "password"],
                                properties: {
                                    userEmail: {
                                        type: "string",
                                        example: "john.doe@example.com",
                                    },
                                    password: {
                                        type: "string",
                                        example: "Password@123",
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "200": { description: "Login successful" },
                    "400": { description: "Missing email or password" },
                    "401": { description: "Invalid email or password" },
                    "500": { description: "Internal server error" },
                },
            },
        },
        "/users": {
            get: {
                tags: ["Users"],
                summary: "Get all users",
                responses: { "200": { description: "Successful response" } },
            },
        },
        "/users/{id}": {
            get: {
                tags: ["Users"],
                summary: "Get user by ID",
                parameters: [
                    {
                        name: "id",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
                responses: { "200": { description: "Successful response" } },
            },
        },
    },
};

export default openapi;
