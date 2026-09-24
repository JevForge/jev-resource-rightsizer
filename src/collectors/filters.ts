import type { ResourceEvidence } from '../schemas/metrics.js';

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAny(resource: ResourceEvidence, patterns: string[]): boolean {
  return patterns.some(pattern => {
    const re = globToRegExp(pattern);
    return (
      re.test(resource.resource_id) ||
      re.test(resource.service) ||
      re.test(resource.resource_kind)
    );
  });
}

export interface ResourceFilter {
  include?: string[];
  exclude?: string[];
}

/**
 * Mark resources that fail allowlist or match denylist.
 * Excluded resources stay visible but are ignored for heuristic/Jev decisions.
 */
export function applyResourceFilters(
  resources: ResourceEvidence[],
  filter: ResourceFilter,
): ResourceEvidence[] {
  const include = (filter.include ?? []).map(item => item.trim()).filter(Boolean);
  const exclude = (filter.exclude ?? []).map(item => item.trim()).filter(Boolean);
  if (!include.length && !exclude.length) {
    return resources.map(resource => ({ ...resource, excluded: false }));
  }

  return resources.map(resource => {
    const denied = exclude.length > 0 && matchesAny(resource, exclude);
    const allowed = include.length === 0 || matchesAny(resource, include);
    return {
      ...resource,
      excluded: Boolean(denied || !allowed),
    };
  });
}

export function activeResources(resources: ResourceEvidence[]): ResourceEvidence[] {
  return resources.filter(resource => !resource.excluded);
}
