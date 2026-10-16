import express from "express";
import helmet from "helmet";

import { checkDatabaseConnection, db } from "./config/db";
import { env } from "./config/env";
import {
    errorHandler,
    notFound,
} from "./middleware/errorHandler";
import { transactionRouter } from "./routes/transaction.routes";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "fraudshield-gateway",
    });
});

app.use("/api/v1/transactions", transactionRouter);

app.use(notFound);
app.use(errorHandler);

async function main() {
    await checkDatabaseConnection();

    // Local development only. Authentication comes in the next batch.
    const server = app.listen(env.PORT, "127.0.0.1", () => {
        console.log(
            `Gateway listening at http://127.0.0.1:${env.PORT}`
        );
    });

    process.on("SIGINT", () => {
        server.close(() => {
            void db.end().then(() => process.exit(0));
        });
    });
}

main().catch((error) => {
    console.error("Gateway failed to start:", error);
    process.exitCode = 1;
});