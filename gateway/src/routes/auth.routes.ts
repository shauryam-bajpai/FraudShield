import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";

import { db } from "../config/db";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/jwtAuth";
import {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_OPTIONS,
    REFRESH_TOKEN_LIFETIME_MS,
    type Role,
} from "../services/token.service";


export const authRouter = Router();

const loginSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1),
});

type UserRow = {
    id: string;
    email: string;
    password_hash: string;
    role: Role;
};

type RefreshRow = {
    id: string;
    user_id: string;
    role: Role;
    expires_at: Date;
    revoked_at: Date | null;
};


authRouter.post("/login", async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const result = await db.query<UserRow>(
        `SELECT id, email, password_hash, role
     FROM users
     WHERE email = $1`,
        [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        throw new HttpError(401, "Invalid email or password");
    }

    const refreshToken = createRefreshToken();
    const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_LIFETIME_MS
    );

    await db.query(
        `INSERT INTO refresh_tokens (
       user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3)`,
        [
            user.id,
            hashRefreshToken(refreshToken),
            expiresAt,
        ]
    );

    res.cookie(
        REFRESH_COOKIE_NAME,
        refreshToken,
        {
            ...REFRESH_COOKIE_OPTIONS,
            maxAge: REFRESH_TOKEN_LIFETIME_MS,
        }
    );

    res.json({
        access_token: createAccessToken(user),
        token_type: "Bearer",
        expires_in: 15 * 60,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
        },
    });
});


authRouter.post("/refresh", async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof rawToken !== "string") {
        throw new HttpError(401, "Refresh token required");
    }

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query<RefreshRow>(
            `SELECT rt.id, rt.user_id, rt.expires_at,
              rt.revoked_at, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`,
            [hashRefreshToken(rawToken)]
        );

        const stored = result.rows[0];

        if (
            !stored ||
            stored.revoked_at ||
            stored.expires_at.getTime() <= Date.now()
        ) {
            throw new HttpError(401, "Invalid or expired refresh token");
        }

        await client.query(
            `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE id = $1`,
            [stored.id]
        );

        const nextToken = createRefreshToken();

        await client.query(
            `INSERT INTO refresh_tokens (
         user_id, token_hash, expires_at
       )
       VALUES ($1, $2, $3)`,
            [
                stored.user_id,
                hashRefreshToken(nextToken),
                new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
            ]
        );

        await client.query("COMMIT");

        res.cookie(
            REFRESH_COOKIE_NAME,
            nextToken,
            {
                ...REFRESH_COOKIE_OPTIONS,
                maxAge: REFRESH_TOKEN_LIFETIME_MS,
            }
        );

        res.json({
            access_token: createAccessToken({
                id: stored.user_id,
                role: stored.role,
            }),
            token_type: "Bearer",
            expires_in: 15 * 60,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
});


authRouter.post("/logout", async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof rawToken === "string") {
        await db.query(
            `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
            [hashRefreshToken(rawToken)]
        );
    }

    res.clearCookie(
        REFRESH_COOKIE_NAME,
        REFRESH_COOKIE_OPTIONS
    );

    res.status(204).send();
});


authRouter.get("/me", requireAuth, async (req, res) => {
    const result = await db.query<{
        id: string;
        email: string;
        role: Role;
    }>(
        `SELECT id, email, role
     FROM users
     WHERE id = $1`,
        [req.auth!.id]
    );

    if (!result.rows[0]) {
        throw new HttpError(401, "User no longer exists");
    }

    res.json({ user: result.rows[0] });
});