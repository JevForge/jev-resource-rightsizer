import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixture = JSON.parse(readFileSync(join(repoRoot, 'tests', 'fixtures', 'smoke-golden.json'), 'utf8'));
let receivedRequest;

const server = createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    receivedRequest = body ? JSON.parse(body) : null;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(fixture.provider_response));
  });
});

function runAction(env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [join(repoRoot, 'dist', 'index.js')], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
    });
    child.on('error', rejectRun);
    child.on('exit', code => resolveRun(code ?? 1));
  });
}

const temp = mkdtempSync(join(tmpdir(), 'jev-rightsizer-smoke-'));
const outputPath = join(temp, 'github-output');
const summaryPath = join(temp, 'summary.md');
writeFileSync(outputPath, '');
writeFileSync(summaryPath, '');

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Smoke mock did not expose a TCP port.');
  const env = {
    ...process.env,
    GITHUB_WORKSPACE: repoRoot,
    GITHUB_REPOSITORY: 'JevForge/jev-resource-rightsizer',
    GITHUB_SHA: '0000000000000000000000000000000000000000',
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
    INPUT_METRICS_PATH: 'tests/fixtures/metrics-underutilized.json',
    INPUT_ENVIRONMENT: 'production',
    INPUT_JEV_PROVIDER: 'custom-compatible',
    INPUT_JEV_ENDPOINT: `http://127.0.0.1:${address.port}/evaluate`,
    INPUT_JEV_MODEL: 'typesafe-ai/jev',
    INPUT_CREATE_CHECK_RUN: 'false',
    INPUT_REDACT_RESOURCE_NAMES: 'false',
    JEV_CUSTOM_API_KEY: 'smoke-only-key',
  };
  const exitCode = await runAction(env);
  if (exitCode !== 0) throw new Error(`Bundled Action exited with ${exitCode}.`);
  if (!receivedRequest?.state?.resources?.length) throw new Error('Mock did not receive resource evidence.');
  const output = readFileSync(outputPath, 'utf8');
  for (const expected of [fixture.expected.recommendation, fixture.expected.heuristic_recommendation, fixture.expected.resource_count]) {
    if (!output.includes(expected)) throw new Error(`Golden output is missing ${expected}.`);
  }
  console.log('Provider mock smoke passed.');
} finally {
  server.close();
  rmSync(temp, { recursive: true, force: true });
}
