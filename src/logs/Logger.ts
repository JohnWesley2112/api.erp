import { createLogger, FileTransport } from "loggerverse";

const logger = createLogger({
    dashboard: {
        enabled: true,
        path: "/admin/logs", // The URL endpoint where dashboard will live
        showMetrics: true, // Shows live Droplet RAM, CPU, and Disk metrics!
        users: [
            {
                username: "admin",
                password: "12345",
                role: "admin",
            },
        ],
    },
    transports: [
        // This saves logs to standard text files on the storage
        new FileTransport({
            logFolder: "./logs",
            filename: "app",
            format: "json",
            datePattern: "DD-MM-YYYY",
        }),
    ],
});

export default logger;
