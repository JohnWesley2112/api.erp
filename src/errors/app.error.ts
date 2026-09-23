export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly code: string;
    public readonly cause: unknown | undefined;
    public readonly context: (Record<string, unknown> | { stage: string; operation?: string }) | undefined;

    constructor(
        message: string,
        statusCode: number,
        code = "INTERNAL_ERROR",
        isOperational = true,
        options?: { cause?: unknown; context?: Record<string, unknown> | { stage: string; operation?: string } },
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.cause = options?.cause;
        this.context = options?.context;
        Error.captureStackTrace(this, this.constructor);
    }
}
