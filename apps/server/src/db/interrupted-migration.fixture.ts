import { writeSync } from 'node:fs';
import Database from 'better-sqlite3';
import { migrate, MIGRATIONS } from './migrations.js';

/**
 * Child process for the interrupted-migration test (P15-06): runs every pending migration on the
 * given file like openDatabase does, but the last one writes far more than SQLite's page cache
 * (so uncommitted pages reach the WAL file), reports "inside" and then blocks inside its
 * transaction until the test kills the process.
 */
const [file] = process.argv.slice(2);
const db = new Database(file!);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
const last = MIGRATIONS.at(-1)!;
migrate(db, [
  ...MIGRATIONS.slice(0, -1),
  {
    ...last,
    up: (connection) => {
      last.up(connection);
      connection.exec(
        `CREATE TABLE interrupted AS WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n
           LIMIT 100000) SELECT x, randomblob(200) AS filler FROM n`,
      );
      writeSync(1, 'inside\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    },
  },
]);
