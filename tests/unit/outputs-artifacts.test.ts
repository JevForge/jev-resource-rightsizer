import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOutcome, writeDecisionOutputs } from '../../src/github/outputs.js';
import { writeDecisionJson, writeDecisionSarif } from '../../src/github/artifacts.js';
import { normalizeAnswer } from '../../src/core/jev/normalize.js';
import { applyRightsizingPolicy } from '../../src/decision/policy.js';
import { report, resource, policyDefaults } from '../helpers.js';
import { acquireAzureToken } from '../../src/collectors/azure-monitor.js';
import { parseYamlOrJson, readBounded } from '../../src/utils/fs.js';
import { writeFileSync } from 'node:fs';

describe('outputs and artifacts', () => {
  it('writes decision outputs and applies warn outcome', async () => {
    const decision = normalizeAnswer(
      { decision: 'review', confidence: 0.8, provisional: false },
      report([resource({ cpu: 15, maxCpu: 90 })]),
    );
    const outputs: Record<string, string> = {};
    const warnings: string[] = [];
    await applyOutcome(
      {
        setOutput: (name, value) => {
          outputs[name] = value;
        },
        setFailed: () => undefined,
        warning: message => warnings.push(message),
        info: () => undefined,
        summary: () => undefined,
      },
      { status: 'warn', decision, message: decision.summary },
      'md',
    );
    expect(outputs.recommendation).toBe('review');
    expect(warnings[0]).toContain('review');

    writeDecisionOutputs(
      {
        setOutput: (name, value) => {
          outputs[name] = value;
        },
        setFailed: () => undefined,
        warning: () => undefined,
        info: () => undefined,
        summary: () => undefined,
      },
      decision,
    );
    expect(outputs.reason_codes).toContain('SPIKE_DETECTED');
    expect(JSON.parse(outputs.per_resource_recommendations)).toHaveLength(1);
  });

  it('writes decision json and sarif inside workspace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rightsizer-art-'));
    const decision = normalizeAnswer(
      { decision: 'keep', confidence: 0.9, provisional: false },
      report([resource({ cpu: 45 })]),
    );
    const jsonPath = writeDecisionJson(dir, 'out/decision.json', decision);
    const sarifPath = writeDecisionSarif(dir, 'out/decision.sarif', decision);
    expect(JSON.parse(readFileSync(jsonPath, 'utf8')).recommendation).toBe('keep');
    expect(JSON.parse(readFileSync(sarifPath, 'utf8')).version).toBe('2.1.0');
  });
});

describe('policy branches and utils', () => {
  it('honors no-op and request-review low confidence policies', () => {
    const r = report([resource({ cpu: 45 })]);
    const provisional = normalizeAnswer(
      { decision: null, confidence: 0, provisional: true, unavailableMessage: 'down' },
      r,
    );
    expect(
      applyRightsizingPolicy(provisional, r, { ...policyDefaults, lowConfidencePolicy: 'no-op' }).status,
    ).toBe('no-op');
    expect(
      applyRightsizingPolicy(provisional, r, {
        ...policyDefaults,
        lowConfidencePolicy: 'request-review',
      }).status,
    ).toBe('manual-review');
  });

  it('can fail on scale-up / scale-down', () => {
    const up = report([resource({ cpu: 90, memory: 85 })]);
    const down = report([resource({ cpu: 5, memory: 10 })]);
    const upDecision = normalizeAnswer({ decision: 'scale-up', confidence: 0.95, provisional: false }, up);
    const downDecision = normalizeAnswer(
      { decision: 'scale-down', confidence: 0.95, provisional: false },
      down,
    );
    expect(
      applyRightsizingPolicy(upDecision, up, {
        ...policyDefaults,
        allowPartial: true,
        allowInsufficient: true,
        failOnScaleUp: true,
      }).status,
    ).toBe('fail');
    expect(
      applyRightsizingPolicy(downDecision, down, {
        ...policyDefaults,
        allowPartial: true,
        allowInsufficient: true,
        failOnScaleDown: true,
      }).status,
    ).toBe('fail');
  });

  it('acquires azure token and reads bounded files', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    await expect(
      acquireAzureToken({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        timeoutMs: 2000,
        fetchImpl,
      }),
    ).resolves.toBe('tok');

    const dir = mkdtempSync(join(tmpdir(), 'rightsizer-fs-'));
    const file = join(dir, 'x.yml');
    writeFileSync(file, 'a: 1\n');
    expect(parseYamlOrJson(readBounded(file), 'x.yml')).toEqual({ a: 1 });
  });
});
