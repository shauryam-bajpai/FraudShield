"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    ML_SERVICE_URL: zod_1.z.string().url("ML_SERVICE_URL must be a valid URL"),
    JWT_SECRET: zod_1.z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ML_INTERNAL_API_KEY: zod_1.z.string().min(32, "ML_INTERNAL_API_KEY must be at least 32 characters"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten());
    throw new Error("Gateway environment configuration is invalid");
}
exports.env = parsed.data;
