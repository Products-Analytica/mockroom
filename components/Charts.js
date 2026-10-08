import { DIMS, DIM_LABEL, weakest, fmtDate } from '@/lib/format';

export function ScoreTrend({ points }){
  if(!points || points.length < 2) return null;
  const W = 720, H = 200, P = 34;
  const x = i => P + i * ((W - P * 2) / (points.length - 1));
  const y = v => H - P - (v / 100) * (H - P * 2);
  const line = points.map((p, i) => `${x(i)},${y(p.score)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score over time">
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.13)" />
          <text x={P - 8} y={y(v) + 4} fill="#CDA9A6" fontSize="11" textAnchor="end" fontFamily="JetBrains Mono, monospace">{v}</text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke="#B8902F" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.score)} r="4.5" fill="#B8902F"><title>{`${fmtDate(p.date)}: ${p.score}`}</title></circle>
        </g>
      ))}
      <text x={x(0)} y={H - 8} fill="#CDA9A6" fontSize="11" fontFamily="JetBrains Mono, monospace">{fmtDate(points[0].date)}</text>
      <text x={x(points.length - 1)} y={H - 8} fill="#CDA9A6" fontSize="11" textAnchor="end" fontFamily="JetBrains Mono, monospace">{fmtDate(points[points.length - 1].date)}</text>
    </svg>
  );
}

export function DimBars({ dims }){
  if(!dims) return null;
  const w = weakest(dims);
  return (
    <div className="dims">
      {DIMS.map(d => (
        <div key={d} style={{ display: 'contents' }}>
          <span className={d === w ? 'weak' : ''}>{DIM_LABEL(d)}</span>
          <div className="bar"><div style={{ width: `${(dims[d] || 0) * 20}%` }} /></div>
          <span>{(dims[d] || 0).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function avgDims(rows){
  const withDims = rows.filter(r => r.dims && r.answered !== 0);
  if(!withDims.length) return null;
  const out = {};
  for(const d of DIMS) out[d] = withDims.reduce((a, r) => a + (r.dims[d] || 0), 0) / withDims.length;
  return out;
}
