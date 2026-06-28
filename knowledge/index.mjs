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

import { core } from './core.mjs';
import { running } from './running.mjs';
import { strength } from './strength.mjs';
import { periodization } from './periodization.mjs';
import { recovery } from './recovery.mjs';
import { physiology } from './physiology.mjs';
import { hyrox } from './hyrox.mjs';
import { deka } from './deka.mjs';
import { nutrition } from './nutrition.mjs';
import { exercise_library } from './exercise_library.mjs';
import { fitstop, fitstopMeta } from './fitstop.mjs';

// Domains authored from established, cited science are arrays of entries.
// Fitstop is proprietary: its entries are a GENERIC FALLBACK (provided:false) until
// verified user material is supplied (see fitstop.TEMPLATE.md).
const DOMAINS = {
  core, running, strength, periodization, recovery, physiology,
  hyrox, deka, nutrition, exercise_library,
  fitstop: { __domain: true, domain: 'fitstop', provided: fitstopMeta.provided, note: fitstopMeta.note, entries: fitstop },
};

function allEntries() {
  return Object.values(DOMAINS).flatMap(d => Array.isArray(d) ? d : (d.entries || []));
}

export const Knowledge = {
  repoVersion: 2,

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
