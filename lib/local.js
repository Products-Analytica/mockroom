// Private data that never leaves this browser: the resume, the last JD, and full interview
// reports (questions, answers, per-question feedback) keyed by interview id.
import { supabase } from './supabase';

const K = { draft: 'mr:draft', reports: 'mr:reports' };
const KEEP = 30;

function read(key, fallback){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch{ return fallback; }
}
function write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

export const getDraft = () => read(K.draft, { resume: '', jd: '' });
export function saveDraft(resume, jd){ try{ write(K.draft, { resume, jd }); }catch(e){ console.warn('Resume not saved locally', e); } }

// Newest first.
export const listReports = () => read(K.reports, []);
export const getReport = id => listReports().find(r => r.id === id) || null;
export function saveReport(report){
  const list = listReports();
  const next = list.some(r => r.id === report.id) ? list.map(r => r.id === report.id ? report : r) : [report, ...list];
  try{ write(K.reports, next.slice(0, KEEP)); }
  catch(e){ console.warn('Full report not saved locally', e); }
}
export function deleteReport(id){ try{ write(K.reports, listReports().filter(r => r.id !== id)); }catch{} }

// Sends only the summary columns of a local report to the database and marks it synced.
// Reports carry their own id, so a retry after a half-finished insert can't create a duplicate.
const SUMMARY = ['id', 'user_id', 'created_at', 'role_title', 'focus', 'difficulty', 'mode', 'model', 'score', 'verdict', 'questions', 'answered', 'wpm', 'avg_seconds', 'dims', 'summary'];
export async function syncReport(report){
  const row = Object.fromEntries(SUMMARY.map(k => [k, report[k]]));
  try{
    const { error } = await supabase.from('interviews').insert(row);
    if(error && error.code !== '23505') throw error;   // 23505: already saved
  }catch(e){
    console.error('Interview summary not synced', e);
    return false;
  }
  saveReport({ ...report, synced: true });
  return true;
}
