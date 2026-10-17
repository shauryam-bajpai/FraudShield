"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../config/db");
const errorHandler_1 = require("../middleware/errorHandler");
const jwtAuth_1 = require("../middleware/jwtAuth");
const token_service_1 = require("../services/token.service");
exports.authRouter = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email().max(254),
    password: zod_1.z.string().min(1),
});
exports.authRouter.post("/login", async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await db_1.db.query(`SELECT id, email, password_hash, role
     FROM users
     WHERE email = $1`, [email.trim().toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
        throw new errorHandler_1.HttpError(401, "Invalid email or password");
    }
    const refreshToken = (0, token_service_1.createRefreshToken)();
    const expiresAt = new Date(Date.now() + token_service_1.REFRESH_TOKEN_LIFETIME_MS);
    await db_1.db.query(`INSERT INTO refresh_tokens (
       user_id, token_hash, expires_at
     )
     VALUES ($1, $2, $3)`, [
        user.id,
        (0, token_service_1.hashRefreshToken)(refreshToken),
        expiresAt,
    ]);
    res.cookie(token_service_1.REFRESH_COOKIE_NAME, refreshToken, {
        ...token_service_1.REFRESH_COOKIE_OPTIONS,
        maxAge: token_service_1.REFRESH_TOKEN_LIFETIME_MS,
    });
    res.json({
        access_token: (0, token_service_1.createAccessToken)(user),
        token_type: "Bearer",
        expires_in: 15 * 60,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
        },
    });
});
exports.authRouter.post("/refresh", async (req, res) => {
    const rawToken = req.cookies?.[token_service_1.REFRESH_COOKIE_NAME];
    if (typeof rawToken !== "string") {
        throw new errorHandler_1.HttpError(401, "Refresh token required");
    }
    const client = await db_1.db.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`SELECT rt.id, rt.user_id, rt.expires_at,
              rt.revoked_at, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`, [(0, token_service_1.hashRefreshToken)(rawToken)]);
        const stored = result.rows[0];
        if (!stored ||
            stored.revoked_at ||
            stored.expires_at.getTime() <= Date.now()) {
            throw new errorHandler_1.HttpError(401, "Invalid or expired refresh token");
        }
        await client.query(`UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE id = $1`, [stored.id]);
        const nextToken = (0, token_service_1.createRefreshToken)();
        await client.query(`INSERT INTO refresh_tokens (
         user_id, token_hash, expires_at
       )
       VALUES ($1, $2, $3)`, [
            stored.user_id,
            (0, token_service_1.hashRefreshToken)(nextToken),
            new Date(Date.now() + token_service_1.REFRESH_TOKEN_LIFETIME_MS),
        ]);
        await client.query("COMMIT");
        res.cookie(token_service_1.REFRESH_COOKIE_NAME, nextToken, {
            ...token_service_1.REFRESH_COOKIE_OPTIONS,
            maxAge: token_service_1.REFRESH_TOKEN_LIFETIME_MS,
        });
        res.json({
            access_token: (0, token_service_1.createAccessToken)({
                id: stored.user_id,
                role: stored.role,
            }),
            token_type: "Bearer",
            expires_in: 15 * 60,
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
});
exports.authRouter.post("/logout", async (req, res) => {
    const rawToken = req.cookies?.[token_service_1.REFRESH_COOKIE_NAME];
    if (typeof rawToken === "string") {
        await db_1.db.query(`UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`, [(0, token_service_1.hashRefreshToken)(rawToken)]);
    }
    res.clearCookie(token_service_1.REFRESH_COOKIE_NAME, token_service_1.REFRESH_COOKIE_OPTIONS);
    res.status(204).send();
});
exports.authRouter.get("/me", jwtAuth_1.requireAuth, async (req, res) => {
    const result = await db_1.db.query(`SELECT id, email, role
     FROM users
     WHERE id = $1`, [req.auth.id]);
    if (!result.rows[0]) {
        throw new errorHandler_1.HttpError(401, "User no longer exists");
    }
    res.json({ user: result.rows[0] });
});
