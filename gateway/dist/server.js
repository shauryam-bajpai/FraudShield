"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const transaction_routes_1 = require("./routes/transaction.routes");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
app.get("/api/v1/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "fraudshield-gateway",
    });
});
app.use("/api/v1/transactions", transaction_routes_1.transactionRouter);
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
async function main() {
    await (0, db_1.checkDatabaseConnection)();
    // Local development only. Authentication comes in the next batch.
    const server = app.listen(env_1.env.PORT, "127.0.0.1", () => {
        console.log(`Gateway listening at http://127.0.0.1:${env_1.env.PORT}`);
    });
    process.on("SIGINT", () => {
        server.close(() => {
            void db_1.db.end().then(() => process.exit(0));
        });
    });
}
main().catch((error) => {
    console.error("Gateway failed to start:", error);
    process.exitCode = 1;
});
