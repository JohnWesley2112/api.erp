import { openapi } from "../docs/openapi.js";

export const swaggerSpec = {
    ...openapi,
    servers: [
        {
            url: "http://localhost:3000/api/v1",
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
    },
};
