import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection);

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`card_points\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`name\` varchar(200) NOT NULL,
      \`benefits\` text,
      \`balance\` bigint DEFAULT 0,
      \`purpose\` varchar(200),
      \`note\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`card_points_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("card_points table created");

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS \`cards\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`card_type\` enum('신용카드','체크카드') NOT NULL DEFAULT '신용카드',
      \`card_company\` varchar(100) NOT NULL,
      \`card_name\` varchar(200),
      \`benefits\` text,
      \`annual_fee\` bigint DEFAULT 0,
      \`performance\` varchar(200),
      \`purpose\` varchar(200),
      \`credit_limit\` bigint DEFAULT 0,
      \`expiry_date\` varchar(10),
      \`payment_date\` varchar(50),
      \`payment_account\` varchar(200),
      \`note\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`cards_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("cards table created");
} catch (err) {
  console.error("Migration error:", err.message);
} finally {
  await connection.end();
}
