import { Client } from 'pg';
import * as dotenv from 'dotenv';

/**
 * Create or drop the application database.
 *
 * This replaces `scripts/db-drop.sh` and `scripts/db-create.sh`, which needed
 * `bash` **and** the PostgreSQL client tools (`psql`, `createdb`, `dropdb`) on
 * the PATH — so `npm run db:reset:demo` failed outright on a Windows machine
 * with "'bash' is not recognized", and on a Unix machine without the client
 * tools installed. The npm scripts are the documented interface, so they have
 * to work wherever the app runs.
 *
 * `pg` is already a dependency (the seed scripts use it), so this needs
 * nothing new: connect to the `postgres` maintenance database and run the DDL
 * from there, which is what `createdb` and `dropdb` do.
 *
 *   npm run db:drop     — drop the database if it exists
 *   npm run db:create   — create it if it does not
 */

dotenv.config();

const DEFAULT_URL = 'postgresql://postgres:admin@localhost:5432/tu-properies';

interface Target {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

/**
 * Read the connection target out of DATABASE_URL.
 *
 * The name and the user are checked against a strict pattern before they go
 * near a `CREATE DATABASE` or `DROP DATABASE`, because those statements take
 * an identifier and not a value, and an identifier cannot be parameterised.
 * A hyphen is allowed — this project's database is called `tu-properies` — and
 * both are double-quoted where they are used.
 */
function targetFrom(rawUrl: string): Target {
  const url = new URL(rawUrl);
  const database =
    decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres';
  const user = decodeURIComponent(url.username);

  if (!/^[A-Za-z0-9_-]+$/.test(database)) {
    throw new Error(
      `The database name "${database}" is not a plain identifier. Rename it, or point DATABASE_URL at one that is.`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(user)) {
    throw new Error(`The database user "${user}" is not a plain identifier.`);
  }

  return {
    user,
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: Number(url.port || 5432),
    database,
  };
}

async function main() {
  const action = process.argv[2];
  if (action !== 'drop' && action !== 'create') {
    throw new Error('Usage: db-admin.ts <drop|create>');
  }

  const target = targetFrom(process.env.DATABASE_URL || DEFAULT_URL);

  // The maintenance database: you cannot drop the database you are connected
  // to, so the connection is made elsewhere and the target is closed first.
  const admin = new Client({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: 'postgres',
  });
  await admin.connect();

  try {
    const existing = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [target.database],
    );

    if (action === 'create') {
      if (existing.rowCount) {
        console.log(`Database '${target.database}' already exists.`);
        return;
      }
      await admin.query(
        `CREATE DATABASE "${target.database}" OWNER "${target.user}"`,
      );
      console.log(`Database '${target.database}' created.`);
      return;
    }

    if (!existing.rowCount) {
      console.log(
        `Database '${target.database}' does not exist; nothing to drop.`,
      );
      return;
    }

    // Anything still connected to it would block the drop. The pool that the
    // running application opened is the usual culprit, and a developer who
    // ran the app and then asked for a reset should not have to guess why the
    // reset failed.
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [target.database],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${target.database}"`);
    console.log(`Database '${target.database}' dropped.`);
  } finally {
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
