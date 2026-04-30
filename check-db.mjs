import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  const tables = await sql`
    SELECT table_name,
           (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as col_count
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log("Existing tables:");
  tables.forEach(t => console.log(`  ${t.table_name} (${t.col_count} cols)`));

  // Check row counts for each table
  for (const t of tables) {
    const [{ count }] = await sql`SELECT count(*) FROM ${sql(t.table_name)}`;
    if (Number(count) > 0) console.log(`  ⚠️  ${t.table_name}: ${count} rows`);
  }
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
