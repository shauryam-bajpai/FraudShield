"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_COOKIE_OPTIONS = exports.REFRESH_TOKEN_LIFETIME_MS = exports.REFRESH_COOKIE_NAME = void 0;
exports.createAccessToken = createAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.createRefreshToken = createRefreshToken;
exports.hashRefreshToken = hashRefreshToken;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
exports.REFRESH_COOKIE_NAME = "fs_refresh_token";
exports.REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
exports.REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
};
function createAccessToken(user) {
    const payload = {
        sub: user.id,
        role: user.role,
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, {
        expiresIn: "15m",
        algorithm: "HS256",
    });
}
function verifyAccessToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET, {
        algorithms: ["HS256"],
    });
    if (!decoded.sub || !decoded.role) {
        throw new Error("Invalid token payload");
    }
    return {
        id: decoded.sub,
        role: decoded.role,
    };
}
function createRefreshToken() {
    return node_crypto_1.default.randomBytes(32).toString("hex");
}
function hashRefreshToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
