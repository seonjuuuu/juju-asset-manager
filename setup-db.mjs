import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  console.log("Dropping existing tables...");
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  console.log("Schema reset. Now run: pnpm db:push");
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
