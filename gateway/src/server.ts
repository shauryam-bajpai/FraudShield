import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { checkDatabaseConnection, db } from "./config/db";
import { env } from "./config/env";
import {
    errorHandler,
    notFound,
} from "./middleware/errorHandler";
import { requireAuth } from "./middleware/jwtAuth";
import { authRouter } from "./routes/auth.routes";
import { caseRouter } from "./routes/case.routes";
import { insightsRouter } from "./routes/insights.routes";
import { transactionRouter } from "./routes/transaction.routes";

const app = express();

const allowedOrigins = [
    process.env.CLIENT_ORIGIN,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
].filter(Boolean) as string[];

app.use(helmet());

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (curl, server-to-server, postman) or matching client origins
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        credentials: true,
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/v1/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "fraudshield-gateway",
    });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/transactions", requireAuth, transactionRouter);
app.use("/api/v1/cases", requireAuth, caseRouter);
app.use("/api/v1/insights", requireAuth, insightsRouter);

app.use(notFound);
app.use(errorHandler);

async function main() {
    await checkDatabaseConnection();

    const server = app.listen(
        env.PORT,
        "127.0.0.1",
        () => {
            console.log(
                `Gateway listening at http://127.0.0.1:${env.PORT}`
            );
        }
    );

    const shutdown = () => {
        server.close(() => {
            void db.end().then(() => process.exit(0));
        });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((error) => {
    console.error("Gateway failed to start:", error);
    process.exitCode = 1;
});
