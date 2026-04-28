import mysql from "mysql2/promise";
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function columnExists(conn, table, col) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  );
  return Number(rows[0].c) > 0;
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function addCol(name, ddl) {
  if (await columnExists(conn, "subscriptions", name)) {
    console.log(`skip: ${name} (already exists)`);
    return;
  }
  await conn.execute(ddl);
  console.log(`added: ${name}`);
}

try {
  await addCol(
    "user_id",
    "ALTER TABLE `subscriptions` ADD COLUMN `user_id` int NOT NULL DEFAULT 0"
  );
  await addCol(
    "shared_count",
    "ALTER TABLE `subscriptions` ADD COLUMN `shared_count` int NOT NULL DEFAULT 1"
  );
  await addCol("billing_day", "ALTER TABLE `subscriptions` ADD COLUMN `billing_day` int");
  await addCol(
    "is_paused",
    "ALTER TABLE `subscriptions` ADD COLUMN `is_paused` boolean NOT NULL DEFAULT false"
  );
  await addCol("paused_from", "ALTER TABLE `subscriptions` ADD COLUMN `paused_from` varchar(20)");

  try {
    await conn.execute(
      "ALTER TABLE `subscriptions` MODIFY COLUMN `billing_cycle` enum('매달','매주','매일','매년') NOT NULL DEFAULT '매달'"
    );
    console.log("billing_cycle: enum includes 매년");
  } catch (e) {
    console.log("billing_cycle:", e.message);
  }

  console.log("done.");
} finally {
  await conn.end();
}
