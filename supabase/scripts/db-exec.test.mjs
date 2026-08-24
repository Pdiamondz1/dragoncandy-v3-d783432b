// What this pins: `db:apply --no-transaction` must issue the migration and its ledger row as TWO
// SEPARATE API calls.
//
// Why it needs a test rather than a comment: Postgres wraps every statement of a multi-statement
// query in one implicit transaction, so concatenating the two re-creates the exact transaction the
// flag exists to escape. Measured against this project's database on 2026-08-24 —
// `vacuum (analyze) pg_class` alone succeeds; `select 1; vacuum (analyze) pg_class;` returns
// "25001: VACUUM cannot run inside a transaction block". The first version of this script
// concatenated them, so the flag could never have done the one job it is named for. A flag whose
// name is a promise it cannot keep is worse than no flag.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cmdApply, runSql, ApiError, findTransactionControl } from './db-exec.mjs';

const TOKEN = 'sbp_test_token_not_real';
const REF = 'testprojectref';
const VERSION = '20260824090000';
const MIGRATION_SQL = 'create index concurrently idx_example on public.example (id);\n';

let dir;
let migrationPath;
let calls;

/** Record every request body, and answer each call with `responses.shift()`. */
function stubFetch(responses) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body).query });
    const next = responses.shift() ?? { ok: true, rows: [] };
    return {
      ok: next.ok,
      status: next.ok ? 200 : 400,
      text: async () => JSON.stringify(next.ok ? next.rows : { message: next.message }),
    };
  });
}

/** The pre-check (version not yet recorded) and the ledger read-back that confirms it landed. */
const NOT_YET_RECORDED = { ok: true, rows: [] };
const NOW_RECORDED = { ok: true, rows: [{ version: VERSION, name: 'example' }] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'db-exec-'));
  migrationPath = join(dir, `${VERSION}_example.sql`);
  writeFileSync(migrationPath, MIGRATION_SQL);
  process.env.DB_EXEC_ASSUME_YES = '1';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.DB_EXEC_ASSUME_YES;
  vi.restoreAllMocks();
});

describe('db:apply --no-transaction', () => {
  it('sends the migration and the ledger row as two separate calls', async () => {
    stubFetch([NOT_YET_RECORDED, { ok: true, rows: [] }, { ok: true, rows: [] }, NOW_RECORDED]);

    await cmdApply(TOKEN, REF, [migrationPath, '--no-transaction']);

    // 1: pre-check, 2: the migration, 3: the ledger, 4: the read-back.
    expect(calls).toHaveLength(4);

    const migrationCall = calls[1].body;
    expect(migrationCall).toContain('create index concurrently');
    // The whole point: neither a transaction wrapper nor a second statement rides along.
    expect(migrationCall).not.toContain('begin;');
    expect(migrationCall).not.toContain('schema_migrations');

    const ledgerCall = calls[2].body;
    expect(ledgerCall).toContain('insert into supabase_migrations.schema_migrations');
    expect(ledgerCall).not.toContain('create index concurrently');
  });

  it('refuses to report success when the migration ran but the ledger insert failed', async () => {
    stubFetch([
      NOT_YET_RECORDED,
      { ok: true, rows: [] },
      { ok: false, message: 'permission denied for schema supabase_migrations' },
    ]);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });

    await expect(
      cmdApply(TOKEN, REF, [migrationPath, '--no-transaction']),
    ).rejects.toThrow('__exit__');

    expect(exit).toHaveBeenCalledWith(1);
    const said = console.error.mock.calls.flat().join('\n');
    expect(said).toContain('APPLIED BUT NOT RECORDED');
    // Name the version, or the operator cannot record it by hand.
    expect(said).toContain(VERSION);
  });
});

describe('db:apply (default)', () => {
  it('wraps the migration and the ledger row in one transaction, in one call', async () => {
    stubFetch([NOT_YET_RECORDED, { ok: true, rows: [] }, NOW_RECORDED]);

    await cmdApply(TOKEN, REF, [migrationPath]);

    // One fewer call than the --no-transaction path, because the two are sent together.
    expect(calls).toHaveLength(3);
    const body = calls[1].body;
    expect(body).toContain('begin;');
    expect(body).toContain('commit;');
    expect(body).toContain('create index concurrently');
    expect(body).toContain('insert into supabase_migrations.schema_migrations');
  });

  it('refuses a version the ledger already records', async () => {
    stubFetch([NOW_RECORDED]);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });

    await expect(cmdApply(TOKEN, REF, [migrationPath])).rejects.toThrow('__exit__');
    expect(exit).toHaveBeenCalledWith(1);
    // Only the pre-check ran; nothing was applied.
    expect(calls).toHaveLength(1);
  });
});

describe('runSql', () => {
  it('never puts the query in an error message', async () => {
    stubFetch([{ ok: false, message: 'syntax error' }]);
    // A query can embed values that do not belong in terminal scrollback or a CI log.
    const secret = "select * from users where token = 'hunter2'";

    let caught;
    try {
      await runSql(TOKEN, REF, secret, { rethrow: true });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.message).toContain('syntax error');
    expect(caught.message).not.toContain('hunter2');
  });

  it('never puts the token in an error message', async () => {
    stubFetch([{ ok: false, message: 'unauthorized' }]);
    try {
      await runSql(TOKEN, REF, 'select 1', { rethrow: true });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).not.toContain(TOKEN);
    }
  });
});

describe('findTransactionControl', () => {
  // The false-positive control, and the reason this needs a scanner rather than a bare regex.
  // 164 of this repo's 403 migrations contain BEGIN inside a plpgsql body. Swept 2026-08-24:
  // exactly one file flagged, and it is the one the review named.
  it('ignores BEGIN inside a dollar-quoted plpgsql body', () => {
    const sql = [
      'create or replace function public.f() returns trigger',
      'language plpgsql as $$',
      'begin',
      "  if new.x is null then raise exception 'nope'; end if;",
      '  return new;',
      'end;',
      '$$;',
    ].join('\n');
    expect(findTransactionControl(sql)).toBeNull();
  });

  it('ignores a tagged dollar quote', () => {
    expect(findTransactionControl('do $body$ begin perform 1; end $body$;')).toBeNull();
  });

  it('ignores transaction words inside comments and string literals', () => {
    expect(findTransactionControl('-- begin; commit;\nselect 1;')).toBeNull();
    expect(findTransactionControl('/* commit; */ select 1;')).toBeNull();
    expect(findTransactionControl("select 'commit;' as note;")).toBeNull();
  });

  // END is a synonym for COMMIT and is also how CASE closes. These two tests are the pair that
  // makes the rule meaningful: same keyword, opposite verdicts, separated by position alone.
  it('ignores a CASE expression that closes with END', () => {
    expect(findTransactionControl('select case when a then 1 else 2 end;')).toBeNull();
    expect(findTransactionControl('select 1;\nselect case when a then 1 else 2 end;')).toBeNull();
    expect(findTransactionControl('select case when a then 1 end as x from t;')).toBeNull();
  });

  it('finds a statement-level END, which Postgres treats as COMMIT', () => {
    expect(findTransactionControl('update t set x = 1;\nend;')).toBe('end');
    expect(findTransactionControl('update t set x = 1;\nend transaction;')).toBe('end transaction');
    expect(findTransactionControl('update t set x = 1;\nEND WORK;')).toBe('end work');
  });

  it('ignores transaction words inside a double-quoted identifier', () => {
    // Legal, and left visible it is a false POSITIVE — a migration rejected for control it
    // does not have.
    expect(findTransactionControl('alter table t rename column a to "x; commit; y";')).toBeNull();
    expect(findTransactionControl('select 1 as "he""re; commit;";')).toBeNull();
  });

  it('ignores transaction words inside an E-string, which escapes with backslashes', () => {
    // A naive scanner ends the literal at the \' and reads the remainder as code.
    expect(findTransactionControl("select E'it\\'s fine; commit;' as note;")).toBeNull();
  });

  it('finds the transaction-ending forms that do not spell themselves COMMIT', () => {
    // ABORT is ROLLBACK; AND CHAIN commits and opens a NEW transaction, so the migration's work
    // is already committed before the ledger insert is attempted.
    expect(findTransactionControl('update t set x = 1;\nabort;')).toBe('abort');
    expect(findTransactionControl('update t set x = 1;\nend and chain;')).toBe('end and chain');
    expect(findTransactionControl('update t set x = 1;\nend transaction and no chain;'))
      .toBe('end transaction and no chain');
    expect(findTransactionControl('update t set x = 1;\ncommit and chain;')).toBe('commit');
  });

  it('finds PREPARE TRANSACTION but not an ordinary prepared statement', () => {
    // Two-phase commit ends the transaction and leaves the work prepared, resolved by nobody.
    expect(findTransactionControl("update t set x = 1;\nprepare transaction 'tx1';"))
      .toBe('prepare transaction');
    // The control: same leading keyword, entirely different statement.
    expect(findTransactionControl('prepare p as select 1;')).toBeNull();
  });

  it('finds real transaction control at statement level', () => {
    expect(findTransactionControl('begin;\nupdate t set x = 1;\ncommit;')).toBe('begin');
    expect(findTransactionControl('update t set x = 1;\ncommit;')).toBe('commit');
    expect(findTransactionControl('update t set x = 1;\nrollback;')).toBe('rollback');
    expect(findTransactionControl('start transaction;\nselect 1;')).toBe('start transaction');
  });
});

describe('db:apply refuses a migration that controls its own transaction', () => {
  it('refuses in the wrapped path, naming the file and the keyword', async () => {
    writeFileSync(migrationPath, 'begin;\nupdate t set x = 1;\ncommit;\n');
    stubFetch([NOT_YET_RECORDED]);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__exit__');
    });

    await expect(cmdApply(TOKEN, REF, [migrationPath])).rejects.toThrow('__exit__');
    expect(exit).toHaveBeenCalledWith(1);

    const said = console.error.mock.calls.flat().join('\n');
    expect(said).toContain(VERSION + '_example.sql');
    expect(said).toContain('begin');
    // Nothing was applied — only the not-yet-recorded pre-check ran.
    expect(calls).toHaveLength(1);
  });

  it('allows it under --no-transaction, where there is no wrapper to end early', async () => {
    writeFileSync(migrationPath, 'begin;\nupdate t set x = 1;\ncommit;\n');
    stubFetch([NOT_YET_RECORDED, { ok: true, rows: [] }, { ok: true, rows: [] }, NOW_RECORDED]);

    await cmdApply(TOKEN, REF, [migrationPath, '--no-transaction']);
    expect(calls).toHaveLength(4);
  });
});
