// Knowledge Repository — registry + retrieval API.
//
// Engines read knowledge ONLY through this module. `select()` returns a small,
// relevant slice for the Reasoning/Programming engines to reason over and inject
// compactly — the corpus is never dumped wholesale into a prompt.
//
// Status: scaffold. `running` is fully worked. Other domains are registered as
// placeholders so the structure + sourcing policy are explicit. Proprietary domains
// (fitstop, deka methodology) intentionally hold NO fabricated content — they wait on
// verified, user-provided material and otherwise fall back to established science.

import { running } from './running.mjs';

// Placeholder domains — authored next, per the sourcing policy in README.md.
// `provided` flags whether verified content exists yet (false ⇒ engine falls back).
const PLACEHOLDER = (domain, note, provided = false) => ({
  __placeholder: true, domain, provided, note, entries: [],
});

const DOMAINS = {
  running,                                   // ✅ worked (established science)
  core:          PLACEHOLDER('core', 'Cross-cutting coaching principles (progressive overload, specificity, individualisation, recoverability).'),
  strength:      PLACEHOLDER('strength', 'Force/hypertrophy/concurrent-training science (Helms/Israetel volume landmarks, RIR autoregulation).'),
  hyrox:         PLACEHOLDER('hyrox', 'Event demands are PUBLIC (8×1km + 8 stations, compromised running) and may be encoded; coaching method follows established science.'),
  fitstop:       PLACEHOLDER('fitstop', 'PROPRIETARY — encode only from verified user-provided material. No fabrication. Falls back to established conditioning science until provided.'),
  deka:          PLACEHOLDER('deka', 'Event format is PUBLIC (DEKA Strong/Mile/Fit zones); proprietary coaching method needs verified input.'),
  nutrition:     PLACEHOLDER('nutrition', 'Fueling/hydration/recovery/race nutrition (ACSM/ISSN consensus).'),
  recovery:      PLACEHOLDER('recovery', 'HRV/sleep/fatigue/taper/connective-tissue adaptation (taper meta-analyses; HRV-guided training).'),
  periodization: PLACEHOLDER('periodization', 'Macro/meso/micro structure, phase potentiation, deload (Bompa; block periodisation).'),
  physiology:    PLACEHOLDER('physiology', 'Energy systems, adaptation timelines, interference effect, fatigue models.'),
  exercise_library: PLACEHOLDER('exercise_library', 'Movement taxonomy: pattern, equipment, stimulus, regressions/progressions, fatigue cost.'),
};

function allEntries() {
  return Object.values(DOMAINS).flatMap(d => Array.isArray(d) ? d : (d.entries || []));
}

export const Knowledge = {
  repoVersion: 1,

  /** Full entry by id, or null. */
  get(id) { return allEntries().find(e => e.id === id) || null; },

  /** All entries in a domain (empty array for unauthored/placeholder domains). */
  byDomain(domain) {
    const d = DOMAINS[domain];
    if (Array.isArray(d)) return d;
    return d?.entries || [];
  },

  /** Is a domain authored with verified content yet? */
  isProvided(domain) {
    const d = DOMAINS[domain];
    if (Array.isArray(d)) return d.length > 0;
    return !!d?.provided;
  },

  /** Domains still awaiting content (for status/UI). */
  pending() {
    return Object.entries(DOMAINS)
      .filter(([, d]) => !Array.isArray(d) && !d.provided)
      .map(([k, d]) => ({ domain: k, note: d.note }));
  },

  /**
   * Relevant slice for the engines. Narrow by program type / tags; returns a small,
   * ranked set rather than the whole corpus. (Ranking is intentionally simple now;
   * the Reasoning Engine will refine selection later.)
   */
  select({ programType, tags = [], domains = [], limit = 12 } = {}) {
    let pool = allEntries();
    if (domains.length) pool = pool.filter(e => domains.includes(e.domain));
    const want = new Set(tags);
    const scored = pool.map(e => {
      let score = 0;
      if (programType && Array.isArray(e.appliesTo) && e.appliesTo.includes(programType)) score += 2;
      if (want.size && Array.isArray(e.tags)) score += e.tags.filter(t => want.has(t)).length;
      return { e, score };
    });
    // Keep applicable entries; sort by relevance, then stable by id.
    return scored
      .filter(({ score }) => score > 0 || (!programType && !want.size))
      .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
      .slice(0, limit)
      .map(({ e }) => e);
  },

  /** Compact text rendering of a slice, for injection into a reasoning prompt. */
  toContext(entries) {
    return entries.map(e =>
      `• ${e.title}: ${e.summary}` +
      (e.prescription ? `\n  Rx: ${[e.prescription.intensity, e.prescription.frequency, e.prescription.progression].filter(Boolean).join(' · ')}` : '')
    ).join('\n');
  },
};

export default Knowledge;
