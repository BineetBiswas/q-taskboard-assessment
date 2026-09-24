const Airtable = require('airtable');
const { setTimeout: sleep } = require('node:timers/promises');

function isTransient(error) {
  return [408, 429, 500, 502, 503, 504].includes(error.statusCode) ||
    ['CONNECTION_ERROR', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error.error || error.code);
}

async function exportTasks(tasks, table, wait = sleep) {
  const result = { attempted: 0, exported: 0, failed: 0, skipped: 0, failures: [] };
  for (const task of tasks) {
    result.attempted += 1;
    let failure;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // One record per request isolates validation failures. Pace below 5 requests/second.
      await wait(250);
      try {
        // Airtable matches the stable task UUID, including after an ambiguous timeout.
        await table.update([{ fields: task.fields }], {
          performUpsert: { fieldsToMergeOn: ['Task ID'] },
        });
        failure = null;
        break;
      } catch (error) {
        failure = error;
        if (!isTransient(error) || attempt === 2) break;
        // Airtable rate-limit responses require a longer cooldown than server errors.
        await wait(error.statusCode === 429 ? 30000 : 1000 * (2 ** attempt));
      }
    }
    if (!failure) {
      result.exported += 1;
      continue;
    }
    result.failed += 1;
    result.failures.push({ task_id: task.fields['Task ID'], error: failure.error || failure.code || 'AIRTABLE_ERROR' });
    if ([401, 403, 404].includes(failure.statusCode)) {
      result.error = 'Airtable credentials, base, or table are not accessible.';
      result.skipped = tasks.length - result.attempted;
      break;
    }
  }
  return result;
}

async function main() {
  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    throw new Error('Missing Airtable configuration');
  }
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const tasks = JSON.parse(input);
  // Disable SDK retries so our bounded policy is the only retry loop.
  const client = new Airtable({ apiKey: AIRTABLE_API_KEY, noRetryIfRateLimited: true, requestTimeout: 15000 });
  const table = client.base(AIRTABLE_BASE_ID)(AIRTABLE_TABLE_NAME);
  process.stdout.write(JSON.stringify(await exportTasks(tasks, table)));
}

if (require.main === module) {
  main().catch(() => {
    // Never send credentials or SDK request details to stdout/stderr.
    process.stderr.write('Airtable export runner failed.');
    process.exitCode = 1;
  });
}

module.exports = { exportTasks };
