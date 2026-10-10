'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import { SECTORS, TOPICS, TOPIC_BY_ID, STATS, fileTag, alsoPractise, cleanPicks } from '@/lib/gd';
import { chatJSON, getKey, BUSY } from '@/lib/gemini';
import { gdTopicsPrompt } from '@/lib/prompts';
import { getDraft, getBookmarks, saveBookmarks, getGdResult, saveGdResult } from '@/lib/local';

export default function Page(){ return <AuthGate><GdBank /></AuthGate>; }

const BOOKMARKS = '__bookmarks__';

function GdBank(){
  const [sector, setSector] = useState(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);

  useEffect(() => { setBookmarks(getBookmarks()); }, []);

  function toggleBookmark(id){
    setBookmarks(b => {
      const next = b.includes(id) ? b.filter(x => x !== id) : [...b, id];
      saveBookmarks(next);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const matches = t => !q || [t.title, t.hook, t.why, t.starter, t.sector, ...t.points_for, ...t.points_against].join(' ').toLowerCase().includes(q);

  // Topic lists grouped by sector, narrowed by the sector/bookmark filter and the search box.
  const groups = useMemo(() => {
    if(sector === BOOKMARKS){
      const list = bookmarks.map(id => TOPIC_BY_ID.get(id)).filter(t => t && matches(t));
      return list.length ? [{ name: 'My bookmarks', topics: list }] : [];
    }
    return SECTORS.filter(s => !sector || s.name === sector)
      .map(s => ({ name: s.name, topics: s.topic_ids.map(id => TOPIC_BY_ID.get(id)).filter(t => t && matches(t)) }))
      .filter(g => g.topics.length);
  }, [sector, q, bookmarks]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickSector(name){
    setSector(s => s === name ? null : name);
    setTimeout(() => document.getElementById('gd-lists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <section className="gd">
      <p className="eyebrow">GD prep</p>
      <h1>GD Topic Bank.</h1>
      <p className="lede">Topics drawn from this year&apos;s hiring themes across {STATS.sectors} sectors, plus general and abstract staples. Open any topic for an opening line, points on both sides and 2026 developments.</p>
      <div className="stats">
        <div className="stat"><div className="n">{STATS.topics}</div><div className="l">GD topics</div></div>
        <div className="stat"><div className="n">{STATS.sectors}</div><div className="l">Sectors</div></div>
        <div className="stat"><div className="n">{STATS.generalAbstract}</div><div className="l">General &amp; abstract</div></div>
        <div className="stat"><div className="n">{STATS.live}</div><div className="l">With 2026 updates</div></div>
      </div>

      <JdMatcher onOpen={setOpenId} />

      <h2>Browse by sector</h2>
      <div className="sector-grid">
        <button className={`sector-card${sector === BOOKMARKS ? ' active' : ''}`} onClick={() => pickSector(BOOKMARKS)}>
          <span className="sector-count">{bookmarks.length} saved</span>
          <span className="sector-name">My bookmarks</span>
          <span className="sector-blurb">Topics you&apos;ve bookmarked, saved in this browser.</span>
        </button>
        {SECTORS.map(s => (
          <button key={s.name} className={`sector-card${sector === s.name ? ' active' : ''}`} onClick={() => pickSector(s.name)}>
            <span className="sector-count">{s.topic_ids.length} topics</span>
            <span className="sector-name">{s.name}</span>
            <span className="sector-blurb">{s.blurb}</span>
          </button>
        ))}
      </div>

      <div className="tools" id="gd-lists">
        <input placeholder="Search topics, e.g. AI, GST, gig workers, quick commerce" value={query} onChange={e => setQuery(e.target.value)} />
        {(sector || query) && <button className="link" onClick={() => { setSector(null); setQuery(''); }}>Clear{sector ? `: ${sector === BOOKMARKS ? 'My bookmarks' : sector}` : ''}</button>}
      </div>

      {groups.map(g => (
        <div key={g.name}>
          <div className="gd-heading"><h2>{g.name}</h2><span className="sub">{g.topics.length}</span></div>
          {g.topics.map(t => <TopicRow key={t.id} t={t} saved={bookmarks.includes(t.id)} onOpen={setOpenId} onBookmark={toggleBookmark} />)}
        </div>
      ))}
      {!groups.length && (
        <p className="hint">{sector === BOOKMARKS && !bookmarks.length ? 'No bookmarks yet. Use the bookmark button on any topic to save it here.' : 'No topics match that search. Try a different term.'}</p>
      )}

      {openId && <TopicModal t={TOPIC_BY_ID.get(openId)} saved={bookmarks.includes(openId)} onBookmark={toggleBookmark} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function TopicRow({ t, saved, onOpen, onBookmark }){
  return (
    <div className="topic-row">
      <button className="topic-main" onClick={() => onOpen(t.id)}>
        <span className="file-no">{fileTag(t.id)}</span>
        <span className="topic-title">{t.title}</span>
        {t.latest?.length > 0 && <span className="fresh-dot" title="Has 2026 developments" />}
      </button>
      <button className={`bookmark${saved ? ' on' : ''}`} onClick={() => onBookmark(t.id)} aria-pressed={saved} aria-label={saved ? 'Remove bookmark' : 'Bookmark'}>
        {saved ? '★' : '☆'}
      </button>
    </div>
  );
}

function TopicModal({ t, saved, onBookmark, onClose }){
  useEffect(() => {
    const onKey = e => { if(e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  if(!t) return null;
  return (
    <div className="modal-overlay" onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="gd-modal-title">
        <div className="modal-head">
          <div className="modal-tags"><span className="file-no">{fileTag(t.id)}</span><span className="sub">{t.sector}</span></div>
          <h2 id="gd-modal-title">{t.title}</h2>
          <p className="lede">{t.hook}</p>
          <div className="modal-actions">
            <button className={`bookmark-btn${saved ? ' on' : ''}`} onClick={() => onBookmark(t.id)}>{saved ? '★ Bookmarked' : '☆ Bookmark'}</button>
            <button className="link" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="modal-body">
        <h3>Why this matters</h3>
        <p>{t.why}</p>
        <h3>Opening line</h3>
        <p className="starter">{t.starter}</p>
        <div className="cols">
          <div><h3 className="for">For</h3><ul>{t.points_for.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
          <div><h3 className="against">Against</h3><ul>{t.points_against.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
        </div>
        {t.latest?.length > 0 && (
          <>
            <h3>Latest developments</h3>
            {t.latest.map((l, i) => <p key={i} className="latest"><span className="file-no">{l.date}</span> {l.text}</p>)}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// "Topics for your JD": Gemini picks the most relevant topics from the bank (ids only), then we add general/abstract practice topics.
function JdMatcher({ onOpen }){
  const [jd, setJd] = useState('');
  const [hasKey, setHasKey] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    setHasKey(!!getKey());
    const saved = getGdResult();
    setResult(saved);
    setJd(saved?.jd || getDraft().jd || '');
  }, []);

  async function find(){
    setBusy(true); setErr(null); setStatus('Reading the JD…');
    try{
      const compact = TOPICS.map(t => ({ id: t.id, sector: t.sector, title: t.title }));
      const raw = await chatJSON({ messages: gdTopicsPrompt({ jd: jd.trim(), topics: compact }), temperature: 0.3, maxTokens: 4096, onStatus: s => setStatus(s || 'Reading the JD…') });
      const clean = cleanPicks(raw);
      if(!clean.picks.length) throw new Error('No matching topics came back.');
      const next = { jd: jd.trim(), ...clean, also: alsoPractise(clean.picks.map(p => p.id)), at: new Date().toISOString() };
      setResult(next); saveGdResult(next);
    }catch(e){
      setErr(e);
    }
    setBusy(false); setStatus('');
  }

  function shuffle(){
    const next = { ...result, also: alsoPractise(result.picks.map(p => p.id)) };
    setResult(next); saveGdResult(next);
  }

  const errMsg = !err ? '' : err.isAuth ? null : err.allBusy ? BUSY : err.status === 0 || err.status === 404 ? err.message : `Something went wrong talking to the AI. ${err.message || ''}`;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Topics for your JD</h2>
      <p className="hint" style={{ marginTop: 0 }}>Paste the job description and get the GD topics most likely to come up for that role.</p>
      <label htmlFor="gd-jd">Job description</label>
      <textarea id="gd-jd" value={jd} onChange={e => setJd(e.target.value)} placeholder="Paste the JD here" />
      {!hasKey ? (
        <p className="hint">This uses your Gemini key. <Link href="/settings">Connect your free Gemini key</Link> to use it.</p>
      ) : (
        <div className="actions">
          <button className="primary" onClick={find} disabled={busy || jd.trim().length < 80}>{busy ? 'Finding topics…' : 'Find my topics'}</button>
          {busy && <span className="working"><span className="spin" />{status}</span>}
          {!busy && jd.trim().length > 0 && jd.trim().length < 80 && <span className="hint">Add a bit more of the JD (a few lines at least).</span>}
        </div>
      )}
      {err && err.isAuth && <p className="err">Google rejected your Gemini key. <Link href="/settings?key=rejected">Update it in Settings</Link>.</p>}
      {errMsg && <p className="err">{errMsg} <button className="retry" onClick={find}>Retry</button></p>}

      {result && !busy && (
        <div className="gd-results">
          {result.role_summary && <p className="lede" style={{ marginTop: 24 }}>{result.role_summary}</p>}
          {result.sectors?.length > 0 && <p className="hint">Closest sectors: {result.sectors.join(', ')}</p>}
          <h3>Most relevant to this role</h3>
          {result.picks.map(p => TOPIC_BY_ID.get(p.id) && (
            <MatchRow key={p.id} t={TOPIC_BY_ID.get(p.id)} reason={p.reason} onOpen={onOpen} />
          ))}
          <div className="gd-heading" style={{ marginTop: 24 }}>
            <h3 style={{ margin: 0 }}>Also practise</h3>
            <button className="link" onClick={shuffle}>Shuffle</button>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>GD panels often choose general or abstract topics regardless of the role, so practise both.</p>
          {result.also.map(id => TOPIC_BY_ID.get(id) && <MatchRow key={id} t={TOPIC_BY_ID.get(id)} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function MatchRow({ t, reason, onOpen }){
  return (
    <button className="match-row" onClick={() => onOpen(t.id)}>
      <span className="file-no">{fileTag(t.id)}</span>
      <span className="topic-title">{t.title}{reason && <span className="topic-reason">{reason}</span>}</span>
    </button>
  );
}
