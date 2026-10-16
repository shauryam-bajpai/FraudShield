"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const db_1 = require("../config/db");
async function main() {
    const migrationPath = node_path_1.default.join(process.cwd(), "src", "db", "migrations", "001_initial_schema.sql");
    const sql = await (0, promises_1.readFile)(migrationPath, "utf8");
    try {
        await db_1.db.query(sql);
        console.log("Applied 001_initial_schema.sql");
    }
    finally {
        await db_1.db.end();
    }
}
main().catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
});
