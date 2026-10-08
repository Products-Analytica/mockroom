// Runs the interview room in the student's browser: Gemini (with the student's own key) for
// questions and scoring, the browser's speechSynthesis for the interviewer's voice, and the
// browser's speech recognition for answers. It drives the static markup in app/interview/page.js by element id.
import { loadScript } from './loader';
import { DIMS } from './format';
import { chat, chatJSON, usedModel, BUSY } from './gemini';
import { questionsPrompt, followupPrompt, evalPrompt, summaryPrompt } from './prompts';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

const INTERVIEWERS = {
  priya: { name: 'Priya', title: 'Hiring Manager', pref: /(neerja|heera|aria|jenny|samantha|zira|female)/i },
  arjun: { name: 'Arjun', title: 'Hiring Manager', pref: /(prabhat|ravi|guy|daniel|david|\bmale)/i }
};
const ACKS = ['Okay, thank you.', 'Got it.', 'Alright, thanks.', 'Right, that helps.', 'Okay.', 'Thanks for that.'];
const FU_LEADS = ['I see.', 'Okay.', 'Right.', 'Hmm, okay.'];
const TRANSITIONS = {
  'Resume': 'Let me ask you about your resume.', 'Role fit': 'Let\'s talk about this role.',
  'Technical/Domain': 'Now something a bit more technical.', 'Behavioral': 'Next, something about how you work with people.',
  'Situational': 'Let me give you a situation.'
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = v => Math.max(1, Math.min(5, Math.round(+v || 1)));

/* =========================================================================== */
export function mountInterview({ resume = '', jd = '', onStart, onComplete, onKeyRejected }){
  const $ = id => document.getElementById(id);
  let alive = true;
  const state = { session: null, idx: 0, timer: null, t0: 0, busy: false };
  const audio = { ctx: null, micAn: null, micStream: null, synthSpeaking: false };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ears = { on: false, rec: null, committed: '', sess: '', firstAt: 0, lastAt: 0, startedAt: 0, watchdog: null, nudged: false, paused: false, onDone: null };

  function show(id){
    ['setup', 'interview', 'evaluating'].forEach(s => $(s).classList.toggle('hidden', s !== id));
    document.body.classList.toggle('in-room', id !== 'setup');
    window.scrollTo(0, 0);
  }

  // Shows an AI error with a Retry button that re-runs `retry`. A rejected key goes to Settings.
  function showError(el, e, retry){
    if(!alive) return;
    if(e && e.isAuth){ onKeyRejected && onKeyRejected(); return; }
    const msg = e && e.allBusy ? BUSY
      : e && (e.status === 0 || e.status === 404) ? e.message
      : `Something went wrong talking to the AI. ${(e && e.message) || ''}`;
    $(el).innerHTML = `${esc(msg)} <button class="retry">Retry</button>`;
    $(el).querySelector('.retry').onclick = () => { $(el).textContent = ''; retry(); };
  }
  // Counts seconds next to a status line while a request is in flight. `status` swaps in a
  // calm note (such as "The AI is busy, retrying…") while the wrapper waits to retry.
  function ticker(el, label){
    const t0 = Date.now();
    let note = null;
    const draw = () => { if(alive) $(el).textContent = note || `${label} ${Math.round((Date.now() - t0) / 1000)}s`; };
    $(el).textContent = label;
    const h = setInterval(draw, 1000);
    return { stop: () => clearInterval(h), status: t => { note = t; draw(); } };
  }
  // Notes which model answered, so the report records the model(s) actually used.
  const noteModel = () => { const m = usedModel(); if(m && state.session) state.session.models.add(m); };

  /* ---------- voice out ---------- */
  function browserSay(text){
    return new Promise(res => {
      if(!('speechSynthesis' in window)) return res();
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      const pref = state.session.iv.pref;
      u.voice = voices.find(v => /en-IN/i.test(v.lang) && pref.test(v.name))
        || voices.find(v => /natural|online/i.test(v.name) && pref.test(v.name))
        || voices.find(v => pref.test(v.name)) || voices.find(v => /natural|google/i.test(v.name)) || voices[0] || null;
      u.rate = 0.98; u.onend = res; u.onerror = res;
      audio.synthSpeaking = true;
      speechSynthesis.speak(u);
    }).finally(() => { audio.synthSpeaking = false; });
  }
  async function say(parts){
    parts = (Array.isArray(parts) ? parts : [parts]).filter(Boolean);
    if(!state.session.voice || !parts.length) return;
    for(const p of parts){
      if(state.session.stopped || !alive) return;
      setRoom('speaking'); await browserSay(p);
    }
  }

  /* ---------- voice in ---------- */
  function listen(){
    return new Promise(resolve => {
      Object.assign(ears, { on: true, committed: '', sess: '', firstAt: 0, lastAt: 0, startedAt: Date.now(), nudged: false, onDone: resolve });
      setRoom('listening'); renderLive();
      startRec();
      const limit = +$('silence').value;
      ears.watchdog = setInterval(async () => {
        if(!ears.on || state.busy) return;
        const now = Date.now();
        if(limit && ears.lastAt && now - ears.lastAt > limit) return finishListening();
        if(!ears.firstAt && !ears.nudged && now - ears.startedAt > 25000){
          ears.nudged = true; pauseRec();
          await say(pick(['Take your time.', 'No rush, take a moment.']));
          if(ears.on){ setRoom('listening'); startRec(); }
        }
      }, 400);
    });
  }
  function startRec(){
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN';
    rec.onresult = e => {
      let t = ''; for(let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      ears.sess = t; const now = Date.now(); if(!ears.firstAt) ears.firstAt = now; ears.lastAt = now;
      renderLive();
    };
    rec.onerror = e => {
      if(e.error === 'not-allowed' || e.error === 'service-not-allowed') switchToTyping('Microphone access was blocked, so you can type your answers instead.');
    };
    rec.onend = () => {
      ears.committed = (ears.committed + ' ' + ears.sess).trim(); ears.sess = '';
      if(ears.on && ears.rec === rec && !ears.paused) try{ startRec(); }catch(e){}
    };
    ears.rec = rec; ears.paused = false;
    try{ rec.start(); }catch(e){}
  }
  function pauseRec(){ ears.paused = true; if(ears.rec) try{ ears.rec.stop(); }catch(e){} }
  const heard = () => (ears.committed + ' ' + ears.sess).trim();
  function renderLive(){
    const t = heard();
    $('live').innerHTML = state.session && state.session.voice && !state.session.typing
      ? `<span class="tag">What the interviewer hears</span>${t ? esc(t) : '…'}` : '';
  }
  async function finishListening(){
    if(!ears.on) return;
    ears.on = false; clearInterval(ears.watchdog); pauseRec();
    await sleep(500);
    const text = heard();
    const span = ears.firstAt && ears.lastAt > ears.firstAt ? (ears.lastAt - ears.firstAt) / 1000 : 0;
    const cb = ears.onDone; ears.onDone = null;
    cb && cb({ text, speakSeconds: span });
  }
  function stopListening(){
    ears.on = false; clearInterval(ears.watchdog); pauseRec();
    const cb = ears.onDone; ears.onDone = null; cb && cb(null);
  }
  function switchToTyping(msg){
    if(!state.session) return;
    state.session.typing = true;
    stopListening();
    $('ans').classList.remove('hidden'); $('ans').focus();
    $('live').textContent = msg || '';
    $('done').textContent = 'Submit answer';
    setRoom('listening');
  }

  /* ---------- audio graph + orb ---------- */
  async function setupAudio(){
    audio.ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if(audio.ctx.state === 'suspended') await audio.ctx.resume();
    if(state.session.voice && !state.session.typing && !audio.micStream){
      try{
        audio.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audio.micAn = audio.ctx.createAnalyser(); audio.micAn.fftSize = 512;
        audio.ctx.createMediaStreamSource(audio.micStream).connect(audio.micAn);
      }catch(e){ switchToTyping('Microphone access was blocked, so you can type your answers instead. Allow the microphone in the address bar to speak next time.'); }
    }
  }
  function stopMic(){ if(audio.micStream){ audio.micStream.getTracks().forEach(t => t.stop()); audio.micStream = null; audio.micAn = null; } }
  let roomMode = 'idle';
  function setRoom(m){
    if(!alive) return;
    roomMode = m;
    const labels = { speaking: 'Speaking', listening: state.session && state.session.typing ? 'Waiting for your answer' : 'Listening', thinking: 'Thinking', idle: '' };
    $('roomState').textContent = labels[m] || '';
    $('orb').classList.toggle('listening', m === 'listening');
    $('orb').classList.toggle('thinking', m === 'thinking');
  }
  const lvlBuf = new Uint8Array(512);
  let smooth = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function orbLoop(){
    if(!alive) return;
    let lvl = 0;
    const an = roomMode === 'listening' ? audio.micAn : null;
    if(an){
      an.getByteTimeDomainData(lvlBuf);
      let sum = 0; for(let i = 0; i < lvlBuf.length; i++){ const x = (lvlBuf[i] - 128) / 128; sum += x * x; }
      lvl = Math.min(1, Math.sqrt(sum / lvlBuf.length) * 5);
    }
    if(roomMode === 'speaking' && audio.synthSpeaking) lvl = 0.35 + 0.25 * Math.abs(Math.sin(Date.now() / 140));
    smooth = smooth * 0.75 + lvl * 0.25;
    const orb = $('orb');
    if(orb){
      orb.style.transform = reduceMotion ? '' : `scale(${1 + smooth * 0.22})`;
      orb.style.boxShadow = `0 0 ${20 + smooth * 70}px ${smooth * 18}px rgba(184,144,47,${0.08 + smooth * 0.35})`;
    }
    requestAnimationFrame(orbLoop);
  }
  requestAnimationFrame(orbLoop);

  /* ---------- resume upload ---------- */
  async function readResume(e){
    const f = e.target.files[0]; if(!f) return;
    $('setupErr').textContent = '';
    try{
      let text = '';
      if(/\.pdf$/i.test(f.name)){
        await loadScript(PDFJS);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
        for(let p = 1; p <= pdf.numPages; p++){ const c = await (await pdf.getPage(p)).getTextContent(); text += c.items.map(i => i.str).join(' ') + '\n'; }
      }else if(/\.docx$/i.test(f.name)){
        await loadScript(MAMMOTH);
        text = (await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      }else{ text = await f.text(); }
      text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if(!text) throw new Error('empty');
      $('resume').value = text;
    }catch(err){ $('setupErr').textContent = 'Couldn\'t read text from that file. If it\'s a scanned PDF, paste the resume text instead.'; }
  }

  /* ---------- start ---------- */
  async function start(){
    const jdText = $('jd').value.trim(), resumeText = $('resume').value.trim();
    $('setupErr').textContent = '';
    if(jdText.length < 80 || resumeText.length < 80){ $('setupErr').textContent = 'Add both the job description and your resume (a few lines at least).'; return; }
    const voice = $('mode').value === 'voice';
    if(voice && !SR && !window.confirm('This browser can\'t listen to spoken answers. The interviewer will still speak, but you\'ll type your answers. Continue?')) return;
    onStart && onStart({ jd: jdText, resume: resumeText });
    const n = +$('count').value;
    $('start').disabled = true; $('genWorking').classList.remove('hidden');
    const tick = ticker('genText', 'Your interviewer is reading your resume…');
    try{
      audio.ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();   // unlock audio inside the click
      const plan = await chatJSON({
        messages: questionsPrompt({ n, focus: $('focus').value, difficulty: $('diff').value, jd: jdText, resume: resumeText }),
        temperature: 0.7, maxTokens: 8192, onStatus: tick.status
      });
      const planModel = usedModel();
      const qs = (plan.questions || []).filter(q => q && q.question).slice(0, n);
      if(!qs.length) throw new Error('No questions came back.');
      if(!alive) return;
      state.session = {
        models: new Set(planModel ? [planModel] : []),
        role: plan.role_title || 'this role', reqs: plan.key_requirements || [],
        focus: $('focus').value, difficulty: $('diff').value,
        voice, typing: !voice || !SR, showQ: !voice || $('showQ').value === 'on',
        followups: $('followups').value === 'on', iv: INTERVIEWERS[$('interviewer').value],
        queue: qs.map(q => ({ ...q, followup: false })), items: [], stopped: false, closed: false
      };
      state.idx = 0;
      await openRoom();
    }catch(e){ showError('setupErr', e, start); }
    finally{ tick.stop(); if(alive){ $('start').disabled = false; $('genWorking').classList.add('hidden'); $('genText').textContent = 'Preparing your interview…'; } }
  }

  async function openRoom(){
    const s = state.session;
    $('ivName').textContent = s.iv.name; $('ivTitle').textContent = s.iv.title; $('initial').textContent = s.iv.name[0];
    $('ans').classList.toggle('hidden', !s.typing); $('ans').value = '';
    $('done').textContent = s.typing ? 'Submit answer' : 'I\'m done answering';
    $('repeat').classList.toggle('hidden', !s.voice);
    $('qText').textContent = ''; $('live').textContent = '';
    show('interview');
    await setupAudio();
    const greeting = [
      `Hi, I'm ${s.iv.name}. Thanks for making the time today.`,
      `We'll go through about ${s.queue.length} questions for the ${s.role} role. Feel free to take a moment before you answer.`,
      'Let\'s get started.'
    ];
    await say(greeting);
    await sleep(400);
    turn([]);
  }

  /* ---------- turns ---------- */
  function updateMeta(){
    const s = state.session, q = s.queue[state.idx];
    const main = s.queue.filter(x => !x.followup).length;
    const doneMain = s.queue.slice(0, state.idx + 1).filter(x => !x.followup).length;
    $('prog').style.width = (doneMain / main * 100) + '%';
    $('qMeta').textContent = q.followup ? `Question ${doneMain} of ${main} - follow-up` : `Question ${doneMain} of ${main} - ${q.category}`;
  }
  function startTimer(){
    clearInterval(state.timer); state.t0 = Date.now();
    state.timer = setInterval(() => { const t = Math.floor((Date.now() - state.t0) / 1000); if(alive) $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }, 1000);
  }
  function setBusy(b){ state.busy = b; ['done', 'repeat', 'skip'].forEach(id => { if($(id)) $(id).disabled = b; }); }

  async function turn(lead){
    const s = state.session, q = s.queue[state.idx];
    if(s.stopped || !alive) return;
    updateMeta(); setBusy(true);
    $('qText').classList.remove('dim');
    $('qText').textContent = s.showQ ? q.question : '';
    $('live').textContent = ''; $('ans').value = '';
    await say([...lead, q.question]);
    if(s.stopped || !alive) return;
    if(!s.showQ && s.voice){ $('qText').classList.add('dim'); $('qText').textContent = 'Listen, then answer out loud.'; }
    setBusy(false); startTimer();
    if(s.typing){ setRoom('listening'); $('ans').focus(); return; }
    const res = await listen();
    if(res) record(res.text, false, res.speakSeconds);
  }

  async function record(answer, skipped, speakSeconds = 0){
    const s = state.session, q = s.queue[state.idx];
    if(!skipped && !answer.trim()){ if(s.typing) $('ans').focus(); else turn(['Sorry, I didn\'t catch that. Let me ask again.']); return; }
    clearInterval(state.timer);
    s.items.push({ ...q, answer, skipped, seconds: Math.round((Date.now() - state.t0) / 1000), speakSeconds, spoken: !s.typing });
    setBusy(true);
    if(!skipped && s.followups && !q.followup && answer.split(/\s+/).length > 8){
      setRoom('thinking');
      try{
        // Not patient: one quick try per model, so a busy AI never stalls the room.
        const fu = await chat({ messages: followupPrompt({ role: s.role, question: q.question, answer }), temperature: 0.6, maxTokens: 2048, patient: false });
        noteModel();
        const text = fu.replace(/^["'\s]+|["'\s]+$/g, '');
        if(text.length > 8) s.queue.splice(state.idx + 1, 0, { category: q.category, question: text, looks_for: 'Specific, honest detail that backs up the previous answer.', followup: true });
      }catch(e){}   // A missed follow-up shouldn't interrupt the room; just move on.
    }
    state.idx++;
    const next = s.queue[state.idx];
    if(!next || s.stopped) return closeRoom();
    const lead = [];
    if(skipped) lead.push('No problem, let\'s move on.');
    else if(next.followup) lead.push(pick(FU_LEADS));
    else lead.push(pick(ACKS));
    if(!next.followup){
      const remainingMain = s.queue.slice(state.idx).filter(x => !x.followup).length;
      const prev = [...s.queue.slice(0, state.idx)].reverse().find(x => !x.followup);
      if(remainingMain === 1) lead.push('One last question.');
      else if(prev && next.category !== prev.category && TRANSITIONS[next.category]) lead.push(TRANSITIONS[next.category]);
    }
    turn(lead);
  }

  async function closeRoom(){
    const s = state.session;
    if(s.closed) return; s.closed = true;
    stopListening(); clearInterval(state.timer); setBusy(true);
    if(s.voice && !s.stopped){
      $('qText').textContent = ''; $('live').textContent = '';
      await say(['That\'s all from my side. Thank you, it was good talking to you.', 'Give me a moment to put your feedback together.']);
    }
    setRoom('idle');
    evaluate();
  }

  /* ---------- scoring ---------- */
  // Scores one answer at a time. Finished scores are kept on the session, so Retry
  // carries on from the answer that failed rather than starting over.
  async function evaluate(){
    const s = state.session;
    stopMic();
    if(!alive) return;
    if(!s.items.length){ show('setup'); return; }
    show('evaluating'); $('evalErr').textContent = '';
    let tick = { stop(){} };
    try{
      for(let i = 0; i < s.items.length; i++){
        const it = s.items[i];
        $('evalProg').style.width = (i / (s.items.length + 1) * 100) + '%';
        if(it.eval) continue;
        if(it.skipped){ it.eval = { scores: Object.fromEntries(DIMS.map(d => [d, 0])), strengths: [], improvements: ['Skipped. Prepare an answer for this one.'], better_answer: '' }; it.score = 0; continue; }
        tick = ticker('evalText', `Scoring answer ${i + 1} of ${s.items.length}…`);
        const e = await chatJSON({ messages: evalPrompt({ role: s.role, reqs: s.reqs, item: it }), temperature: 0.2, maxTokens: 4096, onStatus: tick.status });
        tick.stop(); noteModel();
        e.scores = Object.fromEntries(DIMS.map(d => [d, clamp(e.scores && e.scores[d])]));
        e.strengths = (e.strengths || []).slice(0, 2); e.improvements = (e.improvements || []).slice(0, 3);
        it.eval = e;
        it.score = Math.round(DIMS.reduce((a, d) => a + e.scores[d], 0) / DIMS.length * 20);
      }
      s.score = Math.round(s.items.reduce((a, it) => a + it.score, 0) / s.items.length);
      $('evalProg').style.width = (s.items.length / (s.items.length + 1) * 100) + '%';
      if(!s.summary){
        tick = ticker('evalText', 'Writing your debrief…');
        s.summary = await chatJSON({ messages: summaryPrompt({ role: s.role, score: s.score, items: s.items }), temperature: 0.4, maxTokens: 4096, onStatus: tick.status });
        tick.stop(); noteModel();
      }
      $('evalProg').style.width = '100%';
      $('evalText').textContent = 'Saving your report…';
      s.model = [...s.models].join(', ');
      await onComplete(s);
    }catch(e){
      tick.stop();
      showError('evalErr', e, evaluate);
    }
  }

  /* ---------- wiring ---------- */
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  $('jd').value = jd; $('resume').value = resume;
  on('resumeFile', 'change', readResume);
  on('mode', 'change', () => { $('voiceOpts').classList.toggle('hidden', $('mode').value !== 'voice'); });
  on('start', 'click', start);
  on('done', 'click', () => {
    const s = state.session; if(!s || state.busy) return;
    if(s.typing){ record($('ans').value.trim(), false); return; }
    finishListening();
  });
  on('skip', 'click', () => { if(!state.session || state.busy) return; stopListening(); record('', true); });
  on('repeat', 'click', async () => {
    const s = state.session; if(!s || state.busy) return;
    stopListening(); setBusy(true);
    await say(['Sure.', s.queue[state.idx].question]);
    setBusy(false);
    if(s.typing){ setRoom('listening'); return; }
    const res = await listen();
    if(res) record(res.text, false, res.speakSeconds);
  });
  on('endEarly', 'click', () => {
    const s = state.session; if(!s) return;
    const partial = !state.busy ? (s.typing ? $('ans').value.trim() : heard()) : '';
    stopListening();
    if(partial) s.items.push({ ...s.queue[state.idx], answer: partial, skipped: false, seconds: Math.round((Date.now() - state.t0) / 1000), spoken: !s.typing });
    s.stopped = true;
    if('speechSynthesis' in window) speechSynthesis.cancel();
    closeRoom();
  });
  const onKey = e => {
    if($('interview').classList.contains('hidden') || state.busy) return;
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('done').click();
  };
  document.addEventListener('keydown', onKey);
  if('speechSynthesis' in window) speechSynthesis.getVoices();   // voices load lazily in Chrome

  return function destroy(){
    alive = false;
    if(state.session) state.session.stopped = true;
    ears.on = false; clearInterval(ears.watchdog); pauseRec();
    clearInterval(state.timer);
    stopMic();
    if('speechSynthesis' in window) speechSynthesis.cancel();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('in-room');
  };
}
