import {
    type ErrorRequestHandler,
    type RequestHandler,
} from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string
    ) {
        super(message);
    }
}

export const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({ error: "Route not found" });
};

export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next
) => {
    if (error instanceof ZodError) {
        res.status(400).json({
            error: "Invalid request",
            issues: error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        });
        return;
    }

    if (error instanceof HttpError) {
        res.status(error.statusCode).json({
            error: error.message,
        });
        return;
    }

    console.error("Unhandled gateway error:", error);

    res.status(500).json({
        error: "Internal server error",
    });
};