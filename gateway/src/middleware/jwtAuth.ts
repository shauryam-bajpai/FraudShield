import type { RequestHandler } from "express";

import { HttpError } from "./errorHandler";
import {
    type AuthenticatedUser,
    type Role,
    verifyAccessToken,
} from "../services/token.service";


declare global {
    namespace Express {
        interface Request {
            auth?: AuthenticatedUser;
        }
    }
}


export const requireAuth: RequestHandler = (
    req,
    _res,
    next
) => {
    const header = req.get("authorization");

    if (!header?.startsWith("Bearer ")) {
        next(new HttpError(401, "Access token required"));
        return;
    }

    try {
        req.auth = verifyAccessToken(header.slice("Bearer ".length));
        next();
    } catch {
        next(new HttpError(401, "Invalid or expired access token"));
    }
};


export function requireRole(role: Role): RequestHandler {
    return (req, _res, next) => {
        if (!req.auth) {
            next(new HttpError(401, "Authentication required"));
            return;
        }

        if (req.auth.role !== role) {
            next(new HttpError(403, "Insufficient permissions"));
            return;
        }

        next();
    };
}