import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    ML_SERVICE_URL: z.string().url("ML_SERVICE_URL must be a valid URL"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ML_INTERNAL_API_KEY: z.string().min(32, "ML_INTERNAL_API_KEY must be at least 32 characters"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error(
        "Invalid environment configuration:",
        parsed.error.flatten()
    );
    throw new Error("Gateway environment configuration is invalid");
}

export const env = parsed.data;
