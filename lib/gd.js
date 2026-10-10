// GD Topic Bank data and helpers. The topics ship with the app (data/gd-topics.json); nothing is stored in Supabase.
import DATA from '@/data/gd-topics.json';

export const SECTORS = DATA.sectors;
export const TOPICS = DATA.topics;
export const TOPIC_BY_ID = new Map(TOPICS.map(t => [t.id, t]));
export const fileTag = id => 'FILE ' + String(id).padStart(3, '0');

const GENERAL = 'General GD Topics';
const ABSTRACT = 'Abstract Topics';
// Career-choice topics (startup vs big firm, MBA and AI, job-hopping, moonlighting, monitoring, women in leadership, Gen Z at work).
export const CAREER_IDS = [134, 135, 151, 152, 153, 154, 155];

const sectorIds = name => (SECTORS.find(s => s.name === name) || { topic_ids: [] }).topic_ids;
const sample = (arr, n) => {
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

// 3 General topics with live developments, 2 Abstract topics and 1 career topic, none already picked.
export function alsoPractise(excludeIds = []){
  const taken = new Set(excludeIds);
  const general = sample(sectorIds(GENERAL).filter(id => !taken.has(id) && !CAREER_IDS.includes(id) && TOPIC_BY_ID.get(id)?.latest?.length), 3);
  general.forEach(id => taken.add(id));
  const abstract = sample(sectorIds(ABSTRACT).filter(id => !taken.has(id)), 2);
  abstract.forEach(id => taken.add(id));
  const career = sample(CAREER_IDS.filter(id => !taken.has(id)), 1);
  return [...general, ...abstract, ...career];
}

// Keeps only ids that exist in the bank (deduplicated, at most 10) and sector names that exist.
export function cleanPicks(raw){
  const seen = new Set();
  const picks = (Array.isArray(raw?.picks) ? raw.picks : [])
    .map(p => ({ id: Number(p?.id), reason: String(p?.reason || '').trim() }))
    .filter(p => TOPIC_BY_ID.has(p.id) && !seen.has(p.id) && seen.add(p.id))
    .slice(0, 10);
  const names = new Set(SECTORS.map(s => s.name));
  return {
    role_summary: String(raw?.role_summary || '').trim(),
    sectors: (Array.isArray(raw?.sectors) ? raw.sectors : []).filter(s => names.has(s)).slice(0, 3),
    picks
  };
}

export const STATS = {
  topics: TOPICS.length,
  sectors: SECTORS.length,
  generalAbstract: sectorIds(GENERAL).length + sectorIds(ABSTRACT).length,
  live: TOPICS.filter(t => t.latest?.length).length
};
