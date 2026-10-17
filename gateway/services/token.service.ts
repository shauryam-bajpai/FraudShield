import { createHash, randomBytes } from "node:crypto";

import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../config/env";


export type Role = "admin" | "analyst";

export type AuthenticatedUser = {
  id: string;
  role: Role;
};

const ISSUER = "fraudshield-gateway";
const AUDIENCE = "fraudshield-client";

export const REFRESH_COOKIE_NAME = "fraudshield_refresh";

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
};

export const REFRESH_TOKEN_LIFETIME_MS =
  7 * 24 * 60 * 60 * 1000;


export function createAccessToken(user: AuthenticatedUser): string {
  return jwt.sign(
    { role: user.role },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: 15 * 60,
    }
  );
}


export function verifyAccessToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (typeof decoded === "string") {
    throw new Error("Invalid access token");
  }

  const payload = decoded as JwtPayload;

  if (
    typeof payload.sub !== "string" ||
    (payload.role !== "admin" && payload.role !== "analyst")
  ) {
    throw new Error("Invalid access token claims");
  }

  return {
    id: payload.sub,
    role: payload.role,
  };
}


export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}


export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}