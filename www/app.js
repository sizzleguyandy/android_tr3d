/* ════════════════════════════════════════════════════════════
   VIRGIN RACE — App Engine
   Full onboarding + Today / Calendar / Coach / Stats screens
   ════════════════════════════════════════════════════════════ */

/* ── CONFIG ─────────────────────────────────────────────────── */
const CFG = {
  // ⚠ UPDATE THIS to your server address before demoing
  API: 'http://192.168.5.108:8000',

  BRAND: {
    name:    'Virgin Active',
    tab:     'Virgin Race',
    primary: '#E31837',
  },
};

/* ── RACE PRESETS (mirrors race_presets_sa.py) ───────────────── */
const RACES = [
  { id:'comrades_marathon',             name:'Comrades Marathon',          emoji:'🇿🇦', date:'2026-06-14', dist:'ultra_90', distKm:87.6,   hilliness:'high',   hillFactor:0.20  },
  { id:'two_oceans_marathon',           name:'Two Oceans Marathon',        emoji:'🌊', date:'2026-04-11', dist:'ultra_56', distKm:56.0,   hilliness:'medium', hillFactor:0.08  },
  { id:'cape_town_marathon',            name:'Sanlam Cape Town Marathon',  emoji:'🏔️', date:'2026-05-24', dist:'marathon', distKm:42.195, hilliness:'medium', hillFactor:0.05  },
  { id:'soweto_marathon',               name:'African Bank Soweto Marathon',emoji:'✊', date:'2026-11-29', dist:'marathon', distKm:42.195, hilliness:'low',    hillFactor:0.07  },
  { id:'durban_international_marathon', name:'Durban International Marathon',emoji:'🏖️',date:'2026-05-03', dist:'marathon', distKm:42.195, hilliness:'low',    hillFactor:0.02  },
  { id:'knysna_forest_marathon',        name:'Knysna Forest Marathon',     emoji:'🌲', date:'2026-07-04', dist:'marathon', distKm:42.195, hilliness:'medium', hillFactor:0.08  },
  { id:'__custom__',                    name:'Other race',                 emoji:'📍', date:null,          dist:null,       distKm:null,   hilliness:'low',    hillFactor:0.045 },
];

/* ── REVEAL IMAGES (www/img/) ────────────────────────────────── */
const RACE_IMAGES = {
  comrades_marathon:             'img/marathon_finish.jpg',
  two_oceans_marathon:           'img/marathon_finish.jpg',
  cape_town_marathon:            'img/marathon_finish.jpg',
  soweto_marathon:               'img/marathon_finish.jpg',
  durban_international_marathon: 'img/marathon_finish.jpg',
  knysna_forest_marathon:        'img/marathon_finish.jpg',
  __default__:                   'img/marathon_finish.jpg',
};

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_LABELS = ['M','T','W','T','F','S','S'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];


/* ── STATE ──────────────────────────────────────────────────── */
const S = {
  athleteId:   localStorage.getItem('vr_athlete_id') || null,
  athlete:     null,
  week:        null,
  logSummary:  null,

  activeTab:    'race',
  subTab:       'schedule',

  calendar: {
    year:  new Date().getFullYear(),
    month: new Date().getMonth(),
    weeksCache: {},
    selected: null,
  },

  coach: {
    messages: [],
    busy: false,
  },

  paces: null,   // cached from /athlete/{id}/paces

  onb: {
    step: 0,
    data: {},
    totalSteps: 0,  // computed dynamically in ONB.render()
  },
};

/* ── API LAYER ──────────────────────────────────────────────── */
async function apiFetch(path, opts = {}) {
  const url  = CFG.API + path;
  const res  = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

const API = {
  getAthlete:      id  => apiFetch(`/athlete/${id}`),
  getCurrentWeek:  id  => apiFetch(`/plan/${id}/current`),
  getWeek:         (id, n) => apiFetch(`/plan/${id}/week/${n}`),
  getLogSummary:   (id, wn) => apiFetch(`/log/${id}/week/${wn}/summary`),
  getAnchors:      id  => apiFetch(`/athlete/${id}/anchors`),
  computeVDOT:     (distKm, timeMins) => apiFetch(`/mobile/vdot?distance_km=${distKm}&time_minutes=${timeMins}`),
  createAthlete:   body => apiFetch('/athlete/', { method:'POST', body: JSON.stringify(body) }),
  createC25K:      body => apiFetch('/athlete/c25k', { method:'POST', body: JSON.stringify(body) }),
  saveAnchors:     (id, anchors) => apiFetch(`/athlete/${id}/anchors`, { method:'PATCH', body: JSON.stringify({ anchors }) }),
  coachChat:       (athleteId, question) => apiFetch('/mobile/coach', { method:'POST', body: JSON.stringify({ athlete_id: athleteId, question }) }),
  getAthleteByCode: code => apiFetch(`/mobile/athlete/by-code/${encodeURIComponent(code.trim().toUpperCase())}`),
  logRun:           body => apiFetch('/log/run', { method:'POST', body: JSON.stringify(body) }),
};

/* ── UTILS ──────────────────────────────────────────────────── */
function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function fmtTime(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2,'0')}`;
}

/* ── UTC date helpers (no timezone drift) ───────────────────── */
function toUTCDateString(date) {
  if (!(date instanceof Date)) date = new Date(date);
  return date.toISOString().split('T')[0];
}
function utcDateFromISO(iso) {
  return new Date(iso + 'T00:00:00Z');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = utcDateFromISO(iso);
  return d.toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' });
}

function daysUntil(iso) {
  if (!iso) return null;
  const diff = new Date(iso + 'T00:00:00') - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
}

/* Return the ISO date of the Saturday N weeks from now (min 1 week out) */
function saturdayInNWeeks(n = 8) {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
  const daysToSat = (6 - dayOfWeek + 7) % 7 || 7; // at least next Saturday
  d.setDate(d.getDate() + daysToSat + (n - 1) * 7);
  return d.toISOString().slice(0, 10);
}

function sessionColor(name) {
  if (!name || name === 'Rest' || name.includes('Rest') || name.includes('Cross')) return 'rest';
  if (name.includes('Long') || name.includes('Back-to-Back')) return 'long';
  if (name.includes('Interval') || name.includes('Threshold') || name.includes('Tempo') ||
      name.includes('Hill') || name.includes('Repetition') || name.includes('R-Pace') ||
      name.includes('Stride') || name.includes('Cruise')) return 'quality';
  return 'easy';
}

function todayISO() {
  return toUTCDateString(new Date());
}

function dateToWeekNum(startISO, targetDate) {
  const start  = utcDateFromISO(startISO);
  const target = utcDateFromISO(toUTCDateString(targetDate));
  const diff   = (target - start) / 86400000;
  if (diff < 0) return null;
  return Math.floor(diff / 7) + 1;
}

function getDayKey(date) {
  // Local day — for today's session display
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
}
function getUTCDayKey(date) {
  // UTC day — for calendar grid loops that use Date.UTC dates
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getUTCDay()];
}

function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function showLoadingOverlay(msg = 'Building your plan…') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spinner"></div><div>${msg}</div>`;
}

function hideLoadingOverlay() {
  const el = document.getElementById('loading-overlay');
  if (el) el.remove();
}

/* ── SHELL ──────────────────────────────────────────────────── */
function renderHeader(title) {
  return `
    <div class="screen-header">
      <div class="va-wordmark">${CFG.BRAND.name}</div>
      <div class="screen-title">${title}</div>
    </div>`;
}

function renderSubTabs() {
  const tabs = [
    { id:'schedule', label:'Schedule' },
    { id:'coach',    label:'Coach'    },
    { id:'stats',    label:'Stats'    },
  ];
  return `
    <div class="sub-tabs">
      <div class="sub-tabs-pills">
        ${tabs.map(t => `
          <button class="sub-tab ${S.subTab === t.id ? 'active' : ''}"
                  onclick="App.subTab('${t.id}')">${t.label}</button>
        `).join('')}
      </div>
      <button class="log-add-btn" onclick="App.logRunQuick()" title="Log a run">＋</button>
    </div>`;
}

function renderRaceShell(content) {
  return `
    ${renderHeader('Virgin Race')}
    ${renderSubTabs()}
    <div class="spacer-16"></div>
    ${content}
    <div class="spacer-80"></div>`;
}

/* ── SA CITIES ───────────────────────────────────────────────── */
const SA_CITIES = [
  { name:'Johannesburg',   lat:-26.2041, lon:28.0473 },
  { name:'Cape Town',      lat:-33.9249, lon:18.4241 },
  { name:'Durban',         lat:-29.8587, lon:31.0218 },
  { name:'Pretoria',       lat:-25.7479, lon:28.2293 },
  { name:'Port Elizabeth', lat:-33.9608, lon:25.6022 },
  { name:'Bloemfontein',   lat:-29.0852, lon:26.1596 },
  { name:'East London',    lat:-33.0153, lon:27.9116 },
  { name:'George',         lat:-33.9631, lon:22.4617 },
  { name:'Nelspruit',      lat:-25.4753, lon:30.9694 },
  { name:'Polokwane',      lat:-23.9045, lon:29.4688 },
  { name:'Kimberley',      lat:-28.7282, lon:24.7499 },
  { name:'Rustenburg',     lat:-25.6675, lon:27.2423 },
];

/* ── ONBOARDING  (mirrors onboarding_v2.py exactly) ─────────────
   Full path:
     NAME → RACE → [custom: DIST→HILLS→DATE] →
     EXPERIENCE → [recent: DIST→TIME] | [beginner: ABILITY] | [vdot: INPUT] →
     WEEKLY_KM → LONGEST_RUN → PLAN_TYPE →
     LONG_RUN_DAY → QUALITY_DAY → EASY_DAY_1 → EASY_DAY_2 →
     ANCHOR_Q → [ANCHOR_DETAIL ×up to 2] →
     HR_SETUP → LOCATION → CONFIRM
   C25K path (couch / run5k_slow):
     NAME → RACE → EXPERIENCE → ABILITY → LOCATION → CONFIRM_C25K
   ─────────────────────────────────────────────────────────────── */

const ONB = {

  /* ── Dynamic step list ─────────────────────────────────────── */
  getSteps(data) {
    const isC25K   = !!data.isC25K;
    const exp      = data.experience;   // 'recent_race' | 'beginner' | 'know_vdot'
    const custom   = data.racePresetId === '__custom__';
    const wantMore = data.anchorWantsMore;

    const steps = [ONB.stepWelcome, ONB.stepName, ONB.stepRace];

    if (custom) {
      steps.push(ONB.stepCustomDist, ONB.stepCustomHills, ONB.stepCustomDate);
    }

    steps.push(ONB.stepExperience);

    if (exp === 'recent_race')  { steps.push(ONB.stepRecentDist, ONB.stepRecentTime); }
    else if (exp === 'beginner'){ steps.push(ONB.stepBeginnerAbility); }
    else if (exp === 'know_vdot'){ steps.push(ONB.stepVDOTInput); }

    if (isC25K) {
      steps.push(ONB.stepLocation, ONB.stepConfirmC25K);
      return steps;
    }

    steps.push(
      ONB.stepWeeklyKm, ONB.stepLongestRun, ONB.stepPlanType,
      ONB.stepLongRunDay, ONB.stepQualityDay,
      ONB.stepEasyDay1, ONB.stepEasyDay2,
      ONB.stepAnchorQ,
    );
    if ((data.anchors||[]).length < 2 && wantMore) {
      steps.push(ONB.stepAnchorDetail);
    }
    steps.push(ONB.stepHRSetup, ONB.stepLocation, ONB.stepConfirm);
    return steps;
  },

  render() {
    const { step, data } = S.onb;
    const steps = ONB.getSteps(data);
    S.onb.totalSteps = steps.length;
    const pct = Math.round((step / Math.max(steps.length - 1, 1)) * 100);
    const fn  = steps[step] || ONB.stepWelcome;
    document.getElementById('screen').innerHTML = fn(data, pct);
    document.getElementById('tab-bar').classList.add('hidden');
    ONB.attachListeners();
  },

  progress(pct) {
    return `<div class="onb-progress"><div class="onb-progress-fill" style="width:${pct}%"></div></div>`;
  },

  back(show = true) {
    if (!show || S.onb.step === 0) return '';
    return `<button class="onb-back" onclick="ONB.goBack()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>Back</button>`;
  },

  goBack() { if (S.onb.step > 0) { S.onb.step--; ONB.render(); } },

  goNext(extra = {}) {
    Object.assign(S.onb.data, extra);
    S.onb.step++;
    ONB.render();
  },

  setField(key, val) { S.onb.data[key] = val; },

  attachListeners() {
    const el = document.getElementById('onb-name');
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') ONB.submitName(); });
  },

  /* ── Welcome ────────────────────────────────────────────────── */
  stepWelcome() {
    return `
      <div class="splash">
        <div class="splash-logo-ring">🏆</div>
        <div class="splash-brand">${CFG.BRAND.name}</div>
        <h1 class="splash-title">Your Personal<br>Running Coach</h1>
        <p class="splash-sub">Race-specific plans built around your fitness, your race, and your schedule.</p>
        <button class="btn btn-red" onclick="ONB.goNext()" style="width:100%;max-width:320px">Get Started →</button>
        <button class="btn btn-ghost" onclick="ONB.showLinkScreen()" style="width:100%;max-width:320px;margin-top:12px">
          🔗 Link Telegram Account
        </button>
        <p class="splash-powered">Powered by TR3D · Daniels Running Formula</p>
      </div>`;
  },

  showLinkScreen() {
    document.getElementById('screen').innerHTML = `
      <div class="onb-screen">
        <button class="onb-back" onclick="ONB.render()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>Back</button>
        <div class="onb-icon">🔗</div>
        <h2 class="onb-q">Link your Telegram plan</h2>
        <p class="onb-hint">In Telegram type <strong>/mycode</strong> to get your code (e.g. ANDY-4821).</p>
        <div class="onb-body">
          <input id="link-code-input" class="field" type="text" placeholder="e.g. ANDY-4821"
                 autocomplete="off" autocapitalize="characters"
                 style="text-transform:uppercase;letter-spacing:2px;font-size:20px;text-align:center">
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitLinkCode()">Link Account →</button>
        </div>
      </div>`;
    document.getElementById('tab-bar').classList.add('hidden');
    const inp = document.getElementById('link-code-input');
    if (inp) inp.addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  },

  async submitLinkCode() {
    const code = document.getElementById('link-code-input')?.value.trim().toUpperCase();
    if (!code || code.length < 4) { toast('Please enter your link code'); return; }
    showLoadingOverlay('Linking your account…');
    try {
      const data = await API.getAthleteByCode(code);
      S.athleteId = data.telegram_id;
      localStorage.setItem('vr_athlete_id', data.telegram_id);
      hideLoadingOverlay();
      toast(`Welcome back, ${data.name}! 🎉`);
      await App.loadData();
      App.showRaceTab();
    } catch(e) {
      hideLoadingOverlay();
      toast('Code not found — check the code and try again');
    }
  },

  /* ── Name ───────────────────────────────────────────────────── */
  stepName(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back(false)}
        <div class="onb-icon">👋</div>
        <h2 class="onb-q">What's your name?</h2>
        <p class="onb-hint">We'll personalise your plan and coaching.</p>
        <div class="onb-body">
          <input id="onb-name" class="field" type="text" placeholder="Your first name"
                 autocomplete="off" value="${data.name||''}" autofocus>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitName()">Continue →</button>
        </div>
      </div>`;
  },

  submitName() {
    const val = document.getElementById('onb-name')?.value.trim();
    if (!val) { toast('Please enter your name'); return; }
    ONB.goNext({ name: val });
  },

  /* ── Race selection ─────────────────────────────────────────── */
  stepRace(data, pct) {
    const sel = data.racePresetId;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🏁</div>
        <h2 class="onb-q">What race are you training for?</h2>
        <p class="onb-hint">Pick a SA race or enter a custom one.</p>
        <div class="onb-body">
          <div class="race-grid">
            ${RACES.map(r => `
              <div class="race-card ${sel===r.id?'selected':''}"
                   onclick="ONB.setField('racePresetId','${r.id}');ONB.render()">
                <div class="race-card-emoji">${r.emoji}</div>
                <div class="race-card-name">${r.name}</div>
                ${r.date?`<div class="race-card-date">${fmtDate(r.date)}</div>`:''}
              </div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitRace()">Continue →</button>
        </div>
      </div>`;
  },

  submitRace() {
    const d = S.onb.data;
    if (!d.racePresetId) { toast('Please select a race'); return; }
    if (d.racePresetId !== '__custom__') {
      const race = RACES.find(r => r.id === d.racePresetId);
      if (race) {
        d.raceName = race.name; d.raceDistKm = race.distKm;
        d.raceDistance = race.dist; d.raceHilliness = race.hilliness;
        d.hillFactor = race.hillFactor; d.raceDate = race.date;
      }
    }
    ONB.goNext();
  },

  /* ── Custom race: distance ──────────────────────────────────── */
  stepCustomDist(data, pct) {
    const opts = [
      {label:'10 km', km:10}, {label:'21.1 km (Half)', km:21.1},
      {label:'42.2 km (Marathon)', km:42.2}, {label:'50 km', km:50},
      {label:'Other distance', km:null},
    ];
    const sel = data.customDistKm;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📏</div>
        <h2 class="onb-q">What distance is your race?</h2>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.km?'selected':''}"
                   onclick="ONB.setField('customDistKm',${o.km});ONB.render()">${o.label}</div>`).join('')}
          </div>
          ${sel===null?`<input class="field" id="custom-km-input" type="number" min="5" max="200"
            placeholder="Distance in km (e.g. 56)" style="margin-top:12px">`:''}
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitCustomDist()">Continue →</button>
        </div>
      </div>`;
  },

  submitCustomDist() {
    let km = S.onb.data.customDistKm;
    if (km === null) {
      km = parseFloat(document.getElementById('custom-km-input')?.value);
      if (!km || km < 5 || km > 200) { toast('Enter a distance between 5 and 200 km'); return; }
    }
    if (km == null) { toast('Please select a distance'); return; }
    S.onb.data.customDistKm = km;
    S.onb.data.raceDistKm   = km;
    S.onb.data.raceDistance  = kmToRaceDistance(km);
    ONB.goNext();
  },

  /* ── Custom race: terrain ───────────────────────────────────── */
  stepCustomHills(data, pct) {
    const opts = [
      {key:'flat',     label:'Flat (little or no hills)',   factor:0.02},
      {key:'rolling',  label:'Rolling (gentle hills)',       factor:0.05},
      {key:'hilly',    label:'Hilly (significant climbs)',   factor:0.09},
      {key:'mountain', label:'Mountain (very hilly)',        factor:0.125},
    ];
    const sel = data.terrainKey;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">⛰️</div>
        <h2 class="onb-q">What is the terrain like?</h2>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.key?'selected':''}"
                   onclick="ONB.setField('terrainKey','${o.key}');ONB.setField('hillFactor',${o.factor});ONB.setField('raceHilliness','${o.key}');ONB.render()">
                ${o.label}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitCustomHills()">Continue →</button>
        </div>
      </div>`;
  },

  submitCustomHills() {
    if (!S.onb.data.terrainKey) { toast('Please select the terrain'); return; }
    ONB.goNext();
  },

  /* ── Custom race: date ──────────────────────────────────────── */
  stepCustomDate(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📅</div>
        <h2 class="onb-q">When is the race?</h2>
        <div class="onb-body">
          <label class="onb-label">Race name (optional)</label>
          <input class="field" id="custom-race-name" type="text"
                 placeholder="e.g. Knysna Forest Marathon" value="${data.raceName||''}">
          <label class="onb-label" style="margin-top:14px">Race date</label>
          <input class="field" id="custom-race-date" type="date" value="${data.raceDate||''}">
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitCustomDate()">Continue →</button>
        </div>
      </div>`;
  },

  submitCustomDate() {
    const name = document.getElementById('custom-race-name')?.value.trim() || '';
    const date = document.getElementById('custom-race-date')?.value;
    if (!date) { toast('Please enter the race date'); return; }
    const today = new Date().toISOString().slice(0,10);
    if (date <= today) { toast('Race date must be in the future'); return; }
    S.onb.data.raceDate  = date;
    S.onb.data.raceName  = name || `Custom ${S.onb.data.raceDistKm}km race`;
    S.onb.data.racePresetId = null;
    ONB.goNext();
  },

  /* ── Experience ─────────────────────────────────────────────── */
  stepExperience(data, pct) {
    const sel = data.experience;
    const opts = [
      {id:'recent_race', icon:'⏱️', title:'Yes — I have a recent race time',  desc:'Calculate your VDOT from a finish time'},
      {id:'beginner',    icon:'🌱', title:'No — beginner / returning runner', desc:'Choose from ability levels'},
      {id:'know_vdot',   icon:'🎯', title:'I know my VDOT number',            desc:'Enter your score directly'},
    ];
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🏃</div>
        <h2 class="onb-q">Have you raced in the last 12 months?</h2>
        <p class="onb-hint">This sets your training paces accurately.</p>
        <div class="onb-body">
          <div class="onb-cards">
            ${opts.map(o=>`
              <div class="onb-card ${sel===o.id?'selected':''}"
                   onclick="ONB.setField('experience','${o.id}');ONB.setField('isC25K',false);ONB.render()">
                <div class="card-icon">${o.icon}</div>
                <div><div class="card-title">${o.title}</div><div class="card-desc">${o.desc}</div></div>
              </div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitExperience()">Continue →</button>
        </div>
      </div>`;
  },

  submitExperience() {
    if (!S.onb.data.experience) { toast('Please make a selection'); return; }
    ONB.goNext();
  },

  /* ── Recent race: distance ──────────────────────────────────── */
  stepRecentDist(data, pct) {
    const opts = [
      {label:'5km', km:5}, {label:'10km', km:10},
      {label:'Half marathon', km:21.097}, {label:'Marathon', km:42.195},
    ];
    const sel = data.recentDistKm;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📏</div>
        <h2 class="onb-q">What distance was your recent race?</h2>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.km?'selected':''}"
                   onclick="ONB.setField('recentDistKm',${o.km});ONB.setField('recentDistLabel','${o.label}');ONB.render()">
                ${o.label}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitRecentDist()">Continue →</button>
        </div>
      </div>`;
  },

  submitRecentDist() {
    if (!S.onb.data.recentDistKm) { toast('Please select a distance'); return; }
    ONB.goNext();
  },

  /* ── Recent race: time ──────────────────────────────────────── */
  stepRecentTime(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">⏱️</div>
        <h2 class="onb-q">What was your finishing time?</h2>
        <p class="onb-hint">Your <b>${data.recentDistLabel||'race'}</b> time.</p>
        <div class="onb-body">
          <div class="time-row">
            <input class="time-field" id="race-h" type="number" min="0" max="24" placeholder="h"  value="${data.raceH||''}">
            <span class="time-sep">h</span>
            <input class="time-field" id="race-m" type="number" min="0" max="59" placeholder="mm" value="${data.raceM||''}">
            <span class="time-sep">m</span>
            <input class="time-field" id="race-s" type="number" min="0" max="59" placeholder="ss" value="${data.raceS||''}">
            <span class="time-sep">s</span>
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitRecentTime()">Calculate VDOT →</button>
        </div>
      </div>`;
  },

  async submitRecentTime() {
    const h = parseInt(document.getElementById('race-h')?.value||'0')||0;
    const m = parseInt(document.getElementById('race-m')?.value||'0')||0;
    const s = parseInt(document.getElementById('race-s')?.value||'0')||0;
    const totalMins = h*60 + m + s/60;
    if (totalMins < 1) { toast('Please enter your finishing time'); return; }
    const km = S.onb.data.recentDistKm;
    showLoadingOverlay('Calculating your VDOT…');
    try {
      const res = await apiFetch(`/vdot/calculate?distance_km=${km}&time_minutes=${totalMins.toFixed(2)}`);
      hideLoadingOverlay();
      ONB.goNext({ vdot:res.vdot, recentTimeMins:totalMins, raceH:h, raceM:m, raceS:s });
    } catch(e) {
      hideLoadingOverlay();
      const vdot = Math.max(25, Math.min(80, Math.round(42*(km/totalMins))));
      ONB.goNext({ vdot, recentTimeMins:totalMins, raceH:h, raceM:m, raceS:s });
    }
  },

  /* ── Beginner ability ───────────────────────────────────────── */
  stepBeginnerAbility(data, pct) {
    const opts = [
      {id:'couch',         label:'I mostly walk, with some running', desc:'C25K — 12 weeks to 5 km'},
      {id:'run5k_slow',    label:'I can run 5 km (slowly)',          desc:'C25K — build from your base'},
      {id:'finished_c25k', label:'I completed Couch to 5K',         desc:'Ready for a race plan'},
      {id:'run10k',        label:'I can run 10 km comfortably',      desc:'Solid base for any race'},
    ];
    const sel = data.beginnerAbility;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🌱</div>
        <h2 class="onb-q">How would you describe your running right now?</h2>
        <div class="onb-body">
          <div class="onb-cards">
            ${opts.map(o=>`
              <div class="onb-card ${sel===o.id?'selected':''}"
                   onclick="ONB.setField('beginnerAbility','${o.id}');ONB.setField('isC25K',${o.id==='couch'||o.id==='run5k_slow'});ONB.render()">
                <div><div class="card-title">${o.label}</div><div class="card-desc">${o.desc}</div></div>
              </div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitBeginnerAbility()">Continue →</button>
        </div>
      </div>`;
  },

  submitBeginnerAbility() {
    const d = S.onb.data;
    if (!d.beginnerAbility) { toast('Please make a selection'); return; }
    if (!d.isC25K) {
      if (d.beginnerAbility === 'finished_c25k') d.vdot = 30;
      if (d.beginnerAbility === 'run10k')        d.vdot = 37;
    }
    ONB.goNext();
  },

  /* ── Know VDOT ──────────────────────────────────────────────── */
  stepVDOTInput(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🎯</div>
        <h2 class="onb-q">What is your VDOT score?</h2>
        <p class="onb-hint">Between 30 (beginner) and 75 (competitive). Check vdoto2.com if unsure.</p>
        <div class="onb-body">
          <input class="field" id="vdot-input" type="number" min="20" max="90"
                 placeholder="e.g. 49" value="${data.vdot||''}">
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitVDOTInput()">Continue →</button>
        </div>
      </div>`;
  },

  submitVDOTInput() {
    const val = parseFloat(document.getElementById('vdot-input')?.value);
    if (!val || val < 20 || val > 90) { toast('Please enter a VDOT between 20 and 90'); return; }
    ONB.goNext({ vdot:val, directVdot:val });
  },

  /* ── Weekly km ──────────────────────────────────────────────── */
  stepWeeklyKm(data, pct) {
    const bands = [
      {label:'Not running yet', km:0},  {label:'Under 15 km/wk', km:10},
      {label:'15–30 km/wk', km:22},     {label:'30–50 km/wk', km:40},
      {label:'50–70 km/wk', km:60},     {label:'70+ km/wk', km:80},
    ];
    const sel = data.weeklyKm;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📏</div>
        <h2 class="onb-q">How many km per week do you currently run?</h2>
        <div class="onb-body">
          <div class="onb-list">
            ${bands.map(b=>`
              <div class="onb-list-item ${sel===b.km?'selected':''}"
                   onclick="ONB.setField('weeklyKm',${b.km});ONB.render()">${b.label}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitWeeklyKm()">Continue →</button>
        </div>
      </div>`;
  },

  submitWeeklyKm() {
    if (S.onb.data.weeklyKm == null) { toast('Please select your weekly mileage'); return; }
    ONB.goNext();
  },

  /* ── Longest run ────────────────────────────────────────────── */
  stepLongestRun(data, pct) {
    const bands = [
      {label:'Under 5 km', km:3},  {label:'5–10 km', km:7},
      {label:'10–16 km', km:13},   {label:'16–21 km', km:18},
      {label:'21–32 km', km:26},   {label:'32+ km', km:38},
    ];
    const sel = data.longestRun;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🗺️</div>
        <h2 class="onb-q">Longest run in the last 6 weeks?</h2>
        <div class="onb-body">
          <div class="onb-list">
            ${bands.map(b=>`
              <div class="onb-list-item ${sel===b.km?'selected':''}"
                   onclick="ONB.setField('longestRun',${b.km});ONB.render()">${b.label}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitLongestRun()">Continue →</button>
        </div>
      </div>`;
  },

  submitLongestRun() {
    if (S.onb.data.longestRun == null) { toast('Please make a selection'); return; }
    ONB.goNext();
  },

  /* ── Plan type ──────────────────────────────────────────────── */
  stepPlanType(data, pct) {
    const opts = [
      {id:'balanced',     icon:'⚡', title:'Balanced',     desc:'Standard weekly build (+12%). Best for most runners.'},
      {id:'conservative', icon:'🛡️', title:'Conservative', desc:'Slower build (+8%), more recovery. Good after gaps or niggles.'},
      {id:'injury_prone', icon:'🩹', title:'Injury Prone',  desc:'Slower build + plan accounts for likely missed sessions.'},
    ];
    const sel = data.planType;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📋</div>
        <h2 class="onb-q">Choose your training approach</h2>
        <div class="onb-body">
          <div class="onb-cards">
            ${opts.map(o=>`
              <div class="onb-card ${sel===o.id?'selected':''}"
                   onclick="ONB.setField('planType','${o.id}');ONB.render()">
                <div class="card-icon">${o.icon}</div>
                <div><div class="card-title">${o.title}</div><div class="card-desc">${o.desc}</div></div>
              </div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitPlanType()">Continue →</button>
        </div>
      </div>`;
  },

  submitPlanType() {
    if (!S.onb.data.planType) { toast('Please choose a training approach'); return; }
    ONB.goNext();
  },

  /* ── Long run day ───────────────────────────────────────────── */
  stepLongRunDay(data, pct) {
    const opts = [{f:'Saturday',s:'Sat'},{f:'Sunday',s:'Sun'},{f:'Friday',s:'Fri'},{f:'Thursday',s:'Thu'}];
    const sel = data.longRunDay;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🗓️</div>
        <h2 class="onb-q">Which day for your long run?</h2>
        <p class="onb-hint">Choose a day when you have the most time and energy.</p>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.s?'selected':''}"
                   onclick="ONB.setField('longRunDay','${o.s}');ONB.render()">${o.f}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitLongRunDay()">Continue →</button>
        </div>
      </div>`;
  },

  submitLongRunDay() {
    if (!S.onb.data.longRunDay) { toast('Please select a day'); return; }
    ONB.goNext();
  },

  /* ── Quality day ────────────────────────────────────────────── */
  stepQualityDay(data, pct) {
    const lrDay = data.longRunDay || 'Sat';
    const opts = [{f:'Tuesday',s:'Tue'},{f:'Wednesday',s:'Wed'},{f:'Thursday',s:'Thu'},{f:'Monday',s:'Mon'}]
                 .filter(o=>o.s!==lrDay);
    const sel = data.qualityDay;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">⚡</div>
        <h2 class="onb-q">Which day for your quality session?</h2>
        <p class="onb-hint">Intervals or threshold — ideally 2+ days before your long run.</p>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.s?'selected':''}"
                   onclick="ONB.setField('qualityDay','${o.s}');ONB.render()">${o.f}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitQualityDay()">Continue →</button>
        </div>
      </div>`;
  },

  submitQualityDay() {
    if (!S.onb.data.qualityDay) { toast('Please select a day'); return; }
    ONB.goNext();
  },

  /* ── Easy day 1 ─────────────────────────────────────────────── */
  stepEasyDay1(data, pct) {
    const taken = new Set([data.longRunDay, data.qualityDay]);
    const ALL = [{f:'Monday',s:'Mon'},{f:'Tuesday',s:'Tue'},{f:'Wednesday',s:'Wed'},
                 {f:'Thursday',s:'Thu'},{f:'Friday',s:'Fri'},{f:'Saturday',s:'Sat'},{f:'Sunday',s:'Sun'}];
    const opts = ALL.filter(o=>!taken.has(o.s));
    const sel = data.easyDay1;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">🏃</div>
        <h2 class="onb-q">Which day for your first easy run?</h2>
        <p class="onb-hint">Easy runs are low-intensity — comfortable conversational pace.</p>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.s?'selected':''}"
                   onclick="ONB.setField('easyDay1','${o.s}');ONB.render()">${o.f}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitEasyDay1()">Continue →</button>
        </div>
      </div>`;
  },

  submitEasyDay1() {
    if (!S.onb.data.easyDay1) { toast('Please select a day'); return; }
    ONB.goNext();
  },

  /* ── Easy day 2 (optional) ──────────────────────────────────── */
  stepEasyDay2(data, pct) {
    const taken = new Set([data.longRunDay, data.qualityDay, data.easyDay1]);
    const ALL = [{f:'Monday',s:'Mon'},{f:'Tuesday',s:'Tue'},{f:'Wednesday',s:'Wed'},
                 {f:'Thursday',s:'Thu'},{f:'Friday',s:'Fri'},{f:'Saturday',s:'Sat'},{f:'Sunday',s:'Sun'}];
    const opts = ALL.filter(o=>!taken.has(o.s));
    const sel = data.easyDay2;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">➕</div>
        <h2 class="onb-q">Add a second easy run day?</h2>
        <p class="onb-hint">Two easy days build aerobic base. Tap to add or skip.</p>
        <div class="onb-body">
          <div class="onb-list">
            ${opts.map(o=>`
              <div class="onb-list-item ${sel===o.s?'selected':''}"
                   onclick="ONB.setField('easyDay2','${o.s}');ONB.render()">${o.f}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.goNext()">
            ${sel?'Continue →':'Skip — only one easy day →'}
          </button>
        </div>
      </div>`;
  },

  /* ── Anchor question ────────────────────────────────────────── */
  stepAnchorQ(data, pct) {
    const anchors = data.anchors || [];
    const count = anchors.length;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📌</div>
        <h2 class="onb-q">${count===0?'Do you run with a club or group?':`You have ${count} group run. Add another?`}</h2>
        <p class="onb-hint">Group runs are <b>locked into your plan</b> — other sessions adjust around them.</p>
        ${count>0?`<div class="onb-body"><div class="confirm-card" style="padding:12px">
          ${anchors.map(a=>`<div class="confirm-row"><span>${a.day}</span><span class="text-red">${a.km} km</span></div>`).join('')}
        </div></div>`:'<div class="onb-body"></div>'}
        <div class="onb-foot" style="display:flex;flex-direction:column;gap:10px">
          ${count<2?`<button class="btn btn-red" onclick="ONB.setField('anchorWantsMore',true);ONB.goNext()">
            ${count===0?'Yes — add a group run →':'Yes — add another →'}</button>`:''}
          <button class="btn btn-ghost" onclick="ONB.setField('anchorWantsMore',false);ONB.goNext()">
            ${count===0?'No group runs →':'Done — no more →'}
          </button>
        </div>
      </div>`;
  },

  /* ── Anchor detail (day + km) ───────────────────────────────── */
  stepAnchorDetail(data, pct) {
    const existing = (data.anchors||[]).map(a=>a.day);
    const ALL = [{f:'Monday',s:'Mon'},{f:'Tuesday',s:'Tue'},{f:'Wednesday',s:'Wed'},
                 {f:'Thursday',s:'Thu'},{f:'Friday',s:'Fri'},{f:'Saturday',s:'Sat'},{f:'Sunday',s:'Sun'}];
    const avail = ALL.filter(o=>!existing.includes(o.s));
    const kmOpts = [5, 8, 10, 12, 15];
    const selDay = data.anchorPendingDay;
    const selKm  = data.anchorPendingKm;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📌</div>
        <h2 class="onb-q">Group run details</h2>
        <div class="onb-body">
          <label class="onb-label">Which day?</label>
          <div class="onb-list" style="margin-bottom:16px">
            ${avail.map(o=>`
              <div class="onb-list-item ${selDay===o.s?'selected':''}"
                   onclick="ONB.setField('anchorPendingDay','${o.s}');ONB.render()">${o.f}</div>`).join('')}
          </div>
          <label class="onb-label">How far?</label>
          <div class="day-btns" style="margin-bottom:10px">
            ${kmOpts.map(k=>`<button class="day-btn ${selKm===k?'selected':''}"
              onclick="ONB.setField('anchorPendingKm',${k});ONB.render()">${k} km</button>`).join('')}
          </div>
          <input class="field" id="anchor-km-custom" type="number" min="1" max="100"
                 placeholder="Or type a distance in km"
                 value="${selKm&&!kmOpts.includes(selKm)?selKm:''}">
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitAnchorDetail()">Save group run →</button>
        </div>
      </div>`;
  },

  submitAnchorDetail() {
    const day = S.onb.data.anchorPendingDay;
    if (!day) { toast('Please select a day'); return; }
    let km = S.onb.data.anchorPendingKm;
    const custom = parseFloat(document.getElementById('anchor-km-custom')?.value);
    if (custom && custom > 0) km = custom;
    if (!km || km <= 0) { toast('Please enter a distance'); return; }
    const anchors = (S.onb.data.anchors||[]).filter(a=>a.day!==day);
    anchors.push({day, km});
    anchors.sort((a,b)=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(a.day)-
                        ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(b.day));
    S.onb.data.anchors = anchors;
    S.onb.data.anchorPendingDay = null;
    S.onb.data.anchorPendingKm  = null;
    S.onb.data.anchorWantsMore  = false;
    // Return to anchor question
    S.onb.step--;
    ONB.render();
  },

  /* ── HR Setup (app-only, stored in localStorage for treadmill) ─ */
  stepHRSetup(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">❤️</div>
        <h2 class="onb-q">Heart rate zones (optional)</h2>
        <p class="onb-hint">Used for HR-guided pacing during treadmill sessions and outdoor runs. Skip if you don't have a HR monitor.</p>
        <div class="onb-body">
          <label class="onb-label">Your age</label>
          <input class="field" id="hr-age" type="number" min="10" max="99"
                 placeholder="e.g. 35" value="${data.age||''}">
          <label class="onb-label" style="margin-top:14px">Resting heart rate (bpm)</label>
          <input class="field" id="hr-rhr" type="number" min="30" max="100"
                 placeholder="e.g. 55 — measure lying still in the morning" value="${data.rhr||''}">
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.submitHRSetup()">Save HR zones →</button>
          <button class="btn btn-ghost" onclick="ONB.goNext()" style="margin-top:10px">Skip — no HR monitor</button>
        </div>
      </div>`;
  },

  submitHRSetup() {
    const age = parseInt(document.getElementById('hr-age')?.value);
    const rhr = parseInt(document.getElementById('hr-rhr')?.value);
    if (!age || age < 10 || age > 99)   { toast('Please enter a valid age'); return; }
    if (!rhr || rhr < 30 || rhr > 100) { toast('Please enter a resting HR between 30 and 100'); return; }
    localStorage.setItem('vr_hr_age', age);
    localStorage.setItem('vr_hr_rhr', rhr);
    ONB.goNext({ age, rhr });
  },

  /* ── Location ───────────────────────────────────────────────── */
  stepLocation(data, pct) {
    const sel = data.locationCity;
    return `
      <div class="onb-screen">
        ${ONB.progress(pct)}
        ${ONB.back()}
        <div class="onb-icon">📍</div>
        <h2 class="onb-q">Where are you based?</h2>
        <p class="onb-hint">Adjusts paces for local weather (TRUEPACE). Optional.</p>
        <div class="onb-body">
          <div class="onb-list">
            ${SA_CITIES.map(c=>`
              <div class="onb-list-item ${sel===c.name?'selected':''}"
                   onclick="ONB.setField('locationCity','${c.name}');ONB.setField('locationLat',${c.lat});ONB.setField('locationLon',${c.lon});ONB.render()">
                ${c.name}</div>`).join('')}
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.goNext()">
            ${sel?`Continue — ${sel} →`:'Skip for now →'}
          </button>
        </div>
      </div>`;
  },

  /* ── Confirm (full plan) ────────────────────────────────────── */
  stepConfirm(data, pct) {
    const planLabels = {balanced:'Balanced ⚡', conservative:'Conservative 🛡️', injury_prone:'Injury Prone 🩹'};
    const extraDays  = [data.easyDay1, data.easyDay2].filter(Boolean).join(', ');
    const anchors    = data.anchors || [];
    return `
      <div class="onb-screen">
        ${ONB.progress(95)}
        ${ONB.back()}
        <div class="onb-icon">✅</div>
        <h2 class="onb-q">Your training plan</h2>
        <p class="onb-hint">Ready to build?</p>
        <div class="onb-body">
          <div class="confirm-card">
            <div class="confirm-hero">
              <div class="confirm-race-name">🏁 ${data.raceName||'Your race'}</div>
              ${data.raceDate?`<div class="confirm-race-date">${fmtDate(data.raceDate)}</div>`:''}
            </div>
            <div class="confirm-rows">
              <div class="confirm-row"><span class="confirm-row-label">Runner</span>
                <span class="confirm-row-value text-red">${data.name||''}</span></div>
              <div class="confirm-row"><span class="confirm-row-label">VDOT</span>
                <span class="confirm-row-value text-red">${data.vdot||'—'}</span></div>
              <div class="confirm-row"><span class="confirm-row-label">Weekly km</span>
                <span class="confirm-row-value">${data.weeklyKm??'—'} km</span></div>
              <div class="confirm-row"><span class="confirm-row-label">Approach</span>
                <span class="confirm-row-value">${planLabels[data.planType]||data.planType||'—'}</span></div>
              <div class="confirm-row"><span class="confirm-row-label">Long run</span>
                <span class="confirm-row-value">${data.longRunDay||'—'}</span></div>
              <div class="confirm-row"><span class="confirm-row-label">Quality</span>
                <span class="confirm-row-value">${data.qualityDay||'—'}</span></div>
              ${extraDays?`<div class="confirm-row"><span class="confirm-row-label">Easy days</span>
                <span class="confirm-row-value">${extraDays}</span></div>`:''}
              ${anchors.length?`<div class="confirm-row"><span class="confirm-row-label">Group runs</span>
                <span class="confirm-row-value">${anchors.map(a=>`${a.day} ${a.km}km`).join(', ')}</span></div>`:''}
              ${data.locationCity?`<div class="confirm-row"><span class="confirm-row-label">Location</span>
                <span class="confirm-row-value">${data.locationCity}</span></div>`:''}
              ${data.age?`<div class="confirm-row"><span class="confirm-row-label">HR zones</span>
                <span class="confirm-row-value">Age ${data.age}, RHR ${data.rhr} bpm</span></div>`:''}
            </div>
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.createPlan()">Build my plan 🚀</button>
        </div>
      </div>`;
  },

  /* ── Confirm C25K ───────────────────────────────────────────── */
  stepConfirmC25K(data, pct) {
    return `
      <div class="onb-screen">
        ${ONB.progress(95)}
        ${ONB.back()}
        <div class="onb-icon">🌱</div>
        <h2 class="onb-q">Ready for Couch to 5K?</h2>
        <div class="onb-body">
          <div class="confirm-card">
            <div class="confirm-hero">
              <div class="confirm-race-name">🌱 Couch to 5K</div>
            </div>
            <div class="confirm-rows">
              <div class="confirm-row"><span class="confirm-row-label">Runner</span>
                <span class="confirm-row-value text-red">${data.name||''}</span></div>
              <div class="confirm-row"><span class="confirm-row-label">Programme</span>
                <span class="confirm-row-value">12 weeks · 3×/week</span></div>
              ${data.locationCity?`<div class="confirm-row"><span class="confirm-row-label">Location</span>
                <span class="confirm-row-value">${data.locationCity}</span></div>`:''}
            </div>
          </div>
        </div>
        <div class="onb-foot">
          <button class="btn btn-red" onclick="ONB.createPlan()">Start my C25K plan 🚀</button>
        </div>
      </div>`;
  },

  /* ── Create plan ────────────────────────────────────────────── */
  async createPlan() {
    const d     = S.onb.data;
    const id    = genUUID();
    const today = new Date().toISOString().slice(0, 10);
    showLoadingOverlay('Building your plan…');
    try {
      if (d.isC25K) {
        await API.createC25K({ telegram_id:id, name:d.name, start_date:today });
        if (d.locationLat) {
          try { await apiFetch(`/athlete/${id}/location`, {method:'PATCH',
            body:JSON.stringify({latitude:d.locationLat,longitude:d.locationLon,run_hour:6})}); } catch(e) {}
        }
      } else {
        const planTypeMap = {balanced:'aggressive', conservative:'conservative', injury_prone:'injury_prone'};
        // Get VDOT from prediction if not already set
        let vdot = d.vdot;
        if (!vdot) {
          try {
            const pred = await apiFetch('/predict/', {method:'POST', body:JSON.stringify({
              race_name:               d.raceName||'Your race',
              race_distance_km:        d.raceDistKm||42.195,
              hill_factor:             d.hillFactor||0.045,
              race_date:               d.raceDate||today,
              has_recent_race:         d.experience==='recent_race',
              recent_race_distance_km: d.recentDistKm||null,
              recent_race_time_minutes:d.recentTimeMins||null,
              beginner_ability:        d.beginnerAbility||null,
              weekly_mileage_km:       d.weeklyKm||0,
              longest_run_km:          d.longestRun||0,
              plan_type:               d.planType||'balanced',
            })});
            vdot = pred.vdot;
          } catch(e) { vdot = 35; }
        }
        const extraDays = [d.easyDay1, d.easyDay2].filter(Boolean).join(',');
        await API.createAthlete({
          telegram_id:            id,
          name:                   d.name,
          current_weekly_mileage: Math.max(d.weeklyKm||10, 5),
          vdot:                   vdot||35,
          race_distance:          d.raceDistance||'marathon',
          race_hilliness:         d.raceHilliness||'low',
          race_date:              d.raceDate||today,
          start_date:             today,
          race_name:              d.raceName||'',
          preset_race_id:         (d.racePresetId&&d.racePresetId!=='__custom__')?d.racePresetId:null,
          training_profile:       planTypeMap[d.planType]||'aggressive',
          plan_type:              'full',
          long_run_day:           d.longRunDay||'Sat',
          quality_day:            d.qualityDay||'Tue',
          extra_training_days:    extraDays,
          latitude:               d.locationLat||null,
          longitude:              d.locationLon||null,
        });
        if ((d.anchors||[]).length) {
          try { await apiFetch(`/athlete/${id}/anchors`, {method:'PATCH',
            body:JSON.stringify({anchors:d.anchors})}); } catch(e) {}
        }
        if (d.locationLat) {
          try { await apiFetch(`/athlete/${id}/location`, {method:'PATCH',
            body:JSON.stringify({latitude:d.locationLat,longitude:d.locationLon,run_hour:6})}); } catch(e) {}
        }
      }
      S.athleteId = id;
      localStorage.setItem('vr_athlete_id', id);
      S.athlete = await API.getAthlete(id);
      hideLoadingOverlay();
      toast(`Plan created! Welcome, ${d.name} 🎉`);
      await App.loadData();
      App.showRaceTab();
    } catch(e) {
      hideLoadingOverlay();
      toast('Could not create plan — check server connection');
      console.error(e);
    }
  },
};

/* ── Helper: km → race_distance string ──────────────────────── */
function kmToRaceDistance(km) {
  if (km <= 5.5)  return '5k';
  if (km <= 11)   return '10k';
  if (km <= 22)   return 'half';
  if (km <= 43)   return 'marathon';
  if (km <= 60)   return 'ultra_56';
  return 'ultra_90';
}


/* ── SCREEN: TODAY ──────────────────────────────────────────── */
const ScreenToday = {

  _indoor: false,   // persists across re-renders within the session

  /* Convert "M:SS" pace string → km/h, rounded to nearest 0.1 */
  _paceToKmh(paceStr) {
    if (!paceStr) return null;
    const [m, s] = paceStr.split(':').map(Number);
    if (!m || isNaN(s)) return null;
    return Math.round(600 / (m + s / 60)) / 10;
  },

  /* Zone label for a session colour — HR is bonus only */
  _zoneHint(color) {
    if (color === 'quality')  return 'Zone 4 — comfortably hard effort';
    if (color === 'long')     return 'Zone 2–3 — steady, never breathless';
    return 'Zone 2 — easy, conversational pace';
  },

  toggleIndoor() {
    this._indoor = !this._indoor;
    this.render();
  },

  async render() {
    const week = S.week;
    if (!week) {
      document.getElementById('screen').innerHTML = renderRaceShell(`<div class="spinner"></div>`);
      return;
    }

    const today    = new Date();
    const dayKey   = getDayKey(today);
    const session  = week.days?.[dayKey] || {};
    const name     = session.session || 'Rest';
    const km       = session.km || 0;
    const notes    = session.notes || '';
    const phase    = week.phase || 1;
    const phaseNames = { 1:'Base Phase', 2:'Repetitions Phase', 3:'Intervals Phase', 4:'Threshold Phase' };
    const phaseEmoji = { 1:'🧱', 2:'⚡', 3:'🔥', 4:'🎯' };
    const weekNum  = week.week_number || 1;
    const totalVol = week.planned_volume_km || 0;
    const anchor   = session.anchor ? '📌 ' : '';
    const isRest   = km === 0 || name.includes('Rest');
    const color    = sessionColor(name);

    // ── Paces ──────────────────────────────────────────────────
    let paceStr = '';
    let paces   = null;
    if (S.athlete?.vdot && km > 0) {
      try {
        paces = await this.fetchPaces();
        if (paces) {
          paceStr = color === 'quality'
            ? paces.threshold
            : paces.easy;
        }
      } catch(e) {}
    }

    // ── Indoor target block ────────────────────────────────────
    const buildIndoorBlock = () => {
      if (!paceStr) return '';
      const kmh = this._paceToKmh(paceStr);
      if (!kmh) return '';
      const hint = this._zoneHint(color);
      return `
        <div class="treadmill-target">
          <div class="treadmill-speed">${kmh}<span>km/h</span></div>
          <div class="treadmill-incline">Set incline to 1%</div>
          <div class="treadmill-hr-hint">${hint}</div>
        </div>`;
    };

    // ── Pace / speed display ────────────────────────────────────
    const paceDisplay = !paceStr ? '' : this._indoor
      ? buildIndoorBlock()
      : `<div class="session-pace">@ ${paceStr}/km</div>`;

    // ── Indoor/Outdoor toggle (easy + long + quality — all non-rest) ──
    const toggle = isRest ? '' : `
      <div class="env-toggle">
        <button class="env-btn ${!this._indoor ? 'active' : ''}"
                onclick="ScreenToday.toggleIndoor()" ${!this._indoor ? 'disabled' : ''}>
          🌳 Outdoor
        </button>
        <button class="env-btn ${this._indoor ? 'active' : ''}"
                onclick="ScreenToday.toggleIndoor()" ${this._indoor ? 'disabled' : ''}>
          🏃 Treadmill
        </button>
      </div>`;

    // ── Week strip ─────────────────────────────────────────────
    const dayOrder = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const loggedDays = new Set((S.logSummary?.runs || []).map(r => r.day));
    const strip = dayOrder.map(d => {
      const s = week.days?.[d] || {};
      const isDone  = loggedDays.has(d);
      const isToday = d === dayKey;
      const dotClass = isDone ? 'done' : (isToday ? 'today' : sessionColor(s.session));
      return `
        <div class="week-day-dot">
          <div class="day-label">${d[0]}</div>
          <div class="dot ${dotClass}"></div>
        </div>`;
    }).join('');

    const content = `
      <div class="phase-chip" style="margin:0 16px 12px">
        ${phaseEmoji[phase] || ''} ${phaseNames[phase] || 'Training'} · Week ${weekNum} · ${totalVol} km target
      </div>

      <div class="session-hero">
        <div class="session-type-label">${anchor}TODAY · ${dayKey.toUpperCase()}</div>
        ${isRest
          ? `<div class="session-name">Rest Day</div>
             <div style="font-size:14px;color:var(--text-2);margin-top:8px">Recovery is part of the plan — don't skip it.</div>`
          : `<div class="session-name">${name}</div>
             <div class="session-km">${km}<span>km</span></div>
             ${paceDisplay}
             ${toggle}
             ${notes ? `<div style="font-size:13px;color:var(--text-2);margin-top:12px;line-height:1.5">${notes}</div>` : ''}`
        }
      </div>

      <div class="card-sm">
        <div class="label" style="margin-bottom:12px">This week</div>
        <div class="week-strip">${strip}</div>
      </div>`;

    document.getElementById('screen').innerHTML = renderRaceShell(content);

    // Fetch AI coached tip async (non-blocking)
    this.loadCoachedTip(dayKey);
  },

  async fetchPaces() {
    try {
      const res = await fetch(`${CFG.API}/athlete/${S.athleteId}/paces`);
      if (res.ok) return await res.json();
    } catch(e) {}
    return null;
  },

  async loadCoachedTip(dayKey) {
    if (!S.week?.days?.[dayKey]) return;
    try {
      const session = S.week.days[dayKey];
      const question = `Give me a one-sentence tip for today's ${session.session || 'rest'} (${session.km || 0} km).`;
      const res = await API.coachChat(S.athleteId, question);
      if (res?.reply) {
        const existing = document.querySelector('.coached-tip');
        if (!existing) {
          const hero = document.querySelector('.session-hero');
          if (hero) {
            const tip = document.createElement('div');
            tip.className = 'coached-tip';
            tip.innerHTML = `💬 ${res.reply}`;
            hero.after(tip);
          }
        }
      }
    } catch(e) {}
  },

  logRun() {
    toast('Logging coming in the next update!');
  },
};

/* ── SCREEN: SCHEDULE (Today + Calendar combined) ───────────── */
const ScreenSchedule = {
  async render() {
    const week    = S.week;
    const today   = new Date();
    const dayKey  = getDayKey(today);
    const session = week?.days?.[dayKey] || {};
    const name    = session.session || 'Rest';
    const km      = session.km || 0;
    const phase   = week?.phase || 1;
    const phaseNames = { 1:'Base', 2:'Repetitions', 3:'Intervals', 4:'Threshold' };
    const phaseEmoji = { 1:'🧱', 2:'⚡', 3:'🔥', 4:'🎯' };
    const weekNum  = week?.week_number || '—';
    const totalWks = week?.total_weeks || '—';
    const totalVol = week?.planned_volume_km || 0;
    const isRest   = !km || name.includes('Rest');
    const anchor   = session.anchor ? '📌 ' : '';
    const color    = sessionColor(name);

    const { year, month, selected } = S.calendar;
    const monthName  = MONTH_NAMES[month];
    const firstDay   = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0);
    const startDow   = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const todayISO_  = todayISO();

    // Week strip for today card
    const strip = DAYS.map(d => {
      const s = week?.days?.[d] || {};
      const isToday = d === dayKey;
      const dotCls  = isToday ? 'today' : sessionColor(s.session);
      return `
        <div class="week-day-dot">
          <div class="day-label">${d[0]}</div>
          <div class="dot ${dotCls}"></div>
        </div>`;
    }).join('');

    const content = `
      <div class="phase-chip" style="margin:0 16px 10px">
        ${phaseEmoji[phase] || ''} ${phaseNames[phase] || 'Training'} · Week ${weekNum}${totalWks !== '—' ? ' of ' + totalWks : ''} · ${totalVol} km
      </div>

      <div class="today-compact ${color}">
        <div class="today-compact-meta">${anchor}TODAY · ${dayKey.toUpperCase()}</div>
        ${isRest
          ? `<div class="today-compact-name">Rest Day 🛌</div>
             <div class="today-compact-sub">Recovery is part of the plan.</div>`
          : `<div class="today-compact-name">${name}</div>
             <div class="today-compact-km">${km} km</div>
             ${session.notes ? `<div class="today-compact-sub">${session.notes}</div>` : ''}`
        }
      </div>


      <div style="margin:16px 0 0">
        <div class="cal-nav">
          <button class="cal-nav-btn" onclick="ScreenSchedule.prevMonth()">‹</button>
          <div class="cal-month-label">${monthName} ${year}</div>
          <button class="cal-nav-btn" onclick="ScreenSchedule.nextMonth()">›</button>
        </div>
        <div class="cal-grid">
          <div class="cal-weekdays">
            ${['M','T','W','T','F','S','S'].map(d => `<div class="cal-weekday">${d}</div>`).join('')}
          </div>
          <!-- Advent calendar: image behind the grid, tiles clear as runs are logged -->
          <div class="cal-reveal-wrap" id="cal-reveal-wrap">
            <img id="cal-reveal-img" class="cal-reveal-img" src="" alt="" aria-hidden="true">
            <div class="cal-days" id="cal-days">
              ${ScreenSchedule.buildDayCells(year, month, startDow, daysInMonth, todayISO_, selected)}
            </div>
          </div>
        </div>
      </div>

      <div id="session-detail"></div>
      <div class="spacer-80"></div>`;

    document.getElementById('screen').innerHTML = renderRaceShell(content);
    ScreenSchedule.loadMonthData(year, month);
    if (selected) ScreenSchedule.showDayDetail(selected);
    if (!isRest) ScreenSchedule.loadCoachedTip(dayKey, name, km);
  },

  async loadCoachedTip(dayKey, sessionName, km) {
    try {
      const question = `Give me one focused sentence of coaching advice for today's ${sessionName} (${km} km). Be specific and motivational.`;
      const res = await API.coachChat(S.athleteId, question);
      if (res?.reply) {
        const card = document.querySelector('.today-compact');
        if (card && !document.querySelector('.coached-tip-inline')) {
          const tip = document.createElement('div');
          tip.className = 'coached-tip coached-tip-inline';
          tip.style.cssText = 'margin:0 16px 12px;';
          tip.innerHTML = `💬 ${res.reply}`;
          card.after(tip);
        }
      }
    } catch(e) {}
  },

  buildDayCells(year, month, startDow, days, todayISO_, selected) {
    const startISO      = S.athlete?.start_date;
    const currentWeekNum = S.week?.week_number;
    const raceDate      = S.athlete?.race_date;

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-day empty"></div>`;

    for (let d = 1; d <= days; d++) {
      const dateUTC    = new Date(Date.UTC(year, month, d));
      const iso        = toUTCDateString(dateUTC);
      const isToday    = iso === todayISO_;
      const isSel      = iso === selected;
      const isRace     = iso === raceDate;
      const wn         = startISO ? dateToWeekNum(startISO, dateUTC) : null;
      const isThisWeek = wn !== null && wn === currentWeekNum;

      const cls = ['cal-day',
        isToday    ? 'today'     : '',
        isSel      ? 'selected'  : '',
        isRace     ? 'race-day'  : '',
        isThisWeek ? 'this-week' : '',
      ].filter(Boolean).join(' ');

      cells += `
        <div class="${cls}" data-iso="${iso}" onclick="ScreenSchedule.selectDay('${iso}')">
          <div class="cal-day-num">${d}</div>
          <div class="cal-dots" id="dots-${iso}">
            ${isRace ? `<span class="cal-race-flag">🏁</span>` : ''}
          </div>
        </div>`;
    }
    return cells;
  },

  async loadMonthData(year, month) {
    if (!S.athlete) return;
    const startISO   = S.athlete.start_date;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Collect valid week numbers for every day in the month (UTC dates)
    const weekNumSet = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const wn = dateToWeekNum(startISO, new Date(Date.UTC(year, month, d)));
      if (wn && wn >= 1) weekNumSet.add(wn);
    }
    if (weekNumSet.size === 0) return;

    await Promise.all([...weekNumSet].map(wn => ScreenSchedule.fetchWeek(wn)));

    // Clear all dots first (prevent stale paint from previous render)
    document.querySelectorAll('.cal-dots').forEach(el => {
      if (!el.querySelector('.cal-race-flag')) el.innerHTML = '';
    });

    // Paint dots — only on actual running sessions (km > 0, not cross-train)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateUTC = new Date(Date.UTC(year, month, d));
      const iso     = toUTCDateString(dateUTC);
      const wn      = dateToWeekNum(startISO, dateUTC);
      if (!wn || wn < 1) continue;
      const week    = S.calendar.weeksCache[wn];
      if (!week) continue;
      const dayKey  = getDayKey(dateUTC);
      const sess    = week.days?.[dayKey];
      const dotEl   = document.getElementById(`dots-${iso}`);
      if (!dotEl) continue;

      const isRace = iso === S.athlete?.race_date;
      if (isRace) {
        dotEl.innerHTML = `<span class="cal-race-flag">🏁</span>`;
      } else if (sess?.session && sess.km > 0 && !sess.session.includes('Cross-Train')) {
        const color = sessionColor(sess.session);
        const dotBg = ScreenSchedule.dotColor(color);
        if (dotBg) {
          dotEl.innerHTML = `<div class="cal-dot" style="background:${dotBg}"></div>`;
        }
      }
    }

    // ── Advent calendar reveals ──────────────────────────────────
    const logSummaries = {};
    await Promise.all([...weekNumSet].map(async wn => {
      try {
        logSummaries[wn] = await API.getLogSummary(S.athleteId, wn);
      } catch(e) { logSummaries[wn] = null; }
    }));

    // Only reveal days where a run was actually logged
    const revealedISO = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateUTC = new Date(Date.UTC(year, month, d));
      const iso     = toUTCDateString(dateUTC);
      const wn      = dateToWeekNum(startISO, dateUTC);
      if (!wn || wn < 1) continue;
      const week    = S.calendar.weeksCache[wn];
      if (!week) continue;
      const dayKey  = getDayKey(dateUTC);
      const sess    = week.days?.[dayKey];
      if (!sess || sess.km === 0) continue; // rest day — stays dark

      // Only reveal if this run was actually logged
      const logged = logSummaries[wn]?.runs?.some(r => r.day === dayKey);
      if (logged) revealedISO.add(iso);
    }

    // Apply .revealed to each day tile
    revealedISO.forEach(iso => {
      const el = document.querySelector(`.cal-day[data-iso="${iso}"]`);
      if (el && !el.classList.contains('revealed')) el.classList.add('revealed');
    });

    // Show the background image once at least one tile is revealed
    const imgEl = document.getElementById('cal-reveal-img');
    if (imgEl && revealedISO.size > 0) {
      const raceId = S.athlete?.race_id || S.athlete?.race;
      imgEl.src = RACE_IMAGES[raceId] || RACE_IMAGES.__default__;
      imgEl.onerror = () => { imgEl.style.display = 'none'; }; // hide if image missing
      imgEl.classList.add('has-reveals');
    }
  },

  dotColor(type) {
    // Green = easy/long runs, Red = high intensity, Blue = cross-train/strength
    return { long:'#27AE60', easy:'#27AE60', quality:'#E31837', rest:null }[type] || null;
  },

  // Reveal a single calendar tile with the flip animation (call after logging a run)
  revealCalDay(iso) {
    const el = document.querySelector(`.cal-day[data-iso="${iso}"]`);
    if (!el || el.classList.contains('revealed')) return;
    el.classList.add('just-revealed');
    setTimeout(() => {
      el.classList.remove('just-revealed');
      el.classList.add('revealed');
    }, 450);
    const imgEl = document.getElementById('cal-reveal-img');
    if (imgEl && imgEl.src && !imgEl.src.endsWith('/')) imgEl.classList.add('has-reveals');
  },

  async fetchWeek(wn) {
    if (S.calendar.weeksCache[wn]) return S.calendar.weeksCache[wn];
    try {
      const week = await API.getWeek(S.athleteId, wn);
      S.calendar.weeksCache[wn] = week;
      return week;
    } catch(e) { return null; }
  },

  selectDay(iso) {
    S.calendar.selected = iso;
    document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`[data-iso="${iso}"]`);
    if (el) el.classList.add('selected');
    this.showDayDetail(iso);
  },

  showDayDetail(iso) {
    const startISO = S.athlete?.start_date;
    if (!startISO) return;
    const date    = utcDateFromISO(iso);
    const wn      = dateToWeekNum(startISO, date);
    const week    = S.calendar.weeksCache[wn];
    const dayKey  = getDayKey(date);
    const session = week?.days?.[dayKey];
    const detailEl = document.getElementById('session-detail');
    if (!detailEl) return;

    const isRace = iso === S.athlete?.race_date;
    if (isRace) {
      detailEl.innerHTML = `
        <div class="session-sheet">
          <div class="session-sheet-handle"></div>
          <div class="session-sheet-date">${fmtDate(iso)}</div>
          <div class="session-sheet-name">🏁 RACE DAY</div>
          <div class="session-sheet-km">${S.athlete.race_name || S.athlete.race_distance || 'Your race'}</div>
        </div>`;
      return;
    }

    if (!session) {
      detailEl.innerHTML = `
        <div class="session-sheet">
          <div class="session-sheet-handle"></div>
          <div class="session-sheet-date">${fmtDate(iso)}</div>
          <div class="session-sheet-name">${wn && wn >= 1 ? 'Rest Day' : 'Before plan start'}</div>
        </div>`;
      return;
    }

    const anchor       = session.anchor ? '📌 ' : '';
    const sessionName  = session.session || 'Rest';
    const isCrossTrain = sessionName.includes('Cross-Train');
    const isC25KPlan   = S.week?.plan_type === 'c25k';
    const isRunSession = session.km > 0 && !isCrossTrain;
    const sessionUrl   = isRunSession ? ScreenSchedule.buildSessionUrl(session, wn, dayKey) : null;

    // km / type label
    let kmLabel;
    if (session.km > 0) {
      kmLabel = `${session.km} km`;
    } else if (isCrossTrain) {
      kmLabel = isC25KPlan ? 'Active recovery session' : 'Strength Day — full programme coming soon';
    } else {
      kmLabel = sessionName.includes('Walk') ? 'Active recovery' : 'Rest day';
    }

    const isPast  = iso <= todayISO();
    const isToday = iso === todayISO();
    const canLog  = isRunSession && isPast;

    detailEl.innerHTML = `
      <div class="session-sheet">
        <div class="session-sheet-handle"></div>
        <div class="session-sheet-date">${fmtDate(iso)} · Week ${wn}</div>
        <div class="session-sheet-name">${anchor}${sessionName}</div>
        <div class="session-sheet-km">${kmLabel}</div>
        ${session.notes ? `<div class="session-sheet-notes">${session.notes}</div>` : ''}

        ${sessionUrl ? `
          <button class="btn btn-red" style="width:100%;margin-top:16px"
                  onclick="window.location='${sessionUrl}'">▶ Start this session</button>` : ''}

        ${canLog ? `
          <button class="btn" style="width:100%;margin-top:8px;background:var(--surface-hi);color:var(--text)"
                  onclick="App.logRunQuick('${iso}')">+ Log this run</button>` : ''}
      </div>`;
  },

  buildSessionUrl(session, weekNum, dayKey) {
    const a = S.athlete;
    if (!a) return null;
    // Use cached paces or build minimal URL — session.html has its own defaults
    const params = new URLSearchParams({
      name:    a.name || 'Runner',
      session: session.session || 'Run',
      notes:   session.notes || '',
      dist:    session.km || 0,
      tid:     S.athleteId || '',
      week:    weekNum || 0,
      day:     dayKey || '',
      api:     CFG.API,
    });
    // Add paces if we have them cached
    if (S.paces) {
      params.set('easy',      S.paces.easy      || '');
      params.set('threshold', S.paces.threshold || '');
      params.set('interval',  S.paces.interval  || '');
      params.set('rep',       S.paces.repetition || '');
      params.set('marathon',  S.paces.marathon   || '');
    }
    // Add HR data from localStorage (set during onboarding HR step or via settings)
    const storedAge = localStorage.getItem('vr_age');
    const storedRhr = localStorage.getItem('vr_rhr');
    if (storedAge) params.set('age', storedAge);
    if (storedRhr) params.set('rhr', storedRhr);
    return `session.html?${params.toString()}`;
  },

  prevMonth() {
    let { year, month } = S.calendar;
    month--; if (month < 0) { month = 11; year--; }
    S.calendar.year = year; S.calendar.month = month; S.calendar.selected = null;
    this.render();
  },

  nextMonth() {
    let { year, month } = S.calendar;
    month++; if (month > 11) { month = 0; year++; }
    S.calendar.year = year; S.calendar.month = month; S.calendar.selected = null;
    this.render();
  },

  logRun() { toast('Logging coming in the next update!'); },
};

/* ── SCREEN: COACH ──────────────────────────────────────────── */
const ScreenCoach = {
  render() {
    const msgs = S.coach.messages;

    const bubblesHTML = msgs.length === 0
      ? `<div style="text-align:center;padding:40px 20px;color:var(--text-3)">
           Ask your coach anything about your training, paces, race prep, or today's session.
         </div>`
      : msgs.map(m => `
          <div class="msg ${m.role === 'user' ? 'msg-user' : 'msg-coach'}">${m.text}</div>
        `).join('');

    const content = `
      <div class="coach-messages" id="coach-msgs">${bubblesHTML}</div>
      ${S.coach.busy ? `<div class="msg-coach msg" style="max-width:80%"><div class="msg-typing"><span></span><span></span><span></span></div></div>` : ''}
      <div class="spacer-80"></div>`;

    document.getElementById('screen').innerHTML = renderRaceShell(content);

    // Sticky input bar — append after scroll area
    const inputBar = document.createElement('div');
    inputBar.className = 'coach-input-bar';
    inputBar.id = 'coach-input-bar';
    inputBar.innerHTML = `
      <input class="coach-input" id="coach-q" placeholder="Ask your coach…" type="text">
      <button class="coach-send-btn" id="coach-send" onclick="ScreenCoach.send()" ${S.coach.busy ? 'disabled' : ''}>➤</button>`;
    document.getElementById('screen').appendChild(inputBar);

    document.getElementById('coach-q')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ScreenCoach.send(); }
    });

    // Scroll to bottom
    const msgs_el = document.getElementById('coach-msgs');
    if (msgs_el) msgs_el.scrollTop = msgs_el.scrollHeight;
  },

  async send() {
    const input = document.getElementById('coach-q');
    const q = input?.value.trim();
    if (!q || S.coach.busy) return;

    S.coach.messages.push({ role:'user', text: q });
    S.coach.busy = true;
    input.value = '';
    ScreenCoach.render();

    try {
      const res = await API.coachChat(S.athleteId, q);
      S.coach.messages.push({ role:'coach', text: res.reply || '…' });
    } catch(e) {
      S.coach.messages.push({ role:'coach', text: 'Could not reach the coaching service. Please try again.' });
    }
    S.coach.busy = false;
    ScreenCoach.render();
  },
};

/* ── SCREEN: STATS ──────────────────────────────────────────── */
const ScreenStats = {
  render() {
    const a = S.athlete;
    if (!a) {
      document.getElementById('screen').innerHTML = renderRaceShell(`<div class="spinner"></div>`);
      return;
    }

    const vdot     = a.vdot || '—';
    const raceName = a.race_name || a.race_distance || 'Your race';
    const raceDays = daysUntil(a.race_date);
    const weekKm   = S.week?.planned_volume_km || 0;
    const loggedKm = S.logSummary?.actual_volume_km || 0;
    const pct      = weekKm > 0 ? Math.min(100, Math.round(loggedKm / weekKm * 100)) : 0;
    const profile  = a.training_profile === 'aggressive' ? 'Performance-focused' : 'Steady & Safe';
    const streak   = a.streak_weeks || 0;

    // Quick prediction (using stored VDOT directly)
    let predStr = '—';
    if (a.vdot && a.race_date) {
      // Rough estimate: Daniels M-pace gives marathon baseline
      // For display, we just show the VDOT-based Daniels time
      // (full computation is server-side; we show what the server already computed)
      predStr = 'See dashboard for full prediction';
    }

    const content = `
      <div class="stat-hero">
        <div class="vdot-num">${vdot}</div>
        <div class="vdot-label">VDOT Score</div>
        <div class="prediction-label" style="margin-top:8px">${raceName}</div>
      </div>

      ${raceDays !== null ? `
        <div class="countdown-card">
          <div class="countdown-num">${raceDays}</div>
          <div class="countdown-text">
            <div class="text-bold">${raceDays === 1 ? 'Day' : 'Days'} to race day</div>
            <div style="color:var(--text-2)">${fmtDate(a.race_date)}</div>
          </div>
        </div>` : ''}

      <div class="card">
        <div class="label" style="margin-bottom:12px">This week's progress</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
          <span style="color:var(--text-2)">Volume logged</span>
          <span><strong>${loggedKm}</strong> / ${weekKm} km</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:6px">${pct}% of weekly target</div>
      </div>

      <div class="card">
        <div class="stat-row">
          <span class="stat-row-label">Training approach</span>
          <span class="stat-row-value">${profile}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row-label">Streak</span>
          <span class="stat-row-value">${streak} week${streak !== 1 ? 's' : ''}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row-label">Plan week</span>
          <span class="stat-row-value">${S.week?.week_number || '—'} of ${S.week?.total_weeks || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-row-label">Current weekly km</span>
          <span class="stat-row-value">${a.current_weekly_mileage || '—'} km</span>
        </div>
      </div>`;

    document.getElementById('screen').innerHTML = renderRaceShell(content);
  },
};

/* ── PLACEHOLDER TABS (Home, Club, Rewards, Workouts) ──────── */
function renderPlaceholder(icon, title, text) {
  return `
    ${renderHeader(title)}
    <div class="placeholder-screen">
      <div class="ph-icon">${icon}</div>
      <div class="ph-title">${title}</div>
      <div class="ph-text">${text}</div>
    </div>`;
}

/* ── ROUTER / NAV ───────────────────────────────────────────── */
const App = {

  tab(name) {
    S.activeTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');

    if (name === 'race') {
      this.showRaceTab();
    } else {
      const titles = { home:'Home', club:'Club', rewards:'Rewards', workouts:'Workouts' };
      const icons  = { home:'🏠', club:'📍', rewards:'⭐', workouts:'▶️' };
      document.getElementById('screen').innerHTML = renderPlaceholder(
        icons[name], titles[name],
        'This section is part of the Virgin Active app.\nSwitch back to Virgin Race for your running coach.'
      );
    }
  },

  subTab(name) {
    S.subTab = name;
    this.renderSubScreen();
  },

  logRunQuick(isoOverride) {
    // Determine which day we're logging (default = today)
    const iso    = isoOverride || todayISO();
    const date   = utcDateFromISO(iso);
    const dayKey = getDayKey(date);
    const wn     = S.week?.week_number;
    const sess   = S.week?.days?.[dayKey] || {};
    const planKm = sess.km || 0;
    const isRunSession = planKm > 0 && !sess.session?.includes('Cross-Train');

    // Don't open log sheet for rest or cross-train days
    if (!isRunSession) {
      toast('No run planned for today');
      return;
    }

    // Remove any existing sheet
    document.getElementById('log-sheet')?.remove();

    const sheet = document.createElement('div');
    sheet.id = 'log-sheet';
    sheet.className = 'log-sheet-overlay';
    sheet.innerHTML = `
      <div class="log-sheet">
        <div class="log-sheet-handle"></div>
        <div class="log-sheet-title">Log Run · ${fmtDate(iso)}</div>
        <div class="log-sheet-session">${sess.session || 'Run'}</div>

        <label class="log-label">Distance (km)</label>
        <input id="log-km" type="number" inputmode="decimal" step="0.1" min="0" max="200"
               class="log-input" value="${planKm}" placeholder="${planKm}">

        <label class="log-label">Duration (min) <span class="log-optional">optional</span></label>
        <input id="log-mins" type="number" inputmode="numeric" step="1" min="0" max="600"
               class="log-input" placeholder="e.g. 35">

        <label class="log-label">Effort (RPE 1–10) <span class="log-optional">optional</span></label>
        <div class="rpe-row" id="rpe-row">
          ${[...Array(10)].map((_,i)=>`
            <button class="rpe-btn" data-rpe="${i+1}" onclick="App.selectRPE(${i+1})">${i+1}</button>
          `).join('')}
        </div>
        <input id="log-rpe" type="hidden" value="">

        <button class="btn btn-red" style="width:100%;margin-top:20px"
                onclick="App.submitLogRun('${iso}','${dayKey}',${wn || 0},${planKm})">
          ✓ Save Run
        </button>
        <button class="btn" style="width:100%;margin-top:8px;background:transparent;color:var(--text-2)"
                onclick="document.getElementById('log-sheet').remove()">
          Cancel
        </button>
      </div>`;

    // Close on backdrop tap
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
    document.body.appendChild(sheet);
  },

  selectRPE(val) {
    document.getElementById('log-rpe').value = val;
    document.querySelectorAll('.rpe-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.rpe) === val);
    });
  },

  async submitLogRun(iso, dayKey, weekNum, planKm) {
    const km   = parseFloat(document.getElementById('log-km')?.value);
    const mins = parseFloat(document.getElementById('log-mins')?.value) || null;
    const rpe  = parseInt(document.getElementById('log-rpe')?.value) || null;

    if (!km || km <= 0) { toast('Enter a distance'); return; }
    if (!weekNum || weekNum < 1) { toast('Week data not ready'); return; }

    const btn = document.querySelector('#log-sheet .btn-red');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await API.logRun({
        telegram_id:         S.athleteId,
        week_number:         weekNum,
        day_name:            dayKey,
        planned_distance_km: planKm || null,
        actual_distance_km:  km,
        duration_minutes:    mins,
        rpe:                 rpe,
      });

      document.getElementById('log-sheet')?.remove();
      toast('✓ Run logged!');

      // Flip the calendar tile to reveal the advent image
      ScreenSchedule.revealCalDay(iso);

      // Update the log summary cache for this week
      try {
        S.logSummary = await API.getLogSummary(S.athleteId, weekNum);
      } catch(e) {}

    } catch(e) {
      toast('Could not save — check connection');
      if (btn) { btn.disabled = false; btn.textContent = '✓ Save Run'; }
    }
  },

  renderSubScreen() {
    switch(S.subTab) {
      case 'schedule': ScreenSchedule.render(); break;
      case 'coach':    ScreenCoach.render();    break;
      case 'stats':    ScreenStats.render();    break;
    }
  },

  showRaceTab() {
    document.getElementById('tab-bar').classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="race"]')?.classList.add('active');
    this.renderSubScreen();
  },

  async loadData() {
    if (!S.athleteId) return;
    try {
      const [athlete, week] = await Promise.all([
        API.getAthlete(S.athleteId),
        API.getCurrentWeek(S.athleteId),
      ]);
      S.athlete = athlete;
      S.week    = week;

      if (week?.week_number) {
        try {
          S.logSummary = await API.getLogSummary(S.athleteId, week.week_number);
        } catch(e) {}
      }
      // Cache paces for session player URLs
      try {
        const pacesRes = await fetch(`${CFG.API}/athlete/${S.athleteId}/paces`);
        if (pacesRes.ok) S.paces = await pacesRes.json();
      } catch(e) {}
    } catch(e) {
      console.error('loadData failed:', e);
    }
  },

  async init() {
    if (!S.athleteId) {
      // First launch — show onboarding
      ONB.render();
      return;
    }

    // Returning user — try to load profile
    showLoadingOverlay('Loading your plan…');
    try {
      await this.loadData();
      hideLoadingOverlay();
      if (!S.athlete) {
        // ID exists but athlete not found — re-onboard
        localStorage.removeItem('vr_athlete_id');
        S.athleteId = null;
        ONB.render();
      } else {
        this.showRaceTab();
      }
    } catch(e) {
      hideLoadingOverlay();
      this.showRaceTab(); // best-effort — show UI even if data load fails
    }
  },
};

/* ── BOOT ───────────────────────────────────────────────────── */
App.init();
