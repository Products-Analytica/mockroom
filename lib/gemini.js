// Calls Google's Gemini API straight from the browser with the student's own key.
// The key lives only in this browser's localStorage and is sent only to Google.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const KEY = 'mr:gemini-key';
export const MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';

export function getKey(){ try{ return localStorage.getItem(KEY) || ''; }catch{ return ''; } }
export function setKey(k){ localStorage.setItem(KEY, k.trim()); }
export function clearKey(){ try{ localStorage.removeItem(KEY); }catch{} }
export const maskKey = k => k ? `${k.slice(0, 4)}${'•'.repeat(8)}${k.slice(-4)}` : '';

export class GeminiError extends Error{
  constructor(status, message){ super(message); this.status = status; }
  // Google answers a bad key with 400 "API key not valid", as well as 401/403.
  get isAuth(){ return this.status === 401 || this.status === 403 || (this.status === 400 && /api.?key/i.test(this.message)); }
  get isRateLimit(){ return this.status === 429; }
}

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

export function chat({ messages, temperature = 0.4, maxTokens = 2048, json = false }){
  return serial(async () => {
    const body = { model: MODEL, messages, temperature, max_tokens: maxTokens };
    if(json) body.response_format = { type: 'json_object' };
    const data = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
    return String(data?.choices?.[0]?.message?.content || '').trim();
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
