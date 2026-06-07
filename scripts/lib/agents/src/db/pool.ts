import pg from 'pg';

const { Pool } = pg;

const ssl = process.env.DATABASE_URL?.includes('sslmode=disable')
  ? false
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

export default pool;
