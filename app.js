'use strict';
/* Mosque prayer screen — user's design.
   Data: PRAYER_DATA (data.js) — 167 Iraqi cities, slots [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha], 24h.
   All clock math is done on the Baghdad (Asia/Baghdad) wall clock. */

const PRAYERS = [
  { key: 'fajr',    name: 'الفجر',   slot: 0 },
  { key: 'dhuhr',   name: 'الظهر',   slot: 2 },
  { key: 'asr',     name: 'العصر',   slot: 3 },
  { key: 'maghrib', name: 'المغرب',  slot: 4 },
  { key: 'isha',    name: 'العشاء',  slot: 5 },
];
const SUNRISE_SLOT = 1;

/* ---------- persisted settings ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  getJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } },
  setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

let cityId = store.get('mps_city', 'kirkuk');
let mosqueName = store.get('mps_mosque', 'مسجد النور');
const iqamaMin = Object.assign({ fajr: 10, dhuhr: 10, asr: 10, maghrib: 10, isha: 10 }, store.getJSON('mps_iqama', {}));
const offsets = Object.assign({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 }, store.getJSON('mps_offsets', {}));
const clampNum = (v, a, b) => Math.min(b, Math.max(a, v));
let hijriOffset = clampNum(parseInt(store.get('mps_hijri', '0'), 10) || 0, -3, 3);

/* background cycling: nine images per layout, Fajr-row click advances,
   persisted per layout (mps_bg landscape / mps_pbg portrait) */
const BG_COUNT = 9;
let bgIndex = clampNum(parseInt(store.get('mps_bg', '0'), 10) || 0, 0, BG_COUNT - 1);
let pbgIndex = clampNum(parseInt(store.get('mps_pbg', '0'), 10) || 0, 0, BG_COUNT - 1);
function applyBg() {
  document.body.setAttribute('data-bg', String(bgIndex + 1));
  document.body.setAttribute('data-pbg', String(pbgIndex + 1));
}

/* screen orientation: one engine, two layouts. The setting «اتجاه الشاشة»
   (mps_layout) is auto (default) / landscape / portrait / portrait-r /
   portrait-l; auto follows the viewport shape and is recomputed on resize
   / orientationchange. The two مدوّر modes are for portrait-mounted panels
   fed by TV boxes that only ever output a landscape signal — viewport
   shape says "landscape" forever, so the PAGE rotates instead: #rotator
   becomes a 100vh×100vw frame turned ±90° (data-rot on <body>), the inner
   layout is the plain portrait one, and --fw/--fh tell the portrait CSS
   the frame's true width/height because vw/vh keep meaning the real
   viewport inside the rotated frame. portrait-r = «مدوّر يمينًا»
   (rotate(90deg), clockwise); portrait-l = «مدوّر يسارًا» (-90deg). */
const LAYOUT_PREFS = ['auto', 'landscape', 'portrait', 'portrait-r', 'portrait-l'];
let layoutPref = store.get('mps_layout', 'auto');
if (!LAYOUT_PREFS.includes(layoutPref)) layoutPref = 'auto';
let layout = 'landscape';
function effectiveLayout() {
  if (layoutPref === 'portrait' || layoutPref === 'portrait-r' || layoutPref === 'portrait-l') return 'portrait';
  if (layoutPref === 'landscape') return 'landscape';
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}
function applyLayout() {
  layout = effectiveLayout();
  document.body.setAttribute('data-layout', layout);
  const rot = layoutPref === 'portrait-r' ? '90' : layoutPref === 'portrait-l' ? '-90' : '0';
  document.body.setAttribute('data-rot', rot);
  const rotated = rot !== '0';
  const fw = rotated ? window.innerHeight : window.innerWidth;
  const fh = rotated ? window.innerWidth : window.innerHeight;
  document.documentElement.style.setProperty('--fw', fw + 'px');
  document.documentElement.style.setProperty('--fh', fh + 'px');
  applyBg();
  if (layout === 'landscape') {
    /* tick() only rewrites the strip label in portrait — restore the
       landscape wording when the layout flips back */
    try {
      const lab = document.getElementById('next-label');
      if (lab && lab.textContent !== 'الأذان التالي') lab.textContent = 'الأذان التالي';
    } catch (e) {}
  }
}
applyLayout();
window.addEventListener('resize', applyLayout);
window.addEventListener('orientationchange', applyLayout);

const CITIES = (typeof PRAYER_DATA !== 'undefined') ? PRAYER_DATA : [];
const cityById = {};
CITIES.forEach(c => { cityById[c.id] = c; });
if (!cityById[cityId]) cityId = cityById['kirkuk'] ? 'kirkuk' : (CITIES[0] && CITIES[0].id);

/* ---------- Baghdad wall clock ---------- */
const dtfParts = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const dtfNames = new Intl.DateTimeFormat('ar-u-nu-latn', {
  timeZone: 'Asia/Baghdad', weekday: 'long', month: 'long',
});

function baghdadNow() {
  const now = new Date();
  const o = {};
  for (const p of dtfParts.formatToParts(now)) o[p.type] = p.value;
  let weekday = '', month = '';
  for (const p of dtfNames.formatToParts(now)) {
    if (p.type === 'weekday') weekday = p.value;
    if (p.type === 'month') month = p.value;
  }
  return {
    y: +o.year, mo: +o.month, d: +o.day,
    h: +o.hour, mi: +o.minute, s: +o.second,
    weekday, month,
  };
}

const pad = n => String(n).padStart(2, '0');

function datePlus(y, mo, d, add) {
  const t = new Date(Date.UTC(y, mo - 1, d + add));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/* Hijri (Umm al-Qura) day + month only, no year — formatted in Baghdad.
   Fully fault-isolated: the formatter is built lazily inside a try/catch, so a
   browser/WebView whose ICU lacks the islamic-umalqura calendar degrades to an
   empty Hijri line instead of throwing into the render path — a RangeError out
   of dtfHijri.formatToParts previously escaped renderDay→tick() on the very
   first call, so setInterval was never registered and the clock froze at
   00:00:00 with --:-- countdowns (prayers/sunrise already rendered). */
let dtfHijri = null, hijriBroken = false;
function hijriText(y, mo, d) {
  if (hijriBroken) return '';
  try {
    if (!dtfHijri) {
      dtfHijri = new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn', {
        timeZone: 'Asia/Baghdad', day: 'numeric', month: 'long',
      });
    }
    /* noon UTC = 15:00 in Baghdad — same civil date, safe from edge rollovers */
    const t = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    let day = '', month = '';
    for (const p of dtfHijri.formatToParts(t)) {
      if (p.type === 'day') day = p.value;
      if (p.type === 'month') month = p.value;
    }
    return (day + ' ' + month).trim();
  } catch (e) {
    hijriBroken = true;
    return '';
  }
}

function dayTimes(city, y, mo, d) {
  const key = pad(mo) + '-' + pad(d);
  let t = city.times[key];
  if (!t && key === '02-29') t = city.times['02-28']; // only Hawijah carries 02-29
  return t || null;
}

/* minutes-of-day for a prayer's adhan on a given date, offset applied */
function prayerMinutes(city, y, mo, d, p) {
  const t = dayTimes(city, y, mo, d);
  if (!t) return null;
  const [H, M] = t[p.slot].split(':').map(Number);
  return H * 60 + M + (offsets[p.key] || 0);
}

function fmt12(minsOfDay) {
  let m = ((minsOfDay % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return pad(h12) + ':' + pad(mm);
}

function fmtClock12(h, mi, s) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return pad(h12) + ':' + pad(mi) + ':' + pad(s);
}

/* countdown: >= 1h -> HH:MM, < 1h -> MM:SS, never negative */
function fmtCountdown(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec >= 3600) return pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60));
  return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
}

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const rowsEl = $('prayers');
const rowTimeEls = {};

/* brief unobtrusive toast, e.g. «خلفية 2 من 5» */
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function cycleBg() {
  if (layout === 'portrait') {
    pbgIndex = (pbgIndex + 1) % BG_COUNT;
    store.set('mps_pbg', String(pbgIndex));
    applyBg();
    showToast('خلفية ' + (pbgIndex + 1) + ' من ' + BG_COUNT);
  } else {
    bgIndex = (bgIndex + 1) % BG_COUNT;
    store.set('mps_bg', String(bgIndex));
    applyBg();
    showToast('خلفية ' + (bgIndex + 1) + ' من ' + BG_COUNT);
  }
}

PRAYERS.forEach(p => {
  const row = document.createElement('div');
  row.className = 'prow';
  row.dataset.key = p.key;
  const nm = document.createElement('span');
  nm.className = 'pname'; nm.textContent = p.name;
  const tm = document.createElement('span');
  tm.className = 'ptime num';
  row.appendChild(nm); row.appendChild(tm);
  if (p.key === 'fajr') {
    row.title = 'تغيير الخلفية';
    row.addEventListener('click', cycleBg);
  }
  rowsEl.appendChild(row);
  rowTimeEls[p.key] = tm;
});

let lastDateKey = '';

/* fill one element; a failure here must never block the other fields */
function safeSet(id, text) {
  try { const el = $(id); if (el) el.textContent = text; } catch (e) {}
}

function renderDay(bn) {
  const city = cityById[cityId];
  if (!city) return;
  PRAYERS.forEach(p => {
    try {
      const mins = prayerMinutes(city, bn.y, bn.mo, bn.d, p);
      rowTimeEls[p.key].textContent = mins === null ? '--:--' : fmt12(mins);
    } catch (e) {}
  });
  try {
    const t = dayTimes(city, bn.y, bn.mo, bn.d);
    if (t) {
      const [H, M] = t[SUNRISE_SLOT].split(':').map(Number);
      safeSet('sunrise', fmt12(H * 60 + M));
    }
  } catch (e) {}
  /* every date field is filled independently — the Hijri computation in
     particular can never take the Gregorian day number or month down with it */
  safeSet('weekday', bn.weekday);
  safeSet('daynum', bn.d);
  safeSet('monthname', bn.month);
  try {
    const hd = datePlus(bn.y, bn.mo, bn.d, hijriOffset);
    safeSet('hijri', hijriText(hd.y, hd.mo, hd.d));
  } catch (e) {}
  safeSet('mosquename', mosqueName);
}

/* Iqama-window alert: while the current prayer's iqama countdown runs
   (now ∈ [adhan, adhan+iqama)) a center-screen «ضع الهاتف على الصامت»
   warning shows and the iqama cell turns red. The state is a pure function
   of the current time, recomputed on every tick — nothing is stored, so a
   reload in the middle of the window lands in the correct state. A prayer
   with 0 iqama minutes has an empty window and never alerts. */
let alertState = null;
function setIqamaAlert(on) {
  if (on === alertState) return;
  alertState = on;
  try {
    const veil = $('iqamaveil'), box = $('iqama-alert'), col = $('iqama-col'), ncol = $('next-col');
    if (veil) veil.hidden = !on;
    if (box) box.hidden = !on;
    if (col) col.classList.toggle('alert', on);
    if (ncol) ncol.classList.toggle('alert', on);
  } catch (e) {}
}

function tick() {
  let bn;
  try { bn = baghdadNow(); } catch (e) { return; }
  /* the clock is set FIRST and independently — no date/Hijri failure below
     may ever freeze it */
  safeSet('clock', fmtClock12(bn.h, bn.mi, bn.s));

  const dateKey = bn.y + '-' + bn.mo + '-' + bn.d + '|' + cityId + '|' + hijriOffset;
  if (dateKey !== lastDateKey) {
    lastDateKey = dateKey;
    try { renderDay(bn); } catch (e) {}
  }

  const city = cityById[cityId];
  if (!city) { setIqamaAlert(false); return; }
  const nowSec = bn.h * 3600 + bn.mi * 60 + bn.s;

  const evs = PRAYERS.map(p => {
    const mins = prayerMinutes(city, bn.y, bn.mo, bn.d, p);
    return { p, sec: mins === null ? null : mins * 60 };
  }).filter(e => e.sec !== null);
  if (!evs.length) { setIqamaAlert(false); return; }

  let cdAdhan = null, cdIqama = null, inIqamaWindow = false;
  const idx = evs.findIndex(e => e.sec > nowSec);

  if (idx === -1) {
    /* after the last adhan of the day: maybe still inside Isha's iqama window */
    const last = evs[evs.length - 1];
    const lastIqamaEnd = last.sec + (iqamaMin[last.p.key] || 0) * 60;
    const tm = datePlus(bn.y, bn.mo, bn.d, 1);
    const fajrTomorrow = prayerMinutes(city, tm.y, tm.mo, tm.d, PRAYERS[0]);
    const adhanAbs = (fajrTomorrow === null) ? null : (86400 - nowSec) + fajrTomorrow * 60;
    if (nowSec < lastIqamaEnd) {
      cdIqama = lastIqamaEnd - nowSec;
      cdAdhan = adhanAbs;
      inIqamaWindow = true;
    } else {
      cdAdhan = adhanAbs;
      cdIqama = adhanAbs === null ? null : adhanAbs + (iqamaMin[PRAYERS[0].key] || 0) * 60;
    }
  } else {
    const next = evs[idx];
    const prev = idx > 0 ? evs[idx - 1] : null;
    if (prev && nowSec < prev.sec + (iqamaMin[prev.p.key] || 0) * 60) {
      /* inside the previous prayer's iqama window: iqama counts that window,
         next-adhan already targets the following prayer */
      cdIqama = prev.sec + (iqamaMin[prev.p.key] || 0) * 60 - nowSec;
      cdAdhan = next.sec - nowSec;
      inIqamaWindow = true;
    } else {
      cdAdhan = next.sec - nowSec;
      cdIqama = cdAdhan + (iqamaMin[next.p.key] || 0) * 60;
    }
  }

  /* the next prayer's name — displayed by the portrait bottom strip
     (in the iqama window the «next» adhan is still the following prayer,
     matching what cdAdhan counts to) */
  const nextName = idx === -1 ? PRAYERS[0].name : evs[idx].p.name;
  safeSet('nextname', nextName);

  if (layout === 'portrait') {
    /* the portrait strip has ONE countdown cell («الصلاة القادمة»): outside
       the window it counts to the next adhan; inside the iqama window it
       becomes the iqama countdown itself and burns red via .alert */
    if (inIqamaWindow) {
      safeSet('next-label', 'الإقامة');
      safeSet('cd-adhan', cdIqama === null ? '--:--' : fmtCountdown(cdIqama));
    } else {
      safeSet('next-label', 'الصلاة القادمة');
      safeSet('cd-adhan', cdAdhan === null ? '--:--' : fmtCountdown(cdAdhan));
    }
  } else {
    safeSet('cd-adhan', cdAdhan === null ? '--:--' : fmtCountdown(cdAdhan));
  }
  safeSet('cd-iqama', cdIqama === null ? '--:--' : fmtCountdown(cdIqama));
  setIqamaAlert(inIqamaWindow);
}

/* ---------- settings panel ---------- */
const panel = $('panel');
function togglePanel(force) {
  const show = typeof force === 'boolean' ? force : panel.hidden;
  panel.hidden = !show;
}
$('gear').addEventListener('click', () => togglePanel());
$('clock').addEventListener('click', () => togglePanel());
$('p-close').addEventListener('click', () => togglePanel(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') togglePanel(false); });

const mosqueInput = $('p-mosque');
mosqueInput.value = mosqueName;
mosqueInput.addEventListener('input', () => {
  mosqueName = mosqueInput.value.trim() || 'مسجد النور';
  store.set('mps_mosque', mosqueName);
  $('mosquename').textContent = mosqueName;
});

/* screen orientation: تلقائي / أفقي / عمودي / مدوّر يمينًا / مدوّر يسارًا —
   one setting shared by both layouts and the rotated frame */
const layoutBtns = document.querySelectorAll('#p-layout button');
function markLayoutBtns() {
  layoutBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-lp') === layoutPref));
}
layoutBtns.forEach(b => b.addEventListener('click', () => {
  layoutPref = b.getAttribute('data-lp');
  store.set('mps_layout', layoutPref);
  markLayoutBtns();
  applyLayout();
  tick();
}));
markLayoutBtns();

/* city search + list */
const citiesEl = $('p-cities');
function renderCities(filter) {
  citiesEl.innerHTML = '';
  const q = (filter || '').trim();
  CITIES.forEach(c => {
    if (q && !(c.nameAr.includes(q) || (c.nameEn || '').toLowerCase().includes(q.toLowerCase()))) return;
    const b = document.createElement('button');
    b.className = 'city-item' + (c.id === cityId ? ' active' : '');
    b.textContent = c.nameAr;
    b.addEventListener('click', () => {
      cityId = c.id;
      store.set('mps_city', cityId);
      lastDateKey = ''; // force re-render
      renderCities(q);
      tick();
    });
    citiesEl.appendChild(b);
  });
}
$('p-search').addEventListener('input', e => renderCities(e.target.value));
renderCities('');

/* per-prayer iqama + offset steppers */
const rowsCtl = $('p-rows');
function stepper(label, unit, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'p-step-line';
  const lab = document.createElement('span'); lab.textContent = label;
  const step = document.createElement('div'); step.className = 'step';
  const dec = document.createElement('button'); dec.textContent = '−'; dec.setAttribute('aria-label', 'إنقاص');
  const val = document.createElement('span'); val.className = 'val num'; val.textContent = value;
  const inc = document.createElement('button'); inc.textContent = '+'; inc.setAttribute('aria-label', 'زيادة');
  const unitEl = document.createElement('span'); unitEl.className = 'unit'; unitEl.textContent = unit;
  dec.addEventListener('click', () => { val.textContent = onChange(-1); });
  inc.addEventListener('click', () => { val.textContent = onChange(1); });
  step.appendChild(dec); step.appendChild(val); step.appendChild(inc); step.appendChild(unitEl);
  wrap.appendChild(lab); wrap.appendChild(step);
  return wrap;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Hijri date correction: −3..+3 days, one per tap, persisted */
$('p-hijri').appendChild(stepper('تعديل التاريخ الهجري', 'يوم', hijriOffset, d => {
  hijriOffset = clamp(hijriOffset + d, -3, 3);
  store.set('mps_hijri', String(hijriOffset));
  lastDateKey = ''; // re-render the Hijri date
  tick();
  return hijriOffset;
}));

PRAYERS.forEach(p => {
  const block = document.createElement('div');
  block.className = 'p-prow';
  const title = document.createElement('div');
  title.className = 'p-pname'; title.textContent = p.name;
  block.appendChild(title);
  block.appendChild(stepper('الإقامة بعد الأذان', 'دقيقة', iqamaMin[p.key], d => {
    iqamaMin[p.key] = clamp((iqamaMin[p.key] || 0) + d, 0, 60);
    store.setJSON('mps_iqama', iqamaMin);
    tick();
    return iqamaMin[p.key];
  }));
  block.appendChild(stepper('تعديل الوقت', 'دقيقة', offsets[p.key], d => {
    offsets[p.key] = clamp((offsets[p.key] || 0) + d, -30, 30);
    store.setJSON('mps_offsets', offsets);
    lastDateKey = ''; // re-render displayed times
    tick();
    return offsets[p.key];
  }));
  rowsCtl.appendChild(block);
});

/* ---------- run ---------- */
/* the interval is registered FIRST and every invocation is guarded, so no
   single failure — in this call or any later one — can stop the loop */
setInterval(() => { try { tick(); } catch (e) {} }, 500);
try { tick(); } catch (e) {}
