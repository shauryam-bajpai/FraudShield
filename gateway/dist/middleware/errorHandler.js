"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = exports.HttpError = void 0;
const zod_1 = require("zod");
class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.HttpError = HttpError;
const notFound = (_req, res) => {
    res.status(404).json({ error: "Route not found" });
};
exports.notFound = notFound;
const errorHandler = (error, _req, res, _next) => {
    if (error instanceof zod_1.ZodError) {
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
exports.errorHandler = errorHandler;
