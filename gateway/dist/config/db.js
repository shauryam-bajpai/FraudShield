"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.checkDatabaseConnection = checkDatabaseConnection;
const pg_1 = require("pg");
const env_1 = require("./env");
exports.db = new pg_1.Pool({
    connectionString: env_1.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});
async function checkDatabaseConnection() {
    await exports.db.query("SELECT 1");
}
