const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exportTasks } = require('./export.cjs');
const Airtable = require('airtable');

test('official SDK sends PATCH with performUpsert and no record ID', async () => {
  const base = new Airtable({ apiKey: 'test-only' }).base('appTest');
  const table = base('Tasks');
  // Replace only the SDK transport in this unit test; production uses real HTTP.
  table._base.runAction = (method, path, params, body, callback) => {
    assert.equal(method, 'patch');
    assert.deepEqual(body.performUpsert, { fieldsToMergeOn: ['Task ID'] });
    assert.equal(body.records[0].id, undefined);
    callback(null, {}, { records: [{ id: 'recTest', fields: body.records[0].fields }] });
  };
  assert.equal((await exportTasks([task('1')], table, noWait)).exported, 1);
});

// This double exists only in tests; it models upsert identity and scripted failures.
class FakeTable {
  constructor(errors = []) {
    this.records = new Map();
    this.errors = errors;
    this.calls = 0;
  }
  async update(records, options) {
    this.calls += 1;
    assert.deepEqual(options, { performUpsert: { fieldsToMergeOn: ['Task ID'] } });
    const error = this.errors.shift();
    if (error) throw error;
    for (const { fields } of records) this.records.set(fields['Task ID'], { ...fields });
    return records;
  }
}
const task = (id, title = 'Title') => ({ fields: { 'Task ID': id, Title: title } });
const noWait = async () => {};

test('double upserts instead of appending, including changed fields', async () => {
  const table = new FakeTable();
  const first = await exportTasks([task('1')], table, noWait);
  const second = await exportTasks([task('1', 'Changed')], table, noWait);
  assert.equal(first.exported, 1);
  assert.equal(second.exported, 1);
  assert.equal(table.records.size, 1);
  assert.equal(table.records.get('1').Title, 'Changed');
});

test('permanent validation failure is not retried and later records export', async () => {
  const table = new FakeTable([{ statusCode: 422, error: 'INVALID_VALUE_FOR_COLUMN' }]);
  const result = await exportTasks([task('1'), task('2')], table, noWait);
  assert.equal(table.calls, 2);
  assert.equal(result.exported, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].task_id, '1');
  assert.ok(table.records.has('2'));
});

for (const error of [{ statusCode: 429 }, { statusCode: 503 }, { error: 'CONNECTION_ERROR' }]) {
  test(`retries transient ${JSON.stringify(error)}`, async () => {
    const table = new FakeTable([error]);
    const delays = [];
    const result = await exportTasks([task('1')], table, async ms => delays.push(ms));
    assert.equal(result.exported, 1);
    assert.equal(table.calls, 2);
    assert.ok(delays.includes(error.statusCode === 429 ? 30000 : 1000));
  });
}

test('exhausted retries fail one record and continue', async () => {
  const table = new FakeTable(Array(3).fill({ statusCode: 503 }));
  const result = await exportTasks([task('1'), task('2')], table, noWait);
  assert.equal(table.calls, 4);
  assert.equal(result.failed, 1);
  assert.equal(result.exported, 1);
});

test('ambiguous timeout after a write does not create duplicate records', async () => {
  const table = new FakeTable();
  const update = table.update.bind(table);
  let first = true;
  table.update = async (...args) => {
    const result = await update(...args);
    if (first) { first = false; throw { error: 'CONNECTION_ERROR' }; }
    return result;
  };
  assert.equal((await exportTasks([task('1')], table, noWait)).exported, 1);
  assert.equal(table.records.size, 1);
});

test('global authorization failure stops with explicit skipped count', async () => {
  const table = new FakeTable([{ statusCode: 403, error: 'FORBIDDEN' }]);
  const result = await exportTasks([task('1'), task('2')], table, noWait);
  assert.equal(table.calls, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 1);
  assert.ok(result.error);
});

test('handles empty exports and 1000 tasks', async () => {
  const table = new FakeTable();
  assert.equal((await exportTasks([], table, noWait)).attempted, 0);
  const result = await exportTasks(Array.from({ length: 1000 }, (_, i) => task(String(i))), table, noWait);
  assert.equal(result.exported, 1000);
  assert.equal(table.records.size, 1000);
});
