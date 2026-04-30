import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

await sql`
  INSERT INTO users ("openId", name, email, role)
  VALUES ('dev-user-local', 'Dev User', 'dev@local', 'admin')
  ON CONFLICT ("openId") DO NOTHING
`;

const [user] = await sql`SELECT id, name FROM users LIMIT 1`;
console.log("Dev user:", user);
await sql.end();
