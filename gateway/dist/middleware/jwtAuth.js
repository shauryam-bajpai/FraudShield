"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
exports.requireRole = requireRole;
const errorHandler_1 = require("./errorHandler");
const token_service_1 = require("../services/token.service");
const requireAuth = (req, _res, next) => {
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer ")) {
        next(new errorHandler_1.HttpError(401, "Access token required"));
        return;
    }
    try {
        req.auth = (0, token_service_1.verifyAccessToken)(header.slice("Bearer ".length));
        next();
    }
    catch {
        next(new errorHandler_1.HttpError(401, "Invalid or expired access token"));
    }
};
exports.requireAuth = requireAuth;
function requireRole(role) {
    return (req, _res, next) => {
        if (!req.auth) {
            next(new errorHandler_1.HttpError(401, "Authentication required"));
            return;
        }
        if (req.auth.role !== role) {
            next(new errorHandler_1.HttpError(403, "Insufficient permissions"));
            return;
        }
        next();
    };
}
