import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RightsizingDecision } from '../schemas/decision.js';
import { resolveInside } from '../utils/sanitize.js';

export function writeDecisionJson(workspace: string, relativePath: string, decision: RightsizingDecision): string {
  const full = resolveInside(workspace, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(decision, null, 2)}\n`, 'utf8');
  return full;
}

export function writeDecisionSarif(workspace: string, relativePath: string, decision: RightsizingDecision): string {
  const full = resolveInside(workspace, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  const level =
    decision.recommendation === 'scale-up'
      ? 'error'
      : decision.recommendation === 'review' || decision.recommendation === 'scale-down'
        ? 'warning'
        : 'note';
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'jev-resource-rightsizer',
            informationUri: 'https://github.com/JevForge/jev-resource-rightsizer',
            rules: [
              {
                id: 'rightsizing-recommendation',
                shortDescription: { text: 'Resource rightsizing recommendation' },
              },
            ],
          },
        },
        results: [
          {
            ruleId: 'rightsizing-recommendation',
            level,
            message: { text: decision.summary },
            properties: {
              recommendation: decision.recommendation,
              confidence: decision.confidence,
              reason_codes: decision.reason_codes,
            },
          },
        ],
      },
    ],
  };
  writeFileSync(full, `${JSON.stringify(sarif, null, 2)}\n`, 'utf8');
  return full;
}
