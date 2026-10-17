import crypto from "node:crypto";
import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";

export type Role = "admin" | "analyst";

export type AuthenticatedUser = {
    id: string;
    role: Role;
};

interface JwtPayload {
    sub: string;
    role: Role;
    iat?: number;
    exp?: number;
}

export const REFRESH_COOKIE_NAME = "fs_refresh_token";

export const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
};

export function createAccessToken(user: { id: string; role: Role }): string {
    const payload: JwtPayload = {
        sub: user.id,
        role: user.role,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: "15m",
        algorithm: "HS256",
    });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
    }) as JwtPayload;

    if (!decoded.sub || !decoded.role) {
        throw new Error("Invalid token payload");
    }

    return {
        id: decoded.sub,
        role: decoded.role,
    };
}

export function createRefreshToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}
