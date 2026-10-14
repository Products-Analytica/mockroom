// Calls Google's Gemini API straight from the browser with the student's own key.
// The key lives only in this browser's localStorage and is sent only to Google.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const KEY = 'mr:gemini-key';
// Models to try in order, first = preferred. NEXT_PUBLIC_GEMINI_MODEL is the older single-model setting.
export const MODELS = (process.env.NEXT_PUBLIC_GEMINI_MODELS || process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map(m => m.trim()).filter(Boolean);
export const BUSY = 'Google\'s AI is very busy right now. Your progress is saved. Press Retry in a minute.';
export const RETRYING = 'The AI is busy, retrying…';

export function getKey(){ try{ return localStorage.getItem(KEY) || ''; }catch{ return ''; } }
export function setKey(k){ localStorage.setItem(KEY, k.trim()); }
export function clearKey(){ try{ localStorage.removeItem(KEY); }catch{} }
export const maskKey = k => k ? `${k.slice(0, 4)}${'•'.repeat(8)}${k.slice(-4)}` : '';

export class GeminiError extends Error{
  constructor(status, message){ super(message); this.status = status; }
  // Google answers a bad key with 400 "API key not valid", as well as 401/403.
  get isAuth(){ return this.status === 401 || this.status === 403 || (this.status === 400 && /api.?key/i.test(this.message)); }
  get isRateLimit(){ return this.status === 429; }
  get isOverloaded(){ return this.status === 503 || /high demand|overloaded|unavailable/i.test(this.message); }
  get isGone(){ return this.status === 404 || /no longer available|not found/i.test(this.message); }
  // A used-up daily free quota (retrying won't help until it resets), as opposed to a per-minute limit.
  get isDailyLimit(){ return this.status === 429 && /per ?day|perday|daily/i.test(`${this.message} ${this.raw || ''}`); }
  // Google sometimes says how long to wait, e.g. "retryDelay": "23s" or "Please retry in 23.4s".
  get retryAfterMs(){
    const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"|retry in (\d+(?:\.\d+)?)\s*s/i.exec(`${this.raw || ''} ${this.message}`);
    return m ? Math.ceil(parseFloat(m[1] || m[2]) * 1000) : null;
  }
}

// Free quotas reset at midnight Pacific time. Returns that day ("2026-10-14") and the next reset as a Date.
function pacificDay(d = new Date()){ return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d); }
function nextPacificMidnight(d = new Date()){
  const pt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const offset = d.getTime() - pt.getTime();
  return new Date(new Date(pt.getFullYear(), pt.getMonth(), pt.getDate() + 1).getTime() + offset);
}
export function dailyLimitMessage(){
  const at = nextPacificMidnight().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `You've used today's free Gemini limit on your key. It resets at about ${at}. Your progress is saved: press Retry after that, or connect a different key in Settings.`;
}

// Remembered for this browser session: the model that last answered, models that don't exist,
// models that hit a per-minute limit (paced more slowly) and backup models found on the student's key.
const OK_KEY = 'mr:model-ok', DEAD_KEY = 'mr:models-dead', SLOW_KEY = 'mr:models-slow', FOUND_KEY = 'mr:models-found';
// Remembered across sessions until Google's daily reset: models whose daily free quota is used up.
const DAILY_KEY = 'mr:models-daily';
const store = s => ({
  get(k, d){ try{ const v = s().getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ s().setItem(k, JSON.stringify(v)); }catch{} }
});
const session = store(() => sessionStorage), local = store(() => localStorage);
const addTo = (k, model) => session.set(k, [...new Set([...session.get(k, []), model])]);

function dailyExhausted(){
  const today = pacificDay(), all = local.get(DAILY_KEY, {});
  return new Set(Object.keys(all).filter(m => all[m] === today));
}
function markDaily(model){ local.set(DAILY_KEY, { ...local.get(DAILY_KEY, {}), [model]: pacificDay() }); }

function modelOrder(){
  const skip = new Set([...session.get(DEAD_KEY, []), ...dailyExhausted()]);
  const ok = session.get(OK_KEY, null);
  const live = [...new Set([...MODELS, ...session.get(FOUND_KEY, [])])].filter(m => !skip.has(m));
  return ok && live.includes(ok) ? [ok, ...live.filter(m => m !== ok)] : live;
}

// Asks Google which models this key can use and keeps general text "flash" models as extra backups,
// newest first, full models before lite. Runs at most once per session; returns how many were added.
let discovery = null;
function discoverModels(){
  if(session.get(FOUND_KEY, null)) return Promise.resolve(0);
  discovery = discovery || (async () => {
    try{
      const data = await request('/models', { method: 'GET' });
      const version = id => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(id) || [])[1]) || 0;
      const found = (data?.data || []).map(m => String(m.id || '').replace(/^models\//, ''))
        .filter(id => /^gemini-/.test(id) && /flash/.test(id) && !/(image|tts|audio|embed|live|vision|native|thinking|robotics|computer|exp|preview|learnlm)/i.test(id))
        .filter(id => !MODELS.includes(id))
        .sort((a, b) => version(b) - version(a) || (/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0));
      session.set(FOUND_KEY, found);
      return found.length;
    }catch{ session.set(FOUND_KEY, []); return 0; }
  })();
  return discovery;
}

// Spaces requests out so a burst doesn't trip the per-minute free limit; slower for a model that already did.
const GAP_MS = 2000, SLOW_GAP_MS = 7000;
let lastStart = 0;
async function pace(model){
  const gap = session.get(SLOW_KEY, []).includes(model) ? SLOW_GAP_MS : GAP_MS;
  const ms = lastStart + gap - Date.now();
  if(ms > 0) await wait(ms);
  lastStart = Date.now();
}
let lastModel = null;
// The model that answered the most recent successful call.
export const usedModel = () => lastModel;

// One request at a time: calls queue behind each other and never overlap.
let chain = Promise.resolve();
function serial(fn){
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function request(path, init, key = getKey()){
  let res;
  try{
    res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(init && init.headers) } });
  }catch(e){ throw new GeminiError(0, 'Couldn\'t reach Google. Check your internet connection.'); }
  if(!res.ok){
    let msg = `Google returned an error (${res.status}).`, raw = '';
    try{ raw = await res.text(); const b = JSON.parse(raw); const e = Array.isArray(b) ? b[0]?.error : b.error; if(e?.message) msg = e.message; }catch{}
    throw Object.assign(new GeminiError(res.status, msg), { raw });
  }
  return res.json();
}

// Tiny request to check a key works before saving it.
export async function testKey(key){
  try{ await request('/models', { method: 'GET' }, key.trim()); return true; }catch{ return false; }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const OVERLOAD_WAITS = [2000, 5000];   // retries on the same model before moving on
const RATE_WAIT = 10000, MAX_RATE_WAIT = 30000;

// Tries each model in turn, pacing requests so bursts don't trip per-minute limits.
// Overloaded: retry with backoff, then next model. Per-minute limit: wait (Google's suggested delay
// if it gives one) and retry once, then next model, and pace that model more slowly afterwards.
// Daily limit used up: skip that model until the daily reset. Missing model: skip it for the session.
// When the configured models run out, adds backup models found on the student's key, once per session.
// Key problems and other errors stop at once. `onStatus` gets RETRYING while waiting, then null.
// `patient: false` tries each model once with no waiting (for calls that are optional).
export function chat({ messages, temperature = 0.4, maxTokens = 2048, json = false, onStatus, patient = true }){
  return serial(async () => {
    const tried = new Set();
    let busy = false, daily = false, discovered = false;
    for(;;){
      const model = modelOrder().find(m => !tried.has(m));
      if(!model){
        if(!discovered){ discovered = true; if(await discoverModels()) continue; }
        break;
      }
      tried.add(model);
      let overloads = 0, rateLimits = 0;
      for(;;){
        try{
          await pace(model);
          const body = { model, messages, temperature, max_tokens: maxTokens };
          if(json) body.response_format = { type: 'json_object' };
          const data = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
          onStatus && onStatus(null);
          lastModel = model;
          session.set(OK_KEY, model);
          return String(data?.choices?.[0]?.message?.content || '').trim();
        }catch(e){
          if(!(e instanceof GeminiError) || e.isAuth || e.status === 0) throw e;
          if(e.isDailyLimit){
            daily = true; markDaily(model);
            break;
          }else if(e.isRateLimit){
            busy = true; addTo(SLOW_KEY, model);
            const delay = e.retryAfterMs ?? RATE_WAIT;
            if(!patient || rateLimits++ >= 1 || delay > MAX_RATE_WAIT) break;
            onStatus && onStatus(RETRYING);
            await wait(delay);
          }else if(e.isOverloaded){
            busy = true;
            if(!patient || overloads >= OVERLOAD_WAITS.length) break;
            onStatus && onStatus(RETRYING);
            await wait(OVERLOAD_WAITS[overloads++]);
          }else if(e.isGone){
            addTo(DEAD_KEY, model);
            break;
          }else throw e;
        }
      }
      if((busy || daily) && patient) onStatus && onStatus(RETRYING);
    }
    onStatus && onStatus(null);
    // Models skipped because their daily limit ran out earlier today count as a daily-limit stop too.
    if(!busy && !daily && dailyExhausted().size) daily = true;
    if(busy) throw Object.assign(new GeminiError(503, BUSY), { allBusy: true });
    if(daily) throw Object.assign(new GeminiError(429, dailyLimitMessage()), { dailyLimit: true });
    throw new GeminiError(404, `None of the configured AI models are available (${MODELS.join(', ')}). Ask the committee to update NEXT_PUBLIC_GEMINI_MODELS.`);
  });
}

// Strips code fences and pulls out the first balanced {...} object.
export function parseJSON(text){
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  try{ return JSON.parse(t); }catch{}
  const start = t.indexOf('{');
  if(start < 0) return null;
  let depth = 0, inStr = false, escaped = false;
  for(let i = start; i < t.length; i++){
    const c = t[i];
    if(inStr){
      if(escaped) escaped = false;
      else if(c === '\\') escaped = true;
      else if(c === '"') inStr = false;
    }else if(c === '"') inStr = true;
    else if(c === '{') depth++;
    else if(c === '}' && --depth === 0){ try{ return JSON.parse(t.slice(start, i + 1)); }catch{ return null; } }
  }
  return null;
}

// JSON call with one retry if the reply can't be parsed.
export async function chatJSON(args){
  for(let i = 0; i < 2; i++){
    const o = parseJSON(await chat({ ...args, json: true }));
    if(o && typeof o === 'object') return o;
  }
  throw new Error('The AI returned an answer that couldn\'t be read.');
}
