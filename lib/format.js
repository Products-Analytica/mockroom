export const DIMS = ['relevance', 'depth', 'structure', 'evidence', 'communication'];
export const DIM_LABEL = d => d[0].toUpperCase() + d.slice(1);
export const verdict = sc => sc >= 75 ? 'Interview-ready' : sc >= 60 ? 'Good, with gaps to close' : sc >= 45 ? 'Borderline' : 'Needs more practice';
export const fmtSecs = t => `${Math.floor((t || 0) / 60)}:${String((t || 0) % 60).padStart(2, '0')}`;
export const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Turns a finished interview session into the report saved in this browser.
export function toReport(s, userId){
  const answered = s.items.filter(i => !i.skipped);
  const dims = {};
  for(const d of DIMS){
    dims[d] = answered.length ? +(answered.reduce((a, i) => a + i.eval.scores[d], 0) / answered.length).toFixed(2) : 0;
  }
  const spoken = answered.filter(i => i.spoken && i.speakSeconds > 5);
  const words = spoken.reduce((a, i) => a + i.answer.split(/\s+/).length, 0);
  const mins = spoken.reduce((a, i) => a + i.speakSeconds, 0) / 60;
  return {
    id: crypto.randomUUID(), created_at: new Date().toISOString(), user_id: userId,
    role_title: s.role, focus: s.focus, difficulty: s.difficulty, mode: s.voice ? 'voice' : 'text', model: s.model,
    score: s.score, verdict: verdict(s.score), questions: s.items.length, answered: answered.length,
    wpm: mins > 0 ? Math.round(words / mins) : null,
    avg_seconds: answered.length ? Math.round(answered.reduce((a, i) => a + (i.seconds || 0), 0) / answered.length) : 0,
    dims, summary: s.summary || {},
    items: s.items.map(i => ({
      category: i.category, question: i.question, followup: !!i.followup, answer: i.answer, skipped: !!i.skipped,
      spoken: !!i.spoken, seconds: i.seconds, score: i.score, eval: i.eval
    }))
  };
}

export function weakest(dims){
  if(!dims) return null;
  let w = null;
  for(const d of DIMS){ if(dims[d] > 0 && (w === null || dims[d] < dims[w])) w = d; }
  return w;
}

export function downloadCSV(name, rows){
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
