import { readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../config/db";

async function main() {
    const migrationPath = path.join(
        process.cwd(),
        "src",
        "db",
        "migrations",
        "001_initial_schema.sql"
    );

    const sql = await readFile(migrationPath, "utf8");

    try {
        await db.query(sql);
        console.log("Applied 001_initial_schema.sql");
    } finally {
        await db.end();
    }
}

main().catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
});