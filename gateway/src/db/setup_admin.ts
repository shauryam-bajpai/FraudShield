import bcrypt from "bcryptjs";

import { db } from "../config/db";


async function main() {
    const email = process.env.ADMIN_EMAIL
        ?.trim()
        .toLowerCase();

    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password || password.length < 12) {
        throw new Error(
            "Set ADMIN_EMAIL and ADMIN_PASSWORD " +
            "(at least 12 characters) in gateway/.env"
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        const result = await db.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
            [email, passwordHash]
        );

        if (result.rows.length === 0) {
            console.log("Admin already exists; no changes made");
        } else {
            console.log("Admin account created");
        }
    } finally {
        await db.end();
    }
}


main().catch((error) => {
    console.error("Admin setup failed:", error);
    process.exitCode = 1;
});