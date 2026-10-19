import { Router } from "express";

import { env } from "../config/env";

export const insightsRouter = Router();

insightsRouter.get("/", async (_req, res, next) => {
    try {
        const response = await fetch(
            `${env.ML_SERVICE_URL}/api/ml/insights`,
            {
                headers: {
                    // Match the internal service header used by your mlClient service.
                    "x-internal-api-key": env.ML_INTERNAL_API_KEY,
                },
                signal: AbortSignal.timeout(10_000),
            }
        );

        const body = await response.json();

        if (!response.ok) {
            res.status(response.status).json(body);
            return;
        }

        res.json(body);
    } catch (error) {
        next(error);
    }
});