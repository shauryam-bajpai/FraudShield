"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const jwtAuth_1 = require("./middleware/jwtAuth");
const auth_routes_1 = require("./routes/auth.routes");
const transaction_routes_1 = require("./routes/transaction.routes");
const app = (0, express_1.default)();
const allowedOrigins = [
    process.env.CLIENT_ORIGIN,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
].filter(Boolean);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, server-to-server, postman) or matching client origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: "1mb" }));
app.use((0, cookie_parser_1.default)());
app.get("/api/v1/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "fraudshield-gateway",
    });
});
app.use("/api/v1/auth", auth_routes_1.authRouter);
app.use("/api/v1/transactions", jwtAuth_1.requireAuth, transaction_routes_1.transactionRouter);
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
async function main() {
    await (0, db_1.checkDatabaseConnection)();
    const server = app.listen(env_1.env.PORT, "127.0.0.1", () => {
        console.log(`Gateway listening at http://127.0.0.1:${env_1.env.PORT}`);
    });
    const shutdown = () => {
        server.close(() => {
            void db_1.db.end().then(() => process.exit(0));
        });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
main().catch((error) => {
    console.error("Gateway failed to start:", error);
    process.exitCode = 1;
});
