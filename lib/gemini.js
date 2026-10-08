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
}

// Remembered for this browser session: the model that last answered, and models that don't exist.
const OK_KEY = 'mr:model-ok', DEAD_KEY = 'mr:models-dead';
const session = {
  get(k, d){ try{ const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ sessionStorage.setItem(k, JSON.stringify(v)); }catch{} }
};
function modelOrder(){
  const dead = new Set(session.get(DEAD_KEY, []));
  const ok = session.get(OK_KEY, null);
  const live = MODELS.filter(m => !dead.has(m));
  return ok && live.includes(ok) ? [ok, ...live.filter(m => m !== ok)] : live;
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
    let msg = `Google returned an error (${res.status}).`;
    try{ const b = await res.json(); const e = Array.isArray(b) ? b[0]?.error : b.error; if(e?.message) msg = e.message; }catch{}
    throw new GeminiError(res.status, msg);
  }
  return res.json();
}

// Tiny request to check a key works before saving it.
export async function testKey(key){
  try{ await request('/models', { method: 'GET' }, key.trim()); return true; }catch{ return false; }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const OVERLOAD_WAITS = [2000, 5000];   // retries on the same model before moving on
const RATE_WAIT = 10000;

// Tries each model in turn. Overloaded: retry with backoff, then next model. Rate-limited:
// wait once, then next model. Missing model: skip it for the rest of the session.
// Key problems and other errors stop at once. `onStatus` gets RETRYING while waiting, then null.
// `patient: false` tries each model once with no waiting (for calls that are optional).
export function chat({ messages, temperature = 0.4, maxTokens = 2048, json = false, onStatus, patient = true }){
  return serial(async () => {
    const order = modelOrder();
    let busy = false;
    for(const model of order){
      let overloads = 0, rateLimits = 0;
      for(;;){
        try{
          const body = { model, messages, temperature, max_tokens: maxTokens };
          if(json) body.response_format = { type: 'json_object' };
          const data = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
          onStatus && onStatus(null);
          lastModel = model;
          session.set(OK_KEY, model);
          return String(data?.choices?.[0]?.message?.content || '').trim();
        }catch(e){
          if(!(e instanceof GeminiError) || e.isAuth || e.status === 0) throw e;
          if(e.isRateLimit){
            busy = true;
            if(!patient || rateLimits++ >= 1) break;
            onStatus && onStatus(RETRYING);
            await wait(RATE_WAIT);
          }else if(e.isOverloaded){
            busy = true;
            if(!patient || overloads >= OVERLOAD_WAITS.length) break;
            onStatus && onStatus(RETRYING);
            await wait(OVERLOAD_WAITS[overloads++]);
          }else if(e.isGone){
            session.set(DEAD_KEY, [...new Set([...session.get(DEAD_KEY, []), model])]);
            break;
          }else throw e;
        }
      }
      if(busy && patient) onStatus && onStatus(RETRYING);
    }
    onStatus && onStatus(null);
    if(busy) throw Object.assign(new GeminiError(503, BUSY), { allBusy: true });
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
