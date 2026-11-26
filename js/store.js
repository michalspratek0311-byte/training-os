/**
 * Training OS v2.0 — Datové jádro, API synchronizace, multi-gym logika a sdílené utility
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'training_os_v2_state';

  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyyKecUhMJQJdqEDZ2nvwDCC5ddp4NGM4z1fPRA2zqRQsD14f1Qvzcb11SiR8lql132MA/exec';
  const DEFAULT_API_TOKEN = '1974';

  const CNS_PRIORITY_MAP = {
    'Dřepový vzor': 1,
    'Kyčelní ohyb': 2,
    'Vertikální tah': 3,
    'Horizontální tlak': 4,
    'Horizontální tah': 5,
    'Vertikální tlak': 6,
    'Tlakový vzor (ramena)': 6,
    'Alternativní tlak': 7,
    'Izolace přední': 8,
    'Izolace zadní': 9,
    'Izolace vršek': 10,
    'Biceps': 11,
    'Triceps': 12,
    'Zadní delty': 13,
    'Čistá flexe břicha': 14,
    'Spodní břicho / Flexe kyčle': 15,
    'Anti-rotace / Anti-extenze': 16,
    'Anti-rotace': 16,
    'Anti-úklon / Boční stabilita': 17,
    'Izolace adduktory': 18,
    'Izolace třísel (Addukce)': 18,
    'Izolace hýždí': 19,
    'Izolace bočních hýždí (Abdukce)': 19,
    'Lýtka': 20,
    'Přední strana holeně': 21
  };

  const DEFAULT_SCHEDULE = [
    { phase: 'Fáze 1', unit: 'Síla', focus: 'Full Body A', context: 'Po dni volna (F7), maximální připravenost CNS pro těžký silový stimul celého těla.' },
    { phase: 'Fáze 2', unit: 'Vytrvalost', focus: 'Delší objem – primárně Kolo (Zóna 2)', context: 'Zóna 2 pod VT1 (striktně ≤ 132 t/m). Při únavě po F1 ubrat 5–10 W.' },
    { phase: 'Fáze 3', unit: 'Síla', focus: 'Upper (Vršek)', context: 'Vršek regeneroval 48 hodin. Těžké vícekloubové cviky na RIR 1, izolace RIR 0.' },
    { phase: 'Fáze 4', unit: 'Intenzita', focus: 'VO2max Intervaly (primárně Kolo / Trenažér)', context: 'Nohy odpočívaly 72 hodin. Varianty 4A 30/15, 4B 4×4, 4C Hard-Start, 4D 30/30.' },
    { phase: 'Fáze 5', unit: 'Vytrvalost', focus: 'Kolo – Active Flush (Z1/Z2)', context: 'Aktivní regenerace po VO2max a podpora aerobního objemu.' },
    { phase: 'Fáze 6', unit: 'Síla', focus: 'Full Body B', context: 'Druhý silový stimul s důrazem na zadní řetězec. Při únavě po F4/F5 ubrat RDL.' },
    { phase: 'Fáze 7', unit: 'Kompenzace', focus: 'Volno + 15min kompenzační protokol', context: 'Úplné volno, regenerace CNS a dekomprese páteře.' }
  ];

  function createDefaultState() {
    return {
      settings: {
        apiUrl: DEFAULT_API_URL,
        apiToken: DEFAULT_API_TOKEN,
        ftp: 265,
        map: 360,
        vt1: 132,
        sound: true,
        voice: true,
        restCompound: 150,
        restIso: 75
      },
      ui: {
        activeTab: 'workout',
        currentPhaseIdx: 0,
        readiness: 'full', // full | mild | high
        activeGymId: '',
        lastSyncAt: '',
        syncStatus: 'idle' // idle | syncing | online | pending | error
      },
      data: {
        schedule: DEFAULT_SCHEDULE.slice(),
        planStrength: { F1: [], F3: [], F6: [] },
        zones: [],
        ideas: [],
        gyms: [],
        catalog: [],
        strengthLogs: [],
        activityLogs: [],
        big3Dates: []
      },
      outbox: []
    };
  }

  function loadState() {
    const def = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      return {
        settings: Object.assign({}, def.settings, parsed.settings || {}),
        ui: Object.assign({}, def.ui, parsed.ui || {}),
        data: Object.assign({}, def.data, parsed.data || {}),
        outbox: Array.isArray(parsed.outbox) ? parsed.outbox : []
      };
    } catch (err) {
      console.warn('Chyba načtení localStorage, používám výchozí stav:', err);
      return def;
    }
  }

  /* ==================== UTILITY ==================== */

  function esc(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDateCZ(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return parseInt(m[3], 10) + '. ' + parseInt(m[2], 10) + '. ' + m[1];
  }

  function formatDateShortCZ(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return parseInt(m[3], 10) + '. ' + parseInt(m[2], 10) + '.';
  }

  function parseISODate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0);
  }

  function daysBetween(isoFrom, isoTo) {
    const a = parseISODate(isoFrom);
    const b = parseISODate(isoTo || todayISO());
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function getISOWeekInfo(iso) {
    const d = parseISODate(iso);
    if (!d) return { year: 0, week: 0, key: '' };
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    const year = date.getUTCFullYear();
    return {
      year: year,
      week: week,
      key: year + ' - T' + String(week).padStart(2, '0')
    };
  }

  function uid(prefix) {
    const rnd = Math.random().toString(36).slice(2, 7);
    const ts = Date.now().toString(36).slice(-4);
    return (prefix ? prefix + '_' : '') + ts + rnd;
  }

  function toNum(v) {
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  function calcE1RM(weight, reps) {
    const w = toNum(weight);
    const r = toNum(reps);
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return round1(w);
    return round1(w * (1 + r / 30));
  }

  function calcTonnage(weight, reps) {
    return round2(toNum(weight) * toNum(reps));
  }

  function computeMachineKey(resistanceType, gymName, exerciseName) {
    if (resistanceType === 'Volna_Vaha' || !gymName) return String(exerciseName || '').trim();
    return String(gymName).trim() + ' - ' + String(exerciseName || '').trim();
  }

  function getCnsPriority(pattern) {
    return CNS_PRIORITY_MAP[pattern] !== undefined ? CNS_PRIORITY_MAP[pattern] : 99;
  }

  function phaseIdxToSplitKey(idx) {
    if (idx === 0) return 'Full Body (A)';
    if (idx === 2) return 'Upper';
    if (idx === 5) return 'Full Body (B)';
    return '';
  }

  function phaseIdxToCode(idx) {
    return 'F' + (idx + 1);
  }

  /* ==================== AUDIO, HLAS & WAKE LOCK ==================== */

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  const audio = {
    beep: function (freq, durationMs, type, gainVal) {
      if (!TOS.state.settings.sound) return;
      try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq || 880;
        gain.gain.setValueAtTime(gainVal || 0.16, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (durationMs || 160) / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (durationMs || 160) / 1000);
      } catch (e) {}
    },
    chime: function () {
      if (!TOS.state.settings.sound) return;
      audio.beep(660, 140, 'sine', 0.18);
      setTimeout(function () { audio.beep(880, 180, 'sine', 0.18); }, 150);
      setTimeout(function () { audio.beep(1100, 260, 'sine', 0.18); }, 320);
    },
    speak: function (text) {
      if (!TOS.state.settings.voice || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'cs-CZ';
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  };

  let wakeLockSentinel = null;
  const wakeLock = {
    acquire: async function () {
      try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', function () { wakeLockSentinel = null; });
        }
      } catch (e) {}
    },
    release: async function () {
      try {
        if (wakeLockSentinel) {
          await wakeLockSentinel.release();
          wakeLockSentinel = null;
        }
      } catch (e) {}
    }
  };

  /* ==================== PLOVOUCÍ PAUZOVAČ ==================== */

  const restTimer = {
    endTime: 0,
    intervalId: null,
    label: 'PAUZA',
    start: function (seconds, label) {
      const secs = Math.max(5, parseInt(seconds, 10) || 120);
      this.label = label || 'PAUZA';
      this.endTime = Date.now() + secs * 1000;
      const el = document.getElementById('floating-timer');
      const lbl = document.getElementById('ft-label');
      if (lbl) lbl.textContent = this.label;
      if (el) el.classList.remove('hidden');
      wakeLock.acquire();
      if (this.intervalId) clearInterval(this.intervalId);
      this.tick();
      this.intervalId = setInterval(() => this.tick(), 250);
    },
    adjust: function (deltaSec) {
      if (!this.endTime) return;
      this.endTime = Math.max(Date.now() + 1000, this.endTime + deltaSec * 1000);
      this.tick();
    },
    tick: function () {
      const remMs = this.endTime - Date.now();
      const timeEl = document.getElementById('ft-time');
      if (remMs <= 0) {
        this.stop();
        audio.chime();
        audio.speak('Pauza skončila, další série.');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        toast('Pauza skončila — jdeme na další sérii!');
        return;
      }
      const totalSec = Math.ceil(remMs / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      if (timeEl) timeEl.textContent = mm + ':' + ss;
    },
    stop: function () {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.endTime = 0;
      const el = document.getElementById('floating-timer');
      if (el) el.classList.add('hidden');
      wakeLock.release();
    }
  };

  /* ==================== UI HELPERY (TOAST, MODAL) ==================== */

  let toastTimer = null;
  function toast(msg, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 2600);
  }

  function openModal(title, htmlContent, onMount) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (!overlay || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = htmlContent;
    overlay.classList.remove('hidden');
    if (typeof onMount === 'function') onMount(bodyEl);
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ==================== HLAVNÍ STORE OBJEKT ==================== */

  const TOS = {
    state: loadState(),
    views: {},
    _enrichedCache: null,
    _syncing: false,

    // Utility
    esc: esc,
    todayISO: todayISO,
    formatDateCZ: formatDateCZ,
    formatDateShortCZ: formatDateShortCZ,
    daysBetween: daysBetween,
    getISOWeekInfo: getISOWeekInfo,
    uid: uid,
    toNum: toNum,
    calcE1RM: calcE1RM,
    calcTonnage: calcTonnage,
    computeMachineKey: computeMachineKey,
    getCnsPriority: getCnsPriority,
    phaseIdxToSplitKey: phaseIdxToSplitKey,
    phaseIdxToCode: phaseIdxToCode,

    // Hardware & UI
    audio: audio,
    wakeLock: wakeLock,
    restTimer: restTimer,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,

    save: function () {
      this._enrichedCache = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error('Chyba ukládání stavu:', e);
      }
      this.updateTopbar();
    },

    registerView: function (name, renderFn) {
      this.views[name] = renderFn;
    },

    switchTab: function (tabName) {
      this.state.ui.activeTab = tabName;
      document.querySelectorAll('.tab-view').forEach(function (sec) {
        sec.classList.toggle('active', sec.id === 'tab-' + tabName);
      });
      document.querySelectorAll('.nav-item').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      this.save();
      this.renderActiveTab();
      window.scrollTo({ top: 0, behavior: 'instant' });
    },

    renderActiveTab: function () {
      const tab = this.state.ui.activeTab || 'workout';
      const container = document.getElementById('tab-' + tab);
      if (!container) return;
      if (typeof this.views[tab] === 'function') {
        this.views[tab](container);
      } else {
        container.innerHTML =
          '<div class="card">' +
          '<h3 class="card-title">Modul „' + esc(tab) + '“ čeká na připojení</h3>' +
          '<p class="muted small" style="margin:6px 0 0">Datové jádro je aktivní. Načteno: <strong>' +
          this.state.data.gyms.length + '</strong> posiloven, <strong>' +
          this.state.data.catalog.length + '</strong> cviků v katalogu a <strong>' +
          this.state.data.strengthLogs.length + '</strong> sérií v historii.</p>' +
          '</div>';
      }
    },

    renderAll: function () {
      this.updateTopbar();
      this.renderActiveTab();
    },

    updateTopbar: function () {
      const gym = this.getActiveGym();
      const gymLabel = document.getElementById('quick-gym-label');
      if (gymLabel) gymLabel.textContent = gym ? gym.name : 'Všechna fitka';

      const sub = document.getElementById('topbar-subtitle');
      const sched = this.state.data.schedule[this.state.ui.currentPhaseIdx];
      if (sub && sched) {
        sub.textContent = sched.phase + ' • ' + sched.unit;
      }

      const outboxLen = this.state.outbox.length;
      const badge = document.getElementById('outbox-badge');
      if (badge) {
        badge.textContent = String(outboxLen);
        badge.classList.toggle('hidden', outboxLen === 0);
      }

      const dot = document.getElementById('sync-dot');
      if (dot) {
        dot.className = 'sync-dot';
        if (this.state.ui.syncStatus === 'error') dot.classList.add('error');
        else if (outboxLen > 0) dot.classList.add('pending');
        else if (this.state.ui.lastSyncAt) dot.classList.add('online');
      }
    },

    /* ==================== MULTI-GYM & ANALYTICKÉ DOTAZY ==================== */

    getActiveGym: function () {
      const id = this.state.ui.activeGymId;
      if (!id) return null;
      return this.state.data.gyms.find(function (g) { return g.id === id; }) || null;
    },

    setActiveGym: function (gymId) {
      this.state.ui.activeGymId = gymId || '';
      this.save();
      this.renderActiveTab();
    },

    getGymById: function (id) {
      return this.state.data.gyms.find(function (g) { return g.id === id; }) || null;
    },

    getCatalogById: function (id) {
      return this.state.data.catalog.find(function (c) { return c.id === id; }) || null;
    },

    /**
     * Vrací cviky z Katalog_Cviku pro daný split (např. 'Full Body (A)', 'Upper', 'Full Body (B)')
     * filtrované na aktuální posilovnu + všechny Volné váhy, seřazené podle Priorita_CNS.
     */
    getExercisesForSplit: function (splitKey, gymId) {
      const gId = gymId !== undefined ? gymId : this.state.ui.activeGymId;
      return this.state.data.catalog
        .filter(function (ex) {
          const matchesSplit = !splitKey ||
            (Array.isArray(ex.targetSplits) && ex.targetSplits.indexOf(splitKey) !== -1) ||
            ex.split === splitKey;
          if (!matchesSplit) return false;
          if (!gId) return true;
          return ex.resistanceType === 'Volna_Vaha' || !ex.gymId || ex.gymId === gId;
        })
        .sort(function (a, b) {
          const pa = a.cnsPriority !== undefined ? a.cnsPriority : 99;
          const pb = b.cnsPriority !== undefined ? b.cnsPriority : 99;
          if (pa !== pb) return pa - pb;
          return String(a.name).localeCompare(String(b.name), 'cs');
        });
    },

    /**
     * Vrací obohacenou historii všech silových sérií s přísnou izolací přes Stroj_Gym_Klic:
     * - isProgress (překonání minulé stejné série na stejném stroji/fitku)
     * - isPR (absolutní maximum e1RM — nebo opakování u vlastní váhy — na daném Stroj_Gym_Klic)
     * - weekKey (YYYY - TWW)
     * - isUniqueSession (první záznam daného dne + splitu)
     */
    getEnrichedLogs: function () {
      if (this._enrichedCache) return this._enrichedCache;

      const logs = this.state.data.strengthLogs.slice().sort(function (a, b) {
        if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
        return (a.rowNumber || 0) - (b.rowNumber || 0);
      });

      const lastByMachineAndType = {};
      const maxScoreByMachine = {};
      const seenSession = {};

      // První průchod: absolutní maximum na každý Stroj_Gym_Klic
      logs.forEach(function (l) {
        const key = l.machineKey || l.exerciseName;
        const score = l.weight > 0 ? (l.e1rm || calcE1RM(l.weight, l.reps)) : l.reps;
        if (score > 0 && (!maxScoreByMachine[key] || score > maxScoreByMachine[key])) {
          maxScoreByMachine[key] = score;
        }
      });

      // Druhý průchod: chronologický progres, PR, týden a unikátní trénink
      const enriched = logs.map(function (l) {
        const key = l.machineKey || l.exerciseName;
        const setType = l.setType || 'Top Set';
        const pairKey = key + '||' + setType;
        const isBW = toNum(l.weight) <= 0;
        const e1rm = isBW ? 0 : (l.e1rm || calcE1RM(l.weight, l.reps));
        const score = isBW ? toNum(l.reps) : e1rm;

        const prev = lastByMachineAndType[pairKey] || null;
        let isProgress = false;
        if (prev && score > 0) {
          const prevScore = isBW ? toNum(prev.reps) : (prev.e1rm || calcE1RM(prev.weight, prev.reps));
          if (score > prevScore) isProgress = true;
        }
        lastByMachineAndType[pairKey] = l;

        const isPR = score > 0 && score >= (maxScoreByMachine[key] || 0);
        const wk = getISOWeekInfo(l.date);
        const sessKey = l.date + '||' + (l.split || '');
        const isUniqueSession = !seenSession[sessKey];
        seenSession[sessKey] = true;

        let perfText = '';
        if (isBW) {
          perfText = 'Vlastní váha × ' + l.reps + (l.rir !== '' ? ' (RIR ' + l.rir + ')' : '');
        } else {
          perfText = l.weight + ' kg × ' + l.reps + (l.rir !== '' ? ' (RIR ' + l.rir + ')' : '');
        }

        return Object.assign({}, l, {
          e1rm: e1rm,
          tonnage: l.tonnage || calcTonnage(l.weight, l.reps),
          isBW: isBW,
          isProgress: isProgress,
          isPR: isPR,
          weekKey: wk.key,
          weekYear: wk.year,
          weekNum: wk.week,
          isUniqueSession: isUniqueSession,
          perfText: perfText
        });
      });

      this._enrichedCache = enriched;
      return enriched;
    },

    getLastSetForMachine: function (machineKey, setType) {
      const logs = this.getEnrichedLogs();
      const targetType = setType || 'Top Set';
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].machineKey === machineKey && logs[i].setType === targetType) {
          return logs[i];
        }
      }
      return null;
    },

    getBestPRForMachine: function (machineKey) {
      const logs = this.getEnrichedLogs();
      let best = null;
      logs.forEach(function (l) {
        if (l.machineKey !== machineKey) return;
        const score = l.isBW ? l.reps : l.e1rm;
        const bestScore = best ? (best.isBW ? best.reps : best.e1rm) : -1;
        if (score > bestScore) best = l;
      });
      return best;
    },

    /**
     * Stav regenerace (48h / 72h+) pro Upper a Lower/Full Body + týdenní frekvence
     */
    getRecoveryStatus: function () {
      const logs = this.getEnrichedLogs();
      const today = todayISO();
      let lastUpperDate = '';
      let lastLowerDate = '';
      let lastAny = null;

      logs.forEach(function (l) {
        if (!l.date) return;
        const sp = String(l.split || '');
        if ((sp === 'Upper' || sp.indexOf('Full Body') !== -1) && l.date > lastUpperDate) {
          lastUpperDate = l.date;
        }
        if ((sp === 'Lower' || sp.indexOf('Full Body') !== -1) && l.date > lastLowerDate) {
          lastLowerDate = l.date;
        }
        if (!lastAny || l.date >= lastAny.date) lastAny = l;
      });

      function classify(lastDate) {
        if (!lastDate) return { days: null, date: '', label: 'Bez záznamu', level: 'muted' };
        const d = daysBetween(lastDate, today);
        if (d >= 3) return { days: d, date: lastDate, label: 'Plně zregenerováno (72h+)', level: 'green' };
        if (d === 2) return { days: d, date: lastDate, label: 'Probíhá obnova (48h)', level: 'gold' };
        return { days: d, date: lastDate, label: 'Akutní únava po zátěži', level: 'red' };
      }

      const nowWk = getISOWeekInfo(today);
      let w0 = 0, w1 = 0, w2 = 0;
      logs.forEach(function (l) {
        if (!l.isUniqueSession) return;
        if (l.weekYear === nowWk.year) {
          if (l.weekNum === nowWk.week) w0++;
          else if (l.weekNum === nowWk.week - 1) w1++;
          else if (l.weekNum === nowWk.week - 2) w2++;
        }
      });

      return {
        upper: classify(lastUpperDate),
        lower: classify(lastLowerDate),
        weeklyCounts: { thisWeek: w0, lastWeek: w1, twoWeeksAgo: w2 },
        lastSession: lastAny
      };
    },

    /* ==================== MUTACE (OPTIMISTIC UI + OFFLINE FRONTA) ==================== */

    enqueue: function (actionObj) {
      this.state.outbox.push(actionObj);
      this.state.ui.syncStatus = 'pending';
      this.save();
      if (navigator.onLine && this.state.settings.apiUrl) {
        this.pushOutbox(true);
      }
    },

    logSet: function (payload) {
      const cat = this.getCatalogById(payload.exerciseId);
      const gym = this.getGymById(payload.gymId);
      const gymName = gym ? gym.name : '';
      const exName = cat ? cat.name : (payload.exerciseName || '');
      const resType = cat ? cat.resistanceType : (payload.gymId ? 'Stroj/Kladka' : 'Volna_Vaha');
      const machineKey = computeMachineKey(resType, gymName, exName);
      const setType = payload.setType === 'Back-off Set' ? 'Back-off Set' : 'Top Set';
      const weight = toNum(payload.weight);
      const reps = toNum(payload.reps);
      const e1rm = calcE1RM(weight, reps);
      const tonnage = calcTonnage(weight, reps);

      const prev = this.getLastSetForMachine(machineKey, setType);
      const prevPerformance = prev
        ? (prev.isBW ? ('Vlastní váha × ' + prev.reps) : (prev.weight + ' kg × ' + prev.reps + ' (1RM: ' + prev.e1rm + ' kg)'))
        : '';

      const id = uid('s');
      const maxRow = this.state.data.strengthLogs.reduce(function (m, l) { return Math.max(m, l.rowNumber || 0); }, 1000);
      const setupNote = String(payload.setupNote || '').trim();

      const record = {
        id: id,
        rowNumber: maxRow + 1,
        date: payload.date || todayISO(),
        gymId: payload.gymId || (cat ? cat.gymId : '') || '',
        gymName: gymName,
        split: payload.split || (cat ? cat.split : '') || '',
        muscle: payload.muscle || (cat ? cat.muscle : '') || '',
        exerciseId: payload.exerciseId || '',
        exerciseName: exName,
        resistanceType: resType,
        machineKey: machineKey,
        setType: setType,
        weight: weight,
        reps: reps,
        rir: payload.rir !== undefined && payload.rir !== '' ? String(payload.rir) : '0',
        prevPerformance: prevPerformance,
        e1rm: e1rm,
        tonnage: tonnage,
        setupNote: setupNote
      };

      this.state.data.strengthLogs.push(record);

      // Obousměrná aktualizace nastavení stroje v lokálním katalogu
      if (cat && setupNote && cat.machineSetup !== setupNote) {
        cat.machineSetup = setupNote;
      }

      this.enqueue({
        action: 'log_set',
        id: record.id,
        date: record.date,
        gymId: record.gymId,
        gymName: record.gymName,
        split: record.split,
        muscle: record.muscle,
        exerciseId: record.exerciseId,
        exerciseName: record.exerciseName,
        resistanceType: record.resistanceType,
        machineKey: record.machineKey,
        setType: record.setType,
        weight: record.weight,
        reps: record.reps,
        rir: record.rir,
        prevPerformance: record.prevPerformance,
        e1rm: record.e1rm,
        tonnage: record.tonnage,
        setupNote: record.setupNote
      });

      this.renderActiveTab();
      return record;
    },

    updateSet: function (id, patch) {
      const idx = this.state.data.strengthLogs.findIndex(function (l) { return l.id === id; });
      if (idx === -1) return false;
      const rec = this.state.data.strengthLogs[idx];

      if (patch.weight !== undefined) rec.weight = toNum(patch.weight);
      if (patch.reps !== undefined) rec.reps = toNum(patch.reps);
      if (patch.rir !== undefined) rec.rir = String(patch.rir);
      if (patch.setType !== undefined) rec.setType = patch.setType === 'Back-off Set' ? 'Back-off Set' : 'Top Set';
      if (patch.setupNote !== undefined) {
        rec.setupNote = String(patch.setupNote).trim();
        const cat = this.getCatalogById(rec.exerciseId);
        if (cat && rec.setupNote) cat.machineSetup = rec.setupNote;
      }
      rec.e1rm = calcE1RM(rec.weight, rec.reps);
      rec.tonnage = calcTonnage(rec.weight, rec.reps);

      this.enqueue({
        action: 'update_set',
        id: id,
        weight: rec.weight,
        reps: rec.reps,
        rir: rec.rir,
        setType: rec.setType,
        setupNote: rec.setupNote
      });

      this.renderActiveTab();
      return true;
    },

    deleteSet: function (id) {
      this.state.data.strengthLogs = this.state.data.strengthLogs.filter(function (l) { return l.id !== id; });
      this.enqueue({ action: 'delete_set', id: id });
      this.renderActiveTab();
    },

    addExercise: function (payload) {
      const existing = this.state.data.catalog.map(function (c) { return c.id; });
      let maxNum = 0;
      existing.forEach(function (id) {
        if (String(id).indexOf('EX_') === 0) {
          const n = parseInt(String(id).slice(3), 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      const newId = 'EX_' + String(maxNum + 1).padStart(2, '0');
      const resType = payload.resistanceType === 'Volna_Vaha' ? 'Volna_Vaha' : 'Stroj/Kladka';
      const gymId = resType === 'Volna_Vaha' ? '' : (payload.gymId || '');
      const gym = this.getGymById(gymId);
      const gymName = gym ? gym.name : '';
      const targetSplits = Array.isArray(payload.targetSplits) ? payload.targetSplits : [];
      const split = payload.split || (targetSplits[0] || 'Upper');

      const ex = {
        id: newId,
        name: String(payload.name || '').trim(),
        split: split,
        muscle: String(payload.muscle || '').trim(),
        resistanceType: resType,
        safetyProtocol: String(payload.safetyProtocol || '').trim(),
        gymId: gymId,
        gymName: gymName,
        machineKey: computeMachineKey(resType, gymName, payload.name),
        machineSetup: String(payload.machineSetup || '').trim(),
        pattern: String(payload.pattern || '').trim(),
        targetSplits: targetSplits,
        targetSetsReps: String(payload.targetSetsReps || '').trim(),
        targetRir: String(payload.targetRir || '').trim(),
        biomechanics: String(payload.biomechanics || '').trim(),
        cnsPriority: getCnsPriority(payload.pattern)
      };

      this.state.data.catalog.push(ex);
      this.enqueue(Object.assign({ action: 'add_exercise' }, ex));
      this.renderActiveTab();
      return ex;
    },

    updateExerciseSetup: function (exerciseId, patch) {
      const cat = this.getCatalogById(exerciseId);
      if (!cat) return false;
      if (patch.machineSetup !== undefined) cat.machineSetup = String(patch.machineSetup).trim();
      if (patch.biomechanics !== undefined) cat.biomechanics = String(patch.biomechanics).trim();
      if (patch.targetSetsReps !== undefined) cat.targetSetsReps = String(patch.targetSetsReps).trim();
      if (patch.targetRir !== undefined) cat.targetRir = String(patch.targetRir).trim();

      this.enqueue({
        action: 'update_setup',
        exerciseId: exerciseId,
        machineSetup: cat.machineSetup,
        biomechanics: cat.biomechanics,
        targetSetsReps: cat.targetSetsReps,
        targetRir: cat.targetRir
      });
      this.renderActiveTab();
      return true;
    },

    addGym: function (name, note) {
      let maxNum = 0;
      this.state.data.gyms.forEach(function (g) {
        if (String(g.id).indexOf('GYM_') === 0) {
          const n = parseInt(String(g.id).slice(4), 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      const gym = {
        id: 'GYM_' + (maxNum + 1),
        name: String(name || '').trim(),
        note: String(note || '').trim()
      };
      this.state.data.gyms.push(gym);
      this.state.ui.activeGymId = gym.id;
      this.enqueue({ action: 'add_gym', id: gym.id, name: gym.name, note: gym.note });
      this.renderAll();
      return gym;
    },

    logActivity: function (payload) {
   const dateStr = payload.date || todayISO();
   const item = {
     id: payload.id || uid('act'),
     timestamp: new Date().toISOString(),
     date: dateStr,
        type: payload.type || 'activity',
        phase: payload.phase || phaseIdxToCode(this.state.ui.currentPhaseIdx),
        detail: payload.detail || '',
        value: payload.value !== undefined ? payload.value : '',
        readiness: payload.readiness || this.state.ui.readiness,
        note: payload.note || ''
      };
      this.state.data.activityLogs.push(item);
      if (String(item.type).toLowerCase().indexOf('big3') !== -1) {
        if (this.state.data.big3Dates.indexOf(dateStr) === -1) {
          this.state.data.big3Dates.push(dateStr);
          this.state.data.big3Dates.sort();
        }
      }
      this.enqueue(Object.assign({ action: 'log_activity' }, item));
      this.renderActiveTab();
      return item;
    },

    /* ==================== SYNCHRONIZACE S API v2.0 ==================== */

    pushOutbox: async function (silent) {
      const url = (this.state.settings.apiUrl || '').trim();
      const token = (this.state.settings.apiToken || '').trim();
      if (!url || this.state.outbox.length === 0) return { ok: true, sent: 0 };
      if (!navigator.onLine) {
        if (!silent) toast('Offline — záznamy zůstávají ve frontě.');
        return { ok: false, offline: true };
      }
      if (this._syncing) return { ok: false, busy: true };

      this._syncing = true;
      const batch = this.state.outbox.slice();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: token, items: batch })
        });
        const json = await res.json();
        if (json.status !== 'ok') throw new Error(json.message || 'Chyba zápisu API');

        // Odstranit z fronty pouze úspěšně odeslanou dávku
        this.state.outbox = this.state.outbox.slice(batch.length);
        this.state.ui.lastSyncAt = new Date().toISOString();
        this.state.ui.syncStatus = this.state.outbox.length ? 'pending' : 'online';
        this.save();
        if (!silent) toast('Odesláno do Sheetu: ' + (json.saved || batch.length) + ' změn');
        return { ok: true, sent: batch.length, response: json };
      } catch (err) {
        this.state.ui.syncStatus = 'error';
        this.save();
        if (!silent) toast('Chyba odeslání: ' + err.message, 3600);
        return { ok: false, error: err.message };
      } finally {
        this._syncing = false;
      }
    },

    pullFromServer: async function (silent) {
      const baseUrl = (this.state.settings.apiUrl || '').trim();
      const token = (this.state.settings.apiToken || '').trim();
      if (!baseUrl) {
        if (!silent) toast('Nejdřív zadej URL Web App v záložce Sync.');
        return { ok: false };
      }
      if (!navigator.onLine) {
        if (!silent) toast('Jsi offline — zobrazuji lokální data.');
        return { ok: false, offline: true };
      }

      const sep = baseUrl.indexOf('?') !== -1 ? '&' : '?';
      const url = token ? (baseUrl + sep + 'token=' + encodeURIComponent(token)) : baseUrl;

      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.status !== 'ok') throw new Error(json.message || 'API nevrátilo status ok');

        if (Array.isArray(json.schedule) && json.schedule.length) this.state.data.schedule = json.schedule;
        if (json.strength) this.state.data.planStrength = json.strength;
        if (Array.isArray(json.zones)) this.state.data.zones = json.zones;
        if (Array.isArray(json.ideas)) this.state.data.ideas = json.ideas;
        if (Array.isArray(json.gyms)) this.state.data.gyms = json.gyms;
        if (Array.isArray(json.catalog)) this.state.data.catalog = json.catalog;
        if (json.logs && Array.isArray(json.logs.strength)) this.state.data.strengthLogs = json.logs.strength;
        if (json.logs && Array.isArray(json.logs.activities)) this.state.data.activityLogs = json.logs.activities;
        if (Array.isArray(json.big3Dates)) this.state.data.big3Dates = json.big3Dates;

        if (!this.state.ui.activeGymId && json.lastGymId) {
          this.state.ui.activeGymId = json.lastGymId;
        }

        this.state.ui.lastSyncAt = new Date().toISOString();
        this.state.ui.syncStatus = this.state.outbox.length ? 'pending' : 'online';
        this.save();
        this.renderActiveTab();
        if (!silent) toast('Synchronizováno (' + this.state.data.catalog.length + ' cviků, ' + this.state.data.strengthLogs.length + ' sérií)');
        return { ok: true, data: json };
      } catch (err) {
        this.state.ui.syncStatus = 'error';
        this.save();
        if (!silent) toast('Chyba synchronizace: ' + err.message, 3600);
        return { ok: false, error: err.message };
      }
    },

    syncAll: async function (silent) {
      if (this.state.outbox.length > 0) {
        const pushRes = await this.pushOutbox(true);
        if (!pushRes.ok) {
          if (!silent) toast('Nepodařilo se odeslat frontu: ' + (pushRes.error || 'offline'), 3500);
          return pushRes;
        }
      }
      return await this.pullFromServer(silent);
    },

    /* ==================== RYCHLÝ PŘEPÍNAČ POSILOVNY V LIŠTĚ ==================== */

    openQuickGymModal: function () {
      const gyms = this.state.data.gyms;
      const activeId = this.state.ui.activeGymId;
      let html = '<p class="muted small" style="margin-top:0">Vyber posilovnu, ve které dnes cvičíš. Stroje a kladky se automaticky vyfiltrují, volné váhy zůstanou společné.</p>';

      html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">';
      gyms.forEach(function (g) {
        const isAct = g.id === activeId;
        html +=
          '<button type="button" class="btn ' + (isAct ? 'btn-primary' : '') + ' btn-block" data-pick-gym="' + esc(g.id) + '" style="justify-content:space-between">' +
          '<span>' + esc(g.name) + '</span>' +
          '<span class="small" style="opacity:0.8">' + (isAct ? 'Aktivní' : esc(g.note || g.id)) + '</span>' +
          '</button>';
      });
      html +=
        '<button type="button" class="btn ' + (!activeId ? 'btn-primary' : 'btn-ghost') + ' btn-block" data-pick-gym="">' +
        'Zobrazit všechna fitka (bez filtru)' +
        '</button></div>';

      html +=
        '<div style="border-top:1px solid var(--border);padding-top:12px">' +
        '<div class="small muted" style="margin-bottom:6px;font-weight:700">Přidat novou posilovnu</div>' +
        '<div class="field"><input id="new-gym-name" class="input" placeholder="Název (např. Fitko Ostrava)"></div>' +
        '<div class="field"><input id="new-gym-note" class="input" placeholder="Poznámka (volitelné)"></div>' +
        '<button type="button" id="btn-save-new-gym" class="btn btn-green btn-block">+ Přidat posilovnu</button>' +
        '</div>';

      openModal('Aktivní posilovna', html, function (bodyEl) {
        bodyEl.querySelectorAll('[data-pick-gym]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            TOS.setActiveGym(btn.dataset.pickGym);
            closeModal();
            const g = TOS.getActiveGym();
            toast(g ? ('Aktivní fitko: ' + g.name) : 'Filtr fitka vypnut');
          });
        });
        const addBtn = bodyEl.querySelector('#btn-save-new-gym');
        if (addBtn) {
          addBtn.addEventListener('click', function () {
            const name = bodyEl.querySelector('#new-gym-name').value.trim();
            const note = bodyEl.querySelector('#new-gym-note').value.trim();
            if (!name) return toast('Zadej název posilovny.');
            TOS.addGym(name, note);
            closeModal();
            toast('Posilovna přidána: ' + name);
          });
        }
      });
    },

    /* ==================== START APLIKACE ==================== */

    init: function () {
      // Spodní navigace
      document.querySelectorAll('.nav-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          TOS.switchTab(btn.dataset.tab);
        });
      });

      // Horní tlačítka
      const gymBtn = document.getElementById('btn-quick-gym');
      if (gymBtn) gymBtn.addEventListener('click', function () { TOS.openQuickGymModal(); });

      const syncBtn = document.getElementById('btn-quick-sync');
      if (syncBtn) syncBtn.addEventListener('click', function () {
        toast('Synchronizuji...');
        TOS.syncAll(false);
      });

      // Plovoucí pauzovač
      document.querySelectorAll('[data-timer-delta]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          restTimer.adjust(parseInt(btn.dataset.timerDelta, 10));
        });
      });
      const stopBtn = document.getElementById('ft-stop');
      if (stopBtn) stopBtn.addEventListener('click', function () { restTimer.stop(); });

      // Modální okno
      const closeBtn = document.getElementById('modal-close');
      const overlay = document.getElementById('modal-overlay');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (overlay) {
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) closeModal();
        });
      }

      // Automatické odeslání fronty při návratu signálu
      window.addEventListener('online', function () {
        if (TOS.state.outbox.length > 0) TOS.pushOutbox(true);
      });

      // Aktivovat uloženou záložku a stáhnout čerstvá data na pozadí
      this.switchTab(this.state.ui.activeTab || 'workout');
      if (navigator.onLine && this.state.settings.apiUrl) {
        this.syncAll(true);
      }
    }
  };

  window.TOS = TOS;

  document.addEventListener('DOMContentLoaded', function () {
    TOS.init();
  });
})();
