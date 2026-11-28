/**
 * Training OS v2.1 — Záložka Dnes (F1–F7, Multi-Gym síla, Watt kalkulačka, přesné F4/F7 časovače, vytrvalostní logování)
 */
(function () {
  'use strict';

  const local = {
    f2Dur: 80,
    f5Dur: 50,
    f4Variant: '4A',
    f4Warmup: true,
    f4Cooldown: true,
    f4ReducedBlocks: false,
    extraExerciseIds: {}, // { 'F1': ['EX_12'], ... }
    iv: {
      running: false,
      paused: false,
      ownerPhase: '', // 'F4' | 'F7'
      timerId: null,
      steps: [],
      stepIdx: 0,
      stepEndTime: 0,
      pausedRemMs: 0,
      lastBeepSec: -1,
      protocolLabel: '',
      finishModalOpts: null
    }
  };

  const F7_PROTOCOL = [
    { name: 'Pasivní vis na hrazdě / dekomprese', sec: 120, cue: 'Uvolni ramena a pánev, dlouhý výdech. Krátké úseky po 30 sekundách.' },
    { name: 'Protažení kyčelních flexorů (Psoas) — Levá', sec: 90, cue: 'Podsazená pánev, aktivní hýždě, bez prohýbání v bedrech.' },
    { name: 'Protažení kyčelních flexorů (Psoas) — Pravá', sec: 90, cue: 'Podsazená pánev, aktivní hýždě, plynulý nosní dech.' },
    { name: '90/90 mobilita kyčlí (přetáčení)', sec: 180, cue: 'Pomalá kontrolovaná rotace kyčlí ze strany na stranu.' },
    { name: 'Hrudní rotace Open Book — Levá', sec: 90, cue: 'Kolena pevně u země, otevírej hrudník s výdechem.' },
    { name: 'Hrudní rotace Open Book — Pravá', sec: 90, cue: 'Sleduj rukou očima, dýchej do spodních žeber.' },
    { name: 'Uvolnění hamstringů a lýtek', sec: 120, cue: 'Jemné protažení bez bolesti po excentrickém RDL.' },
    { name: '90/90 brániční dýchání na zádech', sec: 120, cue: 'Nohy na židli/lavičce, nádech 4 sekundy nosem, výdech 6 až 8 sekund.' }
  ];

  function buildF4Protocols(ftp, map, opts) {
    const o = opts || {};
    const useWarmup = !!o.warmup;
    const useCooldown = !!o.cooldown;
    const reduced = !!o.reduced;
    const w = function (base, pct) { return Math.round((base * pct) / 100); };

    function wrapSteps(coreSteps) {
      const s = [];
      if (useWarmup) {
        s.push({ kind: 'warmup', name: 'Rozjetí Z1/Z2', sec: 480, target: w(ftp, 55) + '–' + w(ftp, 62) + ' W (8 min, 90 RPM)' });
        s.push({ kind: 'warmup', name: 'Opener 1/2', sec: 20, target: w(ftp, 105) + ' W (svižná kadence)' });
        s.push({ kind: 'rest', name: 'Vytočení 1/2', sec: 40, target: w(ftp, 50) + ' W' });
        s.push({ kind: 'warmup', name: 'Opener 2/2', sec: 20, target: w(ftp, 105) + ' W' });
        s.push({ kind: 'rest', name: 'Příprava před blokem', sec: 40, target: w(ftp, 50) + ' W' });
      } else {
        s.push({ kind: 'prep', name: 'Příprava', sec: 10, target: 'Roztoč nohy (85–95 RPM)' });
      }
      coreSteps.forEach(function (st) { s.push(st); });
      if (useCooldown) {
        s.push({ kind: 'cooldown', name: 'Vyjetí (Cool-down)', sec: 300, target: w(ftp, 45) + ' W (5 min lehce)' });
      }
      return s;
    }

    const blocks4A = reduced ? 2 : 3;
    const reps4B = reduced ? 3 : 4;
    const blocks4D = reduced ? 1 : 2;

    return {
      '4A': {
        code: '4A',
        title: '30/15 (Rønnestad)',
        summary: blocks4A + '×10×(30s @ ' + w(map, 100) + ' W / 15s @ ' + w(ftp, 40) + ' W), pauza 3 min',
        targetText: 'Práce: 100 % MAP (' + w(map, 100) + ' W) | Odpočinek: 40 % FTP (' + w(ftp, 40) + ' W)',
        defaultWatts: w(map, 88),
        defaultDuration: (blocks4A * 8) + (useWarmup ? 10 : 0) + (useCooldown ? 5 : 0),
        buildSteps: function () {
          const core = [];
          for (let block = 1; block <= blocks4A; block++) {
            for (let rep = 1; rep <= 10; rep++) {
              core.push({ kind: 'work', name: 'Série ' + block + ' • ' + rep + '/10 PRÁCE', sec: 30, target: w(map, 100) + ' W' });
              if (rep < 10) {
                core.push({ kind: 'rest', name: 'Série ' + block + ' • ' + rep + '/10 pauza', sec: 15, target: w(ftp, 40) + ' W' });
              }
            }
            if (block < blocks4A) {
              core.push({ kind: 'blockRest', name: 'Mezisériová pauza (' + block + '/' + blocks4A + ')', sec: 180, target: 'Lehce toč ' + w(ftp, 45) + ' W' });
            }
          }
          return wrapSteps(core);
        }
      },
      '4B': {
        code: '4B',
        title: '4×4 min (Klasika VO2)',
        summary: reps4B + '×(4 min @ ' + w(ftp, 108) + '–' + w(ftp, 114) + ' W / 3 min @ ' + w(ftp, 50) + ' W)',
        targetText: 'Práce: 108–114 % FTP (' + w(ftp, 108) + '–' + w(ftp, 114) + ' W) | Pauza: 50 % FTP (' + w(ftp, 50) + ' W)',
        defaultWatts: w(ftp, 110),
        defaultDuration: (reps4B * 7 - 3) + (useWarmup ? 10 : 0) + (useCooldown ? 5 : 0),
        buildSteps: function () {
          const core = [];
          for (let i = 1; i <= reps4B; i++) {
            core.push({ kind: 'work', name: 'Interval ' + i + '/' + reps4B + ' PRÁCE', sec: 240, target: w(ftp, 108) + '–' + w(ftp, 114) + ' W' });
            if (i < reps4B) core.push({ kind: 'rest', name: 'Pauza ' + i + '/' + reps4B, sec: 180, target: w(ftp, 50) + ' W' });
          }
          return wrapSteps(core);
        }
      },
      '4C': {
        code: '4C',
        title: '4×4 Hard-Start',
        summary: reps4B + '×(45s @ ' + w(map, 100) + ' W + 3m15s @ ' + w(ftp, 105) + ' W / 3 min)',
        targetText: 'Hard-start 45s: ' + w(map, 100) + ' W → držení 3m15s: ' + w(ftp, 105) + ' W | Pauza: ' + w(ftp, 50) + ' W',
        defaultWatts: w(ftp, 108),
        defaultDuration: (reps4B * 7 - 3) + (useWarmup ? 10 : 0) + (useCooldown ? 5 : 0),
        buildSteps: function () {
          const core = [];
          for (let i = 1; i <= reps4B; i++) {
            core.push({ kind: 'work', name: 'Interval ' + i + '/' + reps4B + ' HARD START', sec: 45, target: w(map, 100) + ' W' });
            core.push({ kind: 'work', name: 'Interval ' + i + '/' + reps4B + ' DRŽENÍ', sec: 195, target: w(ftp, 105) + ' W' });
            if (i < reps4B) core.push({ kind: 'rest', name: 'Pauza ' + i + '/' + reps4B, sec: 180, target: w(ftp, 50) + ' W' });
          }
          return wrapSteps(core);
        }
      },
      '4D': {
        code: '4D',
        title: '30/30 (Billat / Airbike)',
        summary: blocks4D + '×10×(30s @ ' + w(map, 100) + ' W / 30s @ ' + w(ftp, 45) + ' W), pauza 3 min',
        targetText: 'Práce: 98–102 % MAP (' + w(map, 98) + '–' + w(map, 102) + ' W) | Odpočinek: ' + w(ftp, 45) + ' W',
        defaultWatts: w(map, 80),
        defaultDuration: (blocks4D * 10 + (blocks4D > 1 ? 3 : 0)) + (useWarmup ? 10 : 0) + (useCooldown ? 5 : 0),
        buildSteps: function () {
          const core = [];
          for (let block = 1; block <= blocks4D; block++) {
            for (let rep = 1; rep <= 10; rep++) {
              core.push({ kind: 'work', name: 'Blok ' + block + ' • ' + rep + '/10 PRÁCE', sec: 30, target: w(map, 100) + ' W' });
              if (rep < 10) core.push({ kind: 'rest', name: 'Blok ' + block + ' • ' + rep + '/10 pauza', sec: 30, target: w(ftp, 45) + ' W' });
            }
            if (block < blocks4D) {
              core.push({ kind: 'blockRest', name: 'Mezisériová pauza', sec: 180, target: 'Vytoč nohy ' + w(ftp, 45) + ' W' });
            }
          }
          return wrapSteps(core);
        }
      }
    };
  }

  /* ==================== PŘESNÝ INTERVALOVÝ / F7 ČASOVAČ (Date.now()) ==================== */

  function getIvRemainingMs() {
    if (!local.iv.running) return 0;
    if (local.iv.paused) return Math.max(0, local.iv.pausedRemMs);
    return Math.max(0, local.iv.stepEndTime - Date.now());
  }

  function formatMMSS(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function stopIntervalTimer(silent) {
    if (local.iv.timerId) {
      clearInterval(local.iv.timerId);
      local.iv.timerId = null;
    }
    local.iv.running = false;
    local.iv.paused = false;
    local.iv.stepEndTime = 0;
    local.iv.pausedRemMs = 0;
    local.iv.ownerPhase = '';
    TOS.wakeLock.release('intervalTimer');
    TOS.restTimer.syncExternalBar();
    if (!silent) updateIntervalTimerUI();
  }

  function finishIntervalTimer() {
    const label = local.iv.protocolLabel;
    const modalOpts = local.iv.finishModalOpts;
    stopIntervalTimer(true);
    TOS.audio.chime();
    TOS.audio.speak('Protokol dokončen, výborná práce.');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
    TOS.toast('Hotovo: ' + label);
    updateIntervalTimerUI();
    if (modalOpts) {
      openEnduranceLogModal(modalOpts);
    }
  }

  function advanceIntervalStep() {
    if (!local.iv.running) return;
    local.iv.stepIdx++;
    local.iv.lastBeepSec = -1;
    if (local.iv.stepIdx >= local.iv.steps.length) {
      finishIntervalTimer();
      return;
    }
    const nextStep = local.iv.steps[local.iv.stepIdx];
    const nextMs = (nextStep.sec || 1) * 1000;
    if (local.iv.paused) {
      local.iv.pausedRemMs = nextMs;
    } else {
      local.iv.stepEndTime = Date.now() + nextMs;
    }
    announceStep(nextStep);
    updateIntervalTimerUI();
    TOS.restTimer.syncExternalBar();
  }

  function togglePauseIntervalTimer() {
    if (!local.iv.running) return;
    if (local.iv.paused) {
      local.iv.paused = false;
      local.iv.stepEndTime = Date.now() + Math.max(1000, local.iv.pausedRemMs);
    } else {
      local.iv.pausedRemMs = Math.max(0, local.iv.stepEndTime - Date.now());
      local.iv.paused = true;
    }
    updateIntervalTimerUI();
    TOS.restTimer.syncExternalBar();
  }

  function tickIntervalTimer() {
    if (!local.iv.running || local.iv.paused) return;
    let remMs = local.iv.stepEndTime - Date.now();

    // Při delším spánku telefonu plynule přeskočí případně uplynulé mezikroky
    while (remMs <= 0) {
      local.iv.stepIdx++;
      local.iv.lastBeepSec = -1;
      if (local.iv.stepIdx >= local.iv.steps.length) {
        finishIntervalTimer();
        return;
      }
      const nextStep = local.iv.steps[local.iv.stepIdx];
      local.iv.stepEndTime += (nextStep.sec || 1) * 1000;
      remMs = local.iv.stepEndTime - Date.now();
      if (remMs > 0) announceStep(nextStep);
    }

    const remSec = Math.ceil(remMs / 1000);
    if (remSec > 0 && remSec <= 3 && remSec !== local.iv.lastBeepSec) {
      local.iv.lastBeepSec = remSec;
      TOS.audio.beep(620, 90, 'sine', 0.14);
    }

    updateIntervalTimerUI();
    TOS.restTimer.syncExternalBar();
  }

  function startIntervalTimer(steps, protocolLabel, ownerPhase, finishModalOpts) {
    stopIntervalTimer(true);
    if (!steps || !steps.length) return;
    local.iv.steps = steps;
    local.iv.stepIdx = 0;
    local.iv.ownerPhase = ownerPhase || '';
    local.iv.stepEndTime = Date.now() + (steps[0].sec || 1) * 1000;
    local.iv.pausedRemMs = 0;
    local.iv.lastBeepSec = -1;
    local.iv.running = true;
    local.iv.paused = false;
    local.iv.protocolLabel = protocolLabel;
    local.iv.finishModalOpts = finishModalOpts || null;

    TOS.wakeLock.acquire('intervalTimer');
    announceStep(steps[0]);
    updateIntervalTimerUI();
    TOS.restTimer.syncExternalBar();

    local.iv.timerId = setInterval(tickIntervalTimer, 250);
  }

  function announceStep(step) {
    if (!step) return;
    if (step.kind === 'work') {
      TOS.audio.beep(980, 220, 'triangle', 0.22);
      TOS.audio.speak('Jedeme! ' + (step.target || step.name));
    } else if (step.kind === 'rest' || step.kind === 'blockRest') {
      TOS.audio.beep(520, 200, 'sine', 0.18);
      TOS.audio.speak('Pauza.');
    } else if (step.kind === 'warmup' || step.kind === 'cooldown') {
      TOS.audio.beep(700, 160, 'sine', 0.16);
      TOS.audio.speak(step.name);
    } else if (step.kind === 'f7') {
      TOS.audio.beep(740, 180, 'sine', 0.18);
      TOS.audio.speak(step.name);
    } else {
      TOS.audio.beep(700, 140, 'sine', 0.15);
    }
  }

  function updateIntervalTimerUI() {
    const box = document.getElementById('iv-timer-box');
    if (!box) return;
    const activePhaseCode = TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx);
    if (!local.iv.running || (local.iv.ownerPhase && local.iv.ownerPhase !== activePhaseCode)) {
      box.innerHTML = '';
      return;
    }
    const step = local.iv.steps[local.iv.stepIdx];
    const next = local.iv.steps[local.iv.stepIdx + 1];
    const remSec = Math.ceil(getIvRemainingMs() / 1000);
    const pct = step && step.sec ? Math.min(100, Math.max(0, Math.round(((step.sec - remSec) / step.sec) * 100))) : 0;
    const badgeCls = step.kind === 'work' ? 'badge-red' : (step.kind === 'rest' || step.kind === 'blockRest' ? 'badge-green' : 'badge-blue');

    // Výpočet zbývajícího celkového času
    let totalRemSec = remSec;
    for (let i = local.iv.stepIdx + 1; i < local.iv.steps.length; i++) {
      totalRemSec += local.iv.steps[i].sec || 0;
    }

    box.innerHTML =
      '<div class="card" style="border-color:var(--accent);background:var(--surface-2)">' +
      '<div class="row-between">' +
        '<span class="badge ' + badgeCls + '">' + TOS.esc(step.name) + '</span>' +
        '<span class="small muted tabular">Krok ' + (local.iv.stepIdx + 1) + '/' + local.iv.steps.length + ' • Zbývá ' + formatMMSS(totalRemSec) + '</span>' +
      '</div>' +
      '<div class="timer-display">' + formatMMSS(remSec) + '</div>' +
      '<div class="small" style="text-align:center;margin-bottom:10px;font-weight:600">' + TOS.esc(step.target || step.cue || '') + '</div>' +
      '<div class="progress-track" style="margin-bottom:10px"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      (next ? '<div class="small muted" style="text-align:center;margin-bottom:10px">Následuje: ' + TOS.esc(next.name) + ' (' + formatMMSS(next.sec) + ')</div>' : '') +
      '<div class="grid-3">' +
        '<button type="button" class="btn btn-sm" id="iv-pause">' + (local.iv.paused ? 'Pokračovat' : 'Pauza') + '</button>' +
        '<button type="button" class="btn btn-sm" id="iv-skip">Přeskočit</button>' +
        '<button type="button" class="btn btn-sm btn-danger" id="iv-stop">Zastavit</button>' +
      '</div>' +
      '</div>';

    const pBtn = document.getElementById('iv-pause');
    const sBtn = document.getElementById('iv-skip');
    const stBtn = document.getElementById('iv-stop');
    if (pBtn) pBtn.onclick = togglePauseIntervalTimer;
    if (sBtn) sBtn.onclick = advanceIntervalStep;
    if (stBtn) stBtn.onclick = function () { stopIntervalTimer(false); };
  }

  // Registrace do plovoucí lišty (aby byl běžící F4/F7 časovač vidět při přepnutí fáze/záložky)
  TOS.restTimer.setExternalProvider({
    isActive: function () { return local.iv.running; },
    shouldShowFloating: function () {
      if (!local.iv.running) return false;
      const onOwnerScreen = TOS.state.ui.activeTab === 'workout' &&
        TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx) === local.iv.ownerPhase;
      return !onOwnerScreen;
    },
    getFloatingInfo: function () {
      const step = local.iv.steps[local.iv.stepIdx] || { name: '' };
      return {
        label: (local.iv.paused ? 'PAUZA • ' : '') + local.iv.ownerPhase + ' • ' + step.name,
        timeText: formatMMSS(Math.ceil(getIvRemainingMs() / 1000))
      };
    },
    focusTimer: function () {
      if (local.iv.ownerPhase === 'F4') TOS.state.ui.currentPhaseIdx = 3;
      else if (local.iv.ownerPhase === 'F7') TOS.state.ui.currentPhaseIdx = 6;
      TOS.switchTab('workout');
    },
    stop: function () { stopIntervalTimer(false); }
  });

  /* ==================== MODÁL PRO LOGOVÁNÍ VYTRVALOSTI A F7 ==================== */

  function openEnduranceLogModal(opts) {
    const o = opts || {};
    const editAct = o.editActivity || null;
    const parsed = editAct ? TOS.parseEnduranceMetrics(editAct) : null;

    const phase = editAct ? editAct.phase : (o.phase || TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx));
    const type = editAct ? editAct.type : (o.type || 'Z2');
    const dateVal = editAct ? editAct.date : (o.date || TOS.todayISO());
    const sportInit = parsed ? parsed.sport : (o.sport || (type === 'Kompenzace' ? 'Kompenzace' : 'Kolo'));
    const durInit = parsed && parsed.durationMin ? parsed.durationMin : (o.durationMin || 60);
    const wattsInit = parsed && parsed.avgWatts ? parsed.avgWatts : (o.avgWatts || '');
    const hrInit = parsed && parsed.avgHr ? parsed.avgHr : (o.avgHr || '');
    const noteInit = editAct ? (editAct.note || '') : (o.note || '');
    const detailBase = editAct ? editAct.detail : (o.detail || (phase + ' ' + type));
    const isKomp = type === 'Kompenzace' || phase === 'F7';

    let html =
      '<div class="field"><label>Datum</label><input id="end-date" class="input tabular" type="date" value="' + TOS.esc(dateVal) + '"></div>' +
      '<div class="field"><label>Popis aktivity</label><input id="end-detail" class="input" value="' + TOS.esc(detailBase) + '"></div>';

    if (!isKomp) {
      html +=
        '<div class="field"><label>Disciplína</label>' +
          '<div class="grid-3">' +
            ['Kolo', 'Běh', 'Airbike'].map(function (sp) {
              return '<button type="button" class="btn btn-sm ' + (sportInit === sp ? 'btn-primary' : '') + '" data-end-sport="' + sp + '">' + sp + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }

    html +=
      '<div class="' + (isKomp ? 'field' : 'grid-3') + '">' +
        '<div class="field"><label>Délka (min)</label><input id="end-dur" class="input tabular" type="number" min="1" value="' + TOS.esc(durInit) + '"></div>' +
        (!isKomp ? '<div class="field"><label>Prům. výkon (W)</label><input id="end-w" class="input tabular" type="number" min="0" placeholder="např. 165" value="' + TOS.esc(wattsInit) + '"></div>' : '') +
        (!isKomp ? '<div class="field"><label>Prům. tep (t/m)</label><input id="end-hr" class="input tabular" type="number" min="0" placeholder="např. 128" value="' + TOS.esc(hrInit) + '"></div>' : '') +
      '</div>' +
      '<div id="end-ef-preview" class="small muted tabular" style="margin-bottom:10px"></div>' +
      '<div class="field"><label>Poznámka (pocit, drift tepu, terén...)</label><input id="end-note" class="input" value="' + TOS.esc(noteInit) + '" placeholder="Volitelná poznámka..."></div>' +
      '<div class="row" style="gap:8px">' +
        '<button type="button" id="end-save" class="btn btn-green btn-block">' + (editAct ? 'Uložit úpravu' : 'Zapsat do Log_Aktivity') + '</button>' +
        (editAct ? '<button type="button" id="end-del" class="btn btn-danger">Smazat</button>' : '') +
      '</div>';

    TOS.openModal(editAct ? 'Upravit aktivitu' : ('Zapsat ' + phase), html, function (bodyEl) {
      let curSport = sportInit;
      const durIn = bodyEl.querySelector('#end-dur');
      const wIn = bodyEl.querySelector('#end-w');
      const hrIn = bodyEl.querySelector('#end-hr');
      const efEl = bodyEl.querySelector('#end-ef-preview');

      function updateEf() {
        if (!efEl || !wIn || !hrIn) return;
        const w = TOS.toNum(wIn.value);
        const hr = TOS.toNum(hrIn.value);
        if (w > 0 && hr > 0) {
          const ef = TOS.round2(w / hr);
          const vt1Warn = hr > TOS.state.settings.vt1 && (type === 'Z2' || type === 'Flush')
            ? ' • <span style="color:var(--gold)">Tep nad VT1 (' + TOS.state.settings.vt1 + ')</span>'
            : '';
          efEl.innerHTML = 'Aerobní efektivita (EF): <strong>' + ef + ' W/t/m</strong>' + vt1Warn;
        } else {
          efEl.textContent = 'Vyplň průměrné watty a tep pro sledování aerobní efektivity (EF) v Progresu.';
        }
      }
      updateEf();
      if (wIn) wIn.addEventListener('input', updateEf);
      if (hrIn) hrIn.addEventListener('input', updateEf);

      bodyEl.querySelectorAll('[data-end-sport]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          curSport = btn.dataset.endSport;
          bodyEl.querySelectorAll('[data-end-sport]').forEach(function (b) {
            b.className = 'btn btn-sm ' + (b.dataset.endSport === curSport ? 'btn-primary' : '');
          });
        });
      });

      bodyEl.querySelector('#end-save').addEventListener('click', function () {
        const dur = Math.max(1, Math.round(TOS.toNum(durIn.value) || 15));
        const w = wIn ? Math.max(0, Math.round(TOS.toNum(wIn.value))) : 0;
        const hr = hrIn ? Math.max(0, Math.round(TOS.toNum(hrIn.value))) : 0;
        const note = bodyEl.querySelector('#end-note').value.trim();
        let detail = bodyEl.querySelector('#end-detail').value.trim() || (phase + ' ' + type);
        if (!isKomp && curSport) {
          detail = detail.replace(/\s*•\s*(Kolo|Běh|Airbike)\s*$/i, '').trim();
          if (detail.toLowerCase().indexOf(curSport.toLowerCase()) === -1) {
            detail = detail + ' • ' + curSport;
          }
        }
        const parts = [dur + ' min'];
        if (w > 0) parts.push(w + ' W');
        if (hr > 0) parts.push(hr + ' bpm');
        const valueStr = parts.join(' | ');
        const chosenDate = bodyEl.querySelector('#end-date').value || TOS.todayISO();

        if (editAct) {
          TOS.updateActivity(editAct.id, {
            date: chosenDate,
            detail: detail,
            value: valueStr,
            note: note
          });
          TOS.closeModal();
          TOS.toast('Aktivita upravena');
        } else {
          TOS.logActivity({
            date: chosenDate,
            type: type,
            phase: phase,
            detail: detail,
            value: valueStr,
            note: note
          });
          TOS.closeModal();
          TOS.toast('Zapsáno: ' + detail + ' (' + valueStr + ')');
        }
      });

      const delBtn = bodyEl.querySelector('#end-del');
      if (delBtn && editAct) {
        delBtn.addEventListener('click', function () {
          if (confirm('Opravdu smazat tuto aktivitu?')) {
            TOS.deleteActivity(editAct.id, editAct.date, editAct.type);
            TOS.closeModal();
            TOS.toast('Aktivita smazána');
          }
        });
      }
    });
  }

  /* ==================== MODÁLY PRO SILOVÉ LOGOVÁNÍ ==================== */

  function openLogSetModal(exercise, opts) {
    const o = opts || {};
    const editLog = o.editLog || null;
    const setTypeInit = editLog ? editLog.setType : (o.setType || 'Top Set');
    const gym = TOS.getActiveGym();
    const gymId = editLog ? editLog.gymId : (exercise.resistanceType === 'Volna_Vaha' ? (gym ? gym.id : '') : (exercise.gymId || (gym ? gym.id : '')));
    const gymObj = TOS.getGymById(gymId);
    const gymName = gymObj ? gymObj.name : (editLog ? (editLog.gymName || '') : '');
    const machineKey = (editLog && editLog.machineKey)
      ? editLog.machineKey
      : TOS.computeMachineKey(exercise.resistanceType, gymName, exercise.name);

    const today = TOS.todayISO();
    const lastTop = TOS.getLastSetForMachine(machineKey, 'Top Set', editLog ? editLog.date : today);
    const lastBack = TOS.getLastSetForMachine(machineKey, 'Back-off Set', editLog ? editLog.date : today);
    const todayTop = !editLog ? TOS.getEnrichedLogs().filter(function (l) {
      return l.date === today && l.machineKey === machineKey && l.setType === 'Top Set';
    }).slice(-1)[0] : null;
    const bestPR = TOS.getBestPRForMachine(machineKey);
    const bw = Math.max(0, TOS.toNum(TOS.state.settings.bodyweight));
    const isBwNamed = TOS.isWeightedBodyweightName(exercise.name);

    function defaultValsForType(t) {
      if (editLog) {
        return { weight: editLog.weight, reps: editLog.reps, rir: editLog.rir !== '' ? editLog.rir : '0', setup: editLog.setupNote || exercise.machineSetup || '' };
      }
      const refTop = todayTop || lastTop;
      const ref = t === 'Back-off Set' ? (lastBack || refTop) : lastTop;
      let w = ref ? ref.weight : 0;
      if (t === 'Back-off Set' && !lastBack && refTop && refTop.weight > 0) {
        w = Math.round((refTop.weight * 0.85) / 2.5) * 2.5;
      }
      const r = ref ? ref.reps : 8;
      const rir = ref && ref.rir !== '' ? String(ref.rir) : (exercise.targetRir && exercise.targetRir.indexOf('0') !== -1 ? '0' : '1');
      return { weight: w, reps: r, rir: rir, setup: exercise.machineSetup || (ref ? ref.setupNote : '') || '' };
    }

    const initVals = defaultValsForType(setTypeInit);
    const defaultRest = (exercise.cnsPriority || 99) <= 7 ? TOS.state.settings.restCompound : TOS.state.settings.restIso;

    let html =
      '<div class="row-wrap" style="margin-bottom:10px">' +
        '<span class="badge badge-blue">' + TOS.esc(machineKey) + '</span>' +
        (editLog ? '<span class="badge">' + TOS.formatDateCZ(editLog.date) + '</span>' : '') +
        (exercise.targetSetsReps ? '<span class="badge">' + TOS.esc(exercise.targetSetsReps) + '</span>' : '') +
        (exercise.targetRir ? '<span class="badge">' + TOS.esc(exercise.targetRir) + '</span>' : '') +
      '</div>';

    if (lastTop || lastBack || bestPR) {
      html += '<div class="setup-box" style="margin-top:0;margin-bottom:10px">';
      if (lastTop) {
        html += '<div><strong>Minulý Top Set:</strong> ' + TOS.esc(lastTop.perfText) + (lastTop.e1rm ? ' (1RM ' + lastTop.e1rm + ' kg)' : '') + ' • ' + TOS.formatDateShortCZ(lastTop.date) + '</div>';
      }
      if (lastBack) {
        html += '<div><strong>Minulý Back-off:</strong> ' + TOS.esc(lastBack.perfText) + ' • ' + TOS.formatDateShortCZ(lastBack.date) + '</div>';
      }
      if (bestPR) {
        html += '<div style="color:var(--gold)"><strong>PR:</strong> ' + TOS.esc(bestPR.perfText) + (bestPR.e1rm ? ' | 1RM ' + bestPR.e1rm + ' kg' : '') + '</div>';
      }
      html += '</div>';
    }

    // Rychlé 1-tap předvolby pro posilovnu
    if (!editLog && (lastTop || lastBack)) {
      html +=
        '<div class="row-wrap" style="margin-bottom:10px">' +
          '<button type="button" class="chip" id="q-same">= Minule</button>' +
          '<button type="button" class="chip" id="q-plus-w">+2,5 kg</button>' +
          '<button type="button" class="chip" id="q-plus-r">+1 op.</button>' +
          '<button type="button" class="chip" id="q-minus-15">−15 % (Back-off)</button>' +
        '</div>';
    }

    html +=
      '<div class="field">' +
        '<label>Typ série</label>' +
        '<div class="grid-2">' +
          '<button type="button" class="btn btn-sm ' + (setTypeInit === 'Top Set' ? 'btn-gold' : '') + '" data-st="Top Set">Top Set</button>' +
          '<button type="button" class="btn btn-sm ' + (setTypeInit === 'Back-off Set' ? 'btn-primary' : '') + '" data-st="Back-off Set">Back-off Set</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field">' +
          '<label>Váha (kg) <span class="muted">(0 = vlastní váha)</span></label>' +
          '<div class="stepper">' +
            '<button type="button" data-step-w="-2.5">−</button>' +
            '<input id="m-weight" class="input tabular" type="number" step="0.5" min="0" value="' + initVals.weight + '">' +
            '<button type="button" data-step-w="2.5">+</button>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label>Opakování</label>' +
          '<div class="stepper">' +
            '<button type="button" data-step-r="-1">−</button>' +
            '<input id="m-reps" class="input tabular" type="number" step="1" min="1" value="' + initVals.reps + '">' +
            '<button type="button" data-step-r="1">+</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>RIR (opakování v rezervě)</label>' +
        '<div class="grid-4">' +
          ['0', '1', '2', '3'].map(function (v) {
            return '<button type="button" class="btn btn-sm ' + (String(initVals.rir) === v ? 'btn-primary' : '') + '" data-rir="' + v + '">RIR ' + v + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div id="m-live-calc" class="small muted tabular" style="margin-bottom:10px"></div>' +
      '<div class="field">' +
        '<label>Nastavení stroje / poznámka <span class="muted">(uloží se zpět do katalogu)</span></label>' +
        '<input id="m-setup" class="input" value="' + TOS.esc(initVals.setup) + '" placeholder="Sedák 4, opěrka 2, adaptér...">' +
      '</div>';

    if (!editLog) {
      html +=
        '<label class="row small" style="margin-bottom:12px;cursor:pointer">' +
          '<input id="m-start-rest" type="checkbox" checked style="width:18px;height:18px">' +
          '<span>Po uložení spustit pauzovač (' + formatMMSS(defaultRest) + ')</span>' +
        '</label>';
    }

    html +=
      '<div class="row" style="gap:8px">' +
        '<button type="button" id="m-save-set" class="btn btn-green btn-block">' + (editLog ? 'Uložit úpravu' : 'Uložit sérii') + '</button>' +
        (editLog ? '<button type="button" id="m-del-set" class="btn btn-danger">Smazat</button>' : '') +
      '</div>';

    TOS.openModal(editLog ? ('Upravit sérii — ' + exercise.name) : exercise.name, html, function (bodyEl) {
      let curType = setTypeInit;
      let curRir = String(initVals.rir);
      const wIn = bodyEl.querySelector('#m-weight');
      const rIn = bodyEl.querySelector('#m-reps');
      const calcEl = bodyEl.querySelector('#m-live-calc');

      function refreshLiveCalc() {
        const w = Math.max(0, TOS.toNum(wIn.value));
        const r = Math.max(0, TOS.toNum(rIn.value));
        if (isBwNamed && bw > 0 && w > 0) {
          const effW = TOS.round1(bw + w);
          calcEl.textContent = 'Efektivně (BW ' + bw + ' + ' + w + ' kg = ' + effW + ' kg) • 1RM: ' + TOS.calcE1RM(effW, r) + ' kg';
        } else if (w <= 0) {
          calcEl.textContent = 'Vlastní váha × ' + r + ' opakování' + (isBwNamed && bw > 0 ? (' (BW ' + bw + ' kg → 1RM ~' + TOS.calcE1RM(bw, r) + ' kg)') : '');
        } else {
          calcEl.textContent = 'Odhad 1RM: ' + TOS.calcE1RM(w, r) + ' kg  •  Tonáž série: ' + TOS.calcTonnage(w, r) + ' kg';
        }
      }
      refreshLiveCalc();

      wIn.addEventListener('input', refreshLiveCalc);
      rIn.addEventListener('input', refreshLiveCalc);

      function selectSetType(t) {
        curType = t;
        bodyEl.querySelectorAll('[data-st]').forEach(function (b) {
          b.className = 'btn btn-sm ' + (b.dataset.st === curType ? (curType === 'Top Set' ? 'btn-gold' : 'btn-primary') : '');
        });
      }

      const qSame = bodyEl.querySelector('#q-same');
      if (qSame) {
        qSame.addEventListener('click', function () {
          const ref = curType === 'Back-off Set' ? (lastBack || lastTop) : lastTop;
          if (!ref) return;
          wIn.value = ref.weight;
          rIn.value = ref.reps;
          refreshLiveCalc();
        });
      }
      const qPlusW = bodyEl.querySelector('#q-plus-w');
      if (qPlusW) {
        qPlusW.addEventListener('click', function () {
          const ref = curType === 'Back-off Set' ? (lastBack || lastTop) : lastTop;
          const baseW = ref ? ref.weight : TOS.toNum(wIn.value);
          wIn.value = TOS.round1(baseW + 2.5);
          if (ref) rIn.value = ref.reps;
          refreshLiveCalc();
        });
      }
      const qPlusR = bodyEl.querySelector('#q-plus-r');
      if (qPlusR) {
        qPlusR.addEventListener('click', function () {
          const ref = curType === 'Back-off Set' ? (lastBack || lastTop) : lastTop;
          if (ref) wIn.value = ref.weight;
          rIn.value = (ref ? ref.reps : TOS.toNum(rIn.value)) + 1;
          refreshLiveCalc();
        });
      }
      const qMinus15 = bodyEl.querySelector('#q-minus-15');
      if (qMinus15) {
        qMinus15.addEventListener('click', function () {
          const base = todayTop || lastTop;
          selectSetType('Back-off Set');
          if (base && base.weight > 0) {
            wIn.value = Math.max(0, Math.round((base.weight * 0.85) / 2.5) * 2.5);
            rIn.value = base.reps;
          }
          refreshLiveCalc();
        });
      }

      bodyEl.querySelectorAll('[data-st]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectSetType(btn.dataset.st);
          if (!editLog) {
            const v = defaultValsForType(curType);
            wIn.value = v.weight;
            rIn.value = v.reps;
            refreshLiveCalc();
          }
        });
      });

      bodyEl.querySelectorAll('[data-rir]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          curRir = btn.dataset.rir;
          bodyEl.querySelectorAll('[data-rir]').forEach(function (b) {
            b.className = 'btn btn-sm ' + (b.dataset.rir === curRir ? 'btn-primary' : '');
          });
        });
      });

      bodyEl.querySelectorAll('[data-step-w]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const next = Math.max(0, Math.round((TOS.toNum(wIn.value) + parseFloat(btn.dataset.stepW)) * 10) / 10);
          wIn.value = next;
          refreshLiveCalc();
        });
      });

      bodyEl.querySelectorAll('[data-step-r]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const next = Math.max(1, Math.round(TOS.toNum(rIn.value) + parseInt(btn.dataset.stepR, 10)));
          rIn.value = next;
          refreshLiveCalc();
        });
      });

      bodyEl.querySelector('#m-save-set').addEventListener('click', function () {
        const w = Math.max(0, TOS.toNum(wIn.value));
        const r = Math.max(1, Math.round(TOS.toNum(rIn.value)));
        const setupNote = bodyEl.querySelector('#m-setup').value.trim();

        if (editLog) {
          TOS.updateSet(editLog.id, { weight: w, reps: r, rir: curRir, setType: curType, setupNote: setupNote });
          TOS.closeModal();
          TOS.toast('Série upravena');
        } else {
          const splitKey = TOS.phaseIdxToSplitKey(TOS.state.ui.currentPhaseIdx) || exercise.split || 'Upper';
          TOS.logSet({
            date: TOS.todayISO(),
            gymId: gymId,
            split: splitKey,
            muscle: exercise.muscle,
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            setType: curType,
            weight: w,
            reps: r,
            rir: curRir,
            setupNote: setupNote
          });
          const startRest = bodyEl.querySelector('#m-start-rest');
          TOS.closeModal();
          TOS.toast('Zapsáno: ' + (w > 0 ? (w + ' kg × ' + r) : ('BW × ' + r)));
          if (startRest && startRest.checked) {
            TOS.restTimer.start(defaultRest, 'PAUZA • ' + exercise.name);
          }
        }
      });

      const delBtn = bodyEl.querySelector('#m-del-set');
      if (delBtn && editLog) {
        delBtn.addEventListener('click', function () {
          if (confirm('Opravdu smazat tuto sérii?')) {
            TOS.deleteSet(editLog.id);
            TOS.closeModal();
            TOS.toast('Série smazána');
          }
        });
      }
    });
  }

  function openRampUpModal(exercise, defaultWorkWeight) {
    const initW = defaultWorkWeight > 0 ? defaultWorkWeight : 80;
    function calcHtml(workW) {
      const round25 = function (x) { return Math.max(0, Math.round(x / 2.5) * 2.5); };
      const rows = [
        { lbl: '1. Aktivace (50 %)', w: round25(workW * 0.5), reps: '6–8 op.', note: 'Dynamická technika, RIR 6+' },
        { lbl: '2. Aklimatizace (70 %)', w: round25(workW * 0.7), reps: '4–5 op.', note: 'Kontrola dráhy a tempa' },
        { lbl: '3. CNS Primer (85 %)', w: round25(workW * 0.85), reps: '2–3 op.', note: 'Bez únavy, 90s pauza před Top Setem' },
        { lbl: 'TOP SET (100 %)', w: workW, reps: exercise.targetSetsReps || 'cílový rozsah', note: exercise.targetRir || 'RIR 1' }
      ];
      return rows.map(function (r, idx) {
        return '<div class="set-row ' + (idx === 3 ? 'top-set' : '') + '">' +
          '<div><strong>' + r.lbl + '</strong><div class="small muted">' + TOS.esc(r.note) + '</div></div>' +
          '<div class="tabular" style="text-align:right"><strong>' + r.w + ' kg</strong><div class="small muted">' + TOS.esc(r.reps) + '</div></div>' +
          '</div>';
      }).join('');
    }

    const html =
      '<div class="field">' +
        '<label>Cílová pracovní váha Top Setu (kg)</label>' +
        '<input id="ramp-work-w" class="input tabular" type="number" step="2.5" min="0" value="' + initW + '">' +
      '</div>' +
      '<div id="ramp-list">' + calcHtml(initW) + '</div>';

    TOS.openModal('Ramp-up rozcvičení — ' + exercise.name, html, function (bodyEl) {
      const inp = bodyEl.querySelector('#ramp-work-w');
      const list = bodyEl.querySelector('#ramp-list');
      inp.addEventListener('input', function () {
        list.innerHTML = calcHtml(Math.max(0, TOS.toNum(inp.value)));
      });
    });
  }

  function openAddExtraExerciseModal(phaseCode, splitKey) {
    const activeGymId = TOS.state.ui.activeGymId;
    const allMatchingGym = TOS.state.data.catalog.filter(function (ex) {
      if (!activeGymId) return true;
      return ex.resistanceType === 'Volna_Vaha' || !ex.gymId || ex.gymId === activeGymId;
    }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'cs');
    });

    let html =
      '<div class="field"><input id="ex-search" class="input" placeholder="Hledat cvik v katalogu..."></div>' +
      '<div id="ex-pick-list" style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px"></div>' +
      '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px">' +
        '<button type="button" id="btn-go-new-ex" class="btn btn-primary btn-block">+ Vytvořit úplně nový cvik</button>' +
      '</div>';

    TOS.openModal('Přidat cvik do dnešního tréninku', html, function (bodyEl) {
      const listEl = bodyEl.querySelector('#ex-pick-list');
      const searchEl = bodyEl.querySelector('#ex-search');

      function renderList(q) {
        const ql = (q || '').toLowerCase();
        const filtered = allMatchingGym.filter(function (ex) {
          return !ql || ex.name.toLowerCase().indexOf(ql) !== -1 || (ex.muscle || '').toLowerCase().indexOf(ql) !== -1;
        });
        listEl.innerHTML = filtered.slice(0, 40).map(function (ex) {
          return '<button type="button" class="btn btn-sm" data-add-ex="' + TOS.esc(ex.id) + '" style="justify-content:space-between;text-align:left">' +
            '<span><strong>' + TOS.esc(ex.name) + '</strong> <span class="muted">(' + TOS.esc(ex.muscle || ex.pattern) + ')</span></span>' +
            '<span class="badge">' + TOS.esc(ex.resistanceType === 'Volna_Vaha' ? 'Volná' : (ex.gymName || 'Stroj')) + '</span>' +
            '</button>';
        }).join('') || '<div class="muted small">Žádný cvik nenalezen.</div>';

        listEl.querySelectorAll('[data-add-ex]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!local.extraExerciseIds[phaseCode]) local.extraExerciseIds[phaseCode] = [];
            if (local.extraExerciseIds[phaseCode].indexOf(btn.dataset.addEx) === -1) {
              local.extraExerciseIds[phaseCode].push(btn.dataset.addEx);
            }
            TOS.closeModal();
            TOS.renderActiveTab();
            TOS.toast('Cvik přidán do dnešní jednotky');
          });
        });
      }

      renderList('');
      searchEl.addEventListener('input', function () { renderList(searchEl.value); });

      bodyEl.querySelector('#btn-go-new-ex').addEventListener('click', function () {
        TOS.closeModal();
        openCreateExerciseModal(splitKey, function (newEx) {
          if (!local.extraExerciseIds[phaseCode]) local.extraExerciseIds[phaseCode] = [];
          local.extraExerciseIds[phaseCode].push(newEx.id);
        });
      });
    });
  }

  function openCreateExerciseModal(defaultSplitKey, onCreated) {
    const gyms = TOS.state.data.gyms;
    const activeGymId = TOS.state.ui.activeGymId || (gyms[0] ? gyms[0].id : '');
    const muscles = ['Prsa', 'Záda', 'Ramena', 'Biceps', 'Triceps', 'Kvadricepsy', 'Hamstringy', 'Lýtka', 'Hýždě', 'Spodní záda', 'Břicho'];
    const patterns = ['Dřepový vzor', 'Kyčelní ohyb', 'Vertikální tah', 'Horizontální tlak', 'Horizontální tah', 'Vertikální tlak', 'Izolace přední', 'Izolace zadní', 'Izolace vršek', 'Biceps', 'Triceps', 'Zadní delty', 'Čistá flexe břicha', 'Spodní břicho / Flexe kyčle', 'Anti-rotace / Anti-extenze', 'Anti-úklon / Boční stabilita', 'Izolace adduktory', 'Izolace hýždí', 'Lýtka', 'Přední strana holeně'];

    const gymOptions = gyms.length
      ? gyms.map(function (g) { return '<option value="' + TOS.esc(g.id) + '" ' + (g.id === activeGymId ? 'selected' : '') + '>' + TOS.esc(g.name) + '</option>'; }).join('')
      : '<option value="">— Zatím bez fitka —</option>';

    const html =
      '<div class="field"><label>Název cviku *</label><input id="nx-name" class="input" placeholder="Např. Chest Press stroj"></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Typ odporu</label><select id="nx-res" class="select"><option value="Stroj/Kladka">Stroj / Kladka</option><option value="Volna_Vaha">Volná váha</option></select></div>' +
        '<div class="field" id="nx-gym-wrap"><label>Posilovna</label><select id="nx-gym" class="select">' + gymOptions + '</select></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Svalová partie</label><select id="nx-muscle" class="select">' + muscles.map(function (m) { return '<option>' + m + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Pohybový vzor (CNS priorita)</label><select id="nx-pattern" class="select">' + patterns.map(function (p) { return '<option>' + p + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field"><label>Určeno pro split</label>' +
        '<div class="row-wrap">' +
          ['Full Body (A)', 'Upper', 'Full Body (B)', 'Lower', 'Abs'].map(function (sp) {
            const chk = sp === defaultSplitKey ? 'checked' : '';
            return '<label class="chip" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" name="nx-sp" value="' + sp + '" ' + chk + '> ' + sp + '</label>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Cílové série × op.</label><input id="nx-sr" class="input" placeholder="2 × 8–10"></div>' +
        '<div class="field"><label>Cílové RIR</label><input id="nx-rir" class="input" placeholder="RIR 1"></div>' +
      '</div>' +
      '<div class="field"><label>Nastavení stroje</label><input id="nx-setup" class="input" placeholder="Sedák, opěrka, adaptér..."></div>' +
      '<div class="field"><label>Biomechanická poznámka</label><textarea id="nx-bio" class="textarea" placeholder="Tempo, pozice loktů..."></textarea></div>' +
      '<button type="button" id="nx-save" class="btn btn-green btn-block">Uložit cvik do katalogu</button>';

    TOS.openModal('Nový cvik do Katalog_Cviku', html, function (bodyEl) {
      const resSel = bodyEl.querySelector('#nx-res');
      const gymWrap = bodyEl.querySelector('#nx-gym-wrap');
      resSel.addEventListener('change', function () {
        gymWrap.style.display = resSel.value === 'Volna_Vaha' ? 'none' : 'block';
      });
      bodyEl.querySelector('#nx-save').addEventListener('click', function () {
        const name = bodyEl.querySelector('#nx-name').value.trim();
        if (!name) return TOS.toast('Zadej název cviku.');
        const splits = Array.from(bodyEl.querySelectorAll('input[name="nx-sp"]:checked')).map(function (el) { return el.value; });
        const ex = TOS.addExercise({
          name: name,
          resistanceType: resSel.value,
          gymId: bodyEl.querySelector('#nx-gym').value,
          muscle: bodyEl.querySelector('#nx-muscle').value,
          pattern: bodyEl.querySelector('#nx-pattern').value,
          targetSplits: splits,
          targetSetsReps: bodyEl.querySelector('#nx-sr').value.trim(),
          targetRir: bodyEl.querySelector('#nx-rir').value.trim(),
          machineSetup: bodyEl.querySelector('#nx-setup').value.trim(),
          biomechanics: bodyEl.querySelector('#nx-bio').value.trim()
        });
        if (typeof onCreated === 'function') onCreated(ex);
        TOS.closeModal();
        TOS.renderActiveTab();
        TOS.toast('Cvik uložen: ' + ex.name);
      });
    });
  }

  /* ==================== RENDER SILOVÝCH FÁZÍ (F1, F3, F6) ==================== */

  function renderStrengthPhase(idx, phaseCode, splitKey) {
    const today = TOS.todayISO();
    const readiness = TOS.state.ui.readiness;
    const activeGym = TOS.getActiveGym();
    const enrichedLogs = TOS.getEnrichedLogs();
    const todayAllLogs = enrichedLogs.filter(function (l) { return l.date === today; });
    // Filtrovat dnešní záznamy jen pro aktuálně zobrazený split (aby se F1 nepletlo do F3/F6)
    const todayLogs = todayAllLogs.filter(function (l) { return !l.split || l.split === splitKey; });
    const otherSplitCount = todayAllLogs.length - todayLogs.length;

    let exercises = TOS.getExercisesForSplit(splitKey);
    const extras = local.extraExerciseIds[phaseCode] || [];
    extras.forEach(function (exId) {
      if (!exercises.some(function (e) { return e.id === exId; })) {
        const c = TOS.getCatalogById(exId);
        if (c) exercises.push(c);
      }
    });

    todayLogs.forEach(function (l) {
      if (l.exerciseId && !exercises.some(function (e) { return e.id === l.exerciseId; })) {
        const c = TOS.getCatalogById(l.exerciseId);
        if (c) exercises.push(c);
      }
    });

    let html = '';

    // Autoregulace & bezpečnostní tipy pro VŠECHNY silové fáze
    if (readiness === 'high') {
      html += '<div class="setup-box" style="margin-bottom:10px;border-left-color:var(--red)"><strong>Autoregulace (Únava):</strong> Zvaž redukci objemu — odjeď pouze <strong>Top Sety (vynech Back-off)</strong> a drž <strong>RIR +1 až 2</strong>.' +
        (phaseCode === 'F6' ? ' U RDL uber 5–10 % nebo nahraď 45° Back Extension.' : '') + '</div>';
    } else if (readiness === 'mild') {
      html += '<div class="setup-box" style="margin-bottom:10px;border-left-color:var(--gold)"><strong>Autoregulace (Mírná únava):</strong> Hlídáš kvalitu techniky a RIR 1–2 u vícekloubových cviků.' +
        (phaseCode === 'F6' ? ' Při únavě zadního řetězce po F4/F5 uber 5 % u RDL.' : '') + '</div>';
    }
    if (phaseCode === 'F3') {
      html += '<div class="setup-box" style="margin-bottom:10px;border-left-color:var(--gold)"><strong>Ochrana loktů (F3 Upper):</strong> Před těžkými dipy zařaď 1–2 lehké zahřívací série tricepsu na kladce (RIR 5+).</div>';
    }

    // Rychlá lišta: Aktivní posilovna + Warm-up / Big 3
    html +=
      '<div class="card" style="padding:10px 12px">' +
        '<div class="row-between" style="flex-wrap:wrap;gap:8px">' +
          '<div>' +
            '<div class="small muted">Aktivní posilovna (filtr strojů)</div>' +
            '<strong>' + TOS.esc(activeGym ? activeGym.name : 'Všechna fitka (bez filtru)') + '</strong>' +
          '</div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-sm" id="btn-w-gym">Přepnout</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="btn-w-warmup">Warm-up / Big 3</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Dnešní souhrn (jen unikátní cviky s novým PR)
    const todayTonnage = todayLogs.reduce(function (acc, l) { return acc + (l.tonnage || 0); }, 0);
    const todayUniquePRs = new Set(todayLogs.filter(function (l) { return l.isPR; }).map(function (l) { return l.machineKey; })).size;
    if (todayLogs.length > 0) {
      html +=
        '<div class="grid-3" style="margin-bottom:10px">' +
          '<div class="stat-box"><div class="stat-val">' + todayLogs.length + '</div><div class="stat-lbl">Sérií (' + phaseCode + ')</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + Math.round(todayTonnage).toLocaleString('cs-CZ') + '</div><div class="stat-lbl">Tonáž (kg)</div></div>' +
          '<div class="stat-box"><div class="stat-val" style="color:var(--gold)">' + todayUniquePRs + '</div><div class="stat-lbl">Nových PR</div></div>' +
        '</div>';
    } else if (otherSplitCount > 0) {
      html += '<div class="small muted" style="margin-bottom:10px">Dnes máš zapsáno ' + otherSplitCount + ' sérií v jiném splitu (zobrazují se v příslušné fázi).</div>';
    }

    // Karty cviků
    if (exercises.length === 0) {
      html +=
        '<div class="card">' +
          '<p class="muted small" style="margin:0">V katalogu zatím nejsou cviky pro split <strong>' + TOS.esc(splitKey) + '</strong>' +
          (activeGym ? (' ve fitku <strong>' + TOS.esc(activeGym.name) + '</strong>') : '') + '. Zkus kliknout na ikonu synchronizace vpravo nahoře nebo přepni posilovnu.</p>' +
        '</div>';
    } else {
      html += '<div class="section-label">Cviky (' + exercises.length + ') • Řazeno podle priority CNS</div>';
      exercises.forEach(function (ex) {
        const gymName = ex.resistanceType === 'Volna_Vaha' ? '' : (ex.gymName || (activeGym ? activeGym.name : ''));
        const mKey = TOS.computeMachineKey(ex.resistanceType, gymName, ex.name);
        const exTodaySets = todayLogs.filter(function (l) { return l.exerciseId === ex.id || l.machineKey === mKey; });
        // Referenční „Minule Top“ vždy z PŘEDCHOZÍHO dne (ne z dnešní série!)
        const lastTop = TOS.getLastSetForMachine(mKey, 'Top Set', today);
        const bestPR = TOS.getBestPRForMachine(mKey);
        const targetSets = TOS.parseTargetSetsCount(ex.targetSetsReps);
        const doneSets = exTodaySets.length;
        const cardStateCls = doneSets >= targetSets ? 'done' : (doneSets > 0 ? 'partial' : '');

        html += '<div class="ex-card ' + cardStateCls + '">';
        html +=
          '<div class="row-between" style="align-items:flex-start">' +
            '<div>' +
              '<div class="row-wrap" style="margin-bottom:4px">' +
                (ex.pattern ? '<span class="badge">' + TOS.esc(ex.pattern) + '</span>' : '') +
                '<span class="badge ' + (ex.resistanceType === 'Volna_Vaha' ? 'badge-purple' : 'badge-blue') + '">' +
                  (ex.resistanceType === 'Volna_Vaha' ? 'Volná váha' : TOS.esc(ex.gymName || 'Stroj')) +
                '</span>' +
                (ex.targetSetsReps ? '<span class="badge">' + TOS.esc(ex.targetSetsReps) + '</span>' : '') +
                (ex.targetRir ? '<span class="badge">' + TOS.esc(ex.targetRir) + '</span>' : '') +
                (doneSets > 0
                  ? '<span class="badge ' + (doneSets >= targetSets ? 'badge-green' : 'badge-blue') + '">' + doneSets + '/' + targetSets + (doneSets >= targetSets ? ' ✓' : '') + '</span>'
                  : '') +
              '</div>' +
              '<div style="font-weight:700;font-size:15.5px">' + TOS.esc(ex.name) + '</div>' +
            '</div>' +
            '<div class="row">' +
              '<button type="button" class="btn btn-sm btn-ghost" data-ramp-ex="' + TOS.esc(ex.id) + '" title="Ramp-up rozcvičení">Ramp</button>' +
              '<button type="button" class="btn btn-sm btn-primary" data-log-ex="' + TOS.esc(ex.id) + '">+ Série</button>' +
            '</div>' +
          '</div>';

        if (ex.machineSetup) {
          html += '<div class="setup-box"><strong>Nastavení:</strong> ' + TOS.esc(ex.machineSetup) + '</div>';
        }

        html += '<div class="ghost-line">';
        if (lastTop) {
          html += '<span>Minule Top: <strong class="tabular">' + TOS.esc(lastTop.perfText) + '</strong> (' + TOS.formatDateShortCZ(lastTop.date) + ')</span>';
        } else {
          html += '<span>Zatím bez záznamu z minulých dnů</span>';
        }
        if (bestPR) {
          html += '<span style="color:var(--gold)">PR: ' + (bestPR.isBW ? (bestPR.reps + ' op.') : (bestPR.e1rm + ' kg 1RM')) + '</span>';
        }
        html += '</div>';

        if (ex.biomechanics || ex.safetyProtocol) {
          html +=
            '<details style="margin-top:7px"><summary>Biomechanika & protokol</summary>' +
            '<div class="small muted" style="margin-top:5px">' +
              (ex.biomechanics ? '<div>' + TOS.esc(ex.biomechanics) + '</div>' : '') +
              (ex.safetyProtocol ? '<div style="margin-top:4px;color:var(--gold)">Bezpečnost: ' + TOS.esc(ex.safetyProtocol) + '</div>' : '') +
            '</div></details>';
        }

        if (exTodaySets.length > 0) {
          html += '<div style="margin-top:8px">';
          exTodaySets.forEach(function (s) {
            const isTop = s.setType === 'Top Set';
            html +=
              '<div class="set-row ' + (isTop ? 'top-set' : 'backoff-set') + (s.isProgress ? ' is-progress' : '') + '">' +
                '<div style="cursor:pointer;flex:1" data-edit-set="' + TOS.esc(s.id) + '" data-edit-ex="' + TOS.esc(ex.id) + '">' +
                  '<div class="row-wrap">' +
                    '<span class="badge ' + (isTop ? 'badge-gold' : 'badge-blue') + '">' + TOS.esc(s.setType) + '</span>' +
                    '<strong class="tabular">' + TOS.esc(s.perfText) + '</strong>' +
                    (s.isPR ? '<span class="badge badge-gold">Nové PR</span>' : '') +
                    (s.isProgress ? '<span class="badge badge-green">↑ Progres</span>' : '') +
                  '</div>' +
                  (s.e1rm > 0 ? '<div class="small muted tabular" style="margin-top:2px">1RM: ' + s.e1rm + ' kg • Tonáž: ' + s.tonnage + ' kg</div>' : '') +
                '</div>' +
                (isTop
                  ? '<button type="button" class="btn btn-sm" data-backoff-ex="' + TOS.esc(ex.id) + '">+ Back-off</button>'
                  : '<button type="button" class="btn btn-sm btn-ghost" data-edit-set="' + TOS.esc(s.id) + '" data-edit-ex="' + TOS.esc(ex.id) + '">Upravit</button>') +
              '</div>';
          });
          html += '</div>';
        }

        html += '</div>';
      });
    }

    html += '<button type="button" id="btn-add-extra-ex" class="btn btn-ghost btn-block" style="margin-bottom:12px">+ Přidat další cvik / alternativu do dneška</button>';

    const planList = (TOS.state.data.planStrength && TOS.state.data.planStrength[phaseCode]) || [];
    if (planList.length > 0) {
      html +=
        '<div class="card">' +
          '<details><summary>Referenční šablona z listu ' + phaseCode + ' (' + planList.length + ' vzorů)</summary>' +
          '<div style="margin-top:8px">' +
            planList.map(function (p) {
              return '<div style="padding:7px 0;border-bottom:1px solid var(--border)">' +
                '<div class="small muted">' + TOS.esc(p.pattern) + ' • ' + TOS.esc(p.sets) + '×' + TOS.esc(p.reps) + ' (' + TOS.esc(p.intensity) + ')</div>' +
                '<div style="font-weight:600">' + TOS.esc(p.name) + '</div>' +
                (p.note ? '<div class="small muted" style="margin-top:2px">' + TOS.esc(p.note) + '</div>' : '') +
              '</div>';
            }).join('') +
          '</div></details>' +
        '</div>';
    }

    return html;
  }

  /* ==================== RENDER VYTRVALOSTNÍCH A KOMPENZAČNÍCH FÁZÍ ==================== */

  function renderTodayPhaseActivities(phaseCode, typeHint) {
    const today = TOS.todayISO();
    const list = (TOS.state.data.activityLogs || []).filter(function (a) {
      if (a.date !== today) return false;
      if (String(a.type || '').toLowerCase().indexOf('big3') !== -1) return false;
      return a.phase === phaseCode || (typeHint && String(a.type || '').toLowerCase() === typeHint.toLowerCase());
    });
    if (!list.length) return '';
    return '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">' +
      '<div class="small muted" style="font-weight:700;margin-bottom:4px">Dnes zapsáno (' + list.length + ') — klikni pro úpravu:</div>' +
      list.map(function (a) {
        return '<div class="set-row" style="cursor:pointer;border-left:3px solid var(--green)" data-edit-act="' + TOS.esc(a.id) + '">' +
          '<div><strong>' + TOS.esc(a.detail || a.type) + '</strong>' + (a.note ? '<div class="small muted">' + TOS.esc(a.note) + '</div>' : '') + '</div>' +
          '<span class="badge badge-green tabular">' + TOS.esc(a.value || 'OK') + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function hasTodayPhaseActivity(phaseCode, typeHint) {
    const today = TOS.todayISO();
    return (TOS.state.data.activityLogs || []).some(function (a) {
      if (a.date !== today) return false;
      if (String(a.type || '').toLowerCase().indexOf('big3') !== -1) return false;
      return a.phase === phaseCode || (typeHint && String(a.type || '').toLowerCase() === typeHint.toLowerCase());
    });
  }

  function renderF2Phase() {
    const ftp = TOS.state.settings.ftp;
    const vt1 = TOS.state.settings.vt1;
    const rd = TOS.state.ui.readiness;
    const adj = rd === 'high' ? -10 : (rd === 'mild' ? -5 : 0);
    const w = function (pct) { return Math.round((ftp * pct) / 100) + adj; };
    const is90 = local.f2Dur === 90;
    const doneToday = hasTodayPhaseActivity('F2', 'Z2');

    return (
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:10px">' +
          '<div class="row-wrap"><h3 class="card-title">F2 — Kolo Zóna 2</h3>' + (doneToday ? '<span class="badge badge-green">Dnes splněno ✓</span>' : '') + '</div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-sm ' + (!is90 ? 'btn-primary' : '') + '" data-f2-dur="80">80 min</button>' +
            '<button type="button" class="btn btn-sm ' + (is90 ? 'btn-primary' : '') + '" data-f2-dur="90">90 min</button>' +
          '</div>' +
        '</div>' +
        '<div class="row-wrap" style="margin-bottom:10px">' +
          '<span class="badge badge-blue">FTP: ' + ftp + ' W</span>' +
          '<span class="badge badge-green">Strop VT1: ≤ ' + vt1 + ' t/m</span>' +
          (adj < 0 ? '<span class="badge badge-gold">Autoregulace: ' + adj + ' W</span>' : '') +
        '</div>' +
        '<div class="set-row"><span>1. Rozjetí (3 min)</span><strong class="tabular">52 % • ' + Math.round(ftp * 0.52) + ' W</strong></div>' +
        '<div class="set-row top-set"><span>2. Blok A (' + (is90 ? 35 : 30) + ' min, 85–95 RPM)</span><strong class="tabular">63 % • ' + w(63) + ' W</strong></div>' +
        '<div class="set-row top-set"><span>3. Blok B (' + (is90 ? 30 : 25) + ' min, 85–95 RPM)</span><strong class="tabular">61 % • ' + w(61) + ' W</strong></div>' +
        '<div class="set-row backoff-set"><span>4. Blok C (20 min, 85–95 RPM)</span><strong class="tabular">59 % • ' + w(59) + ' W</strong></div>' +
        '<div class="set-row"><span>5. Vyjetí (2 min)</span><strong class="tabular">45 % • ' + Math.round(ftp * 0.45) + ' W</strong></div>' +
        '<div class="setup-box" style="margin-top:10px">' +
          '<strong>Běh alternativa:</strong> ' +
          (rd === 'full'
            ? 'Nohy čerstvé — povoleno 45–50 min v měkkém terénu, 170–180 kroků/min, tep do 142 t/m.'
            : 'Zaznamenána únava — dnes raději trenažér/kolo bez dopadů.') +
        '</div>' +
        '<button type="button" id="btn-log-endurance" class="btn ' + (doneToday ? 'btn-ghost' : 'btn-green') + ' btn-block" style="margin-top:12px">' +
          (doneToday ? '+ Zapsat další F2 aktivitu (W / HR)' : 'Zapsat splněnou F2 (délka, W, HR)') +
        '</button>' +
        renderTodayPhaseActivities('F2', 'Z2') +
      '</div>'
    );
  }

  function renderF4Phase() {
    const ftp = TOS.state.settings.ftp;
    const map = TOS.state.settings.map;
    const rd = TOS.state.ui.readiness;
    const protos = buildF4Protocols(ftp, map, {
      warmup: local.f4Warmup,
      cooldown: local.f4Cooldown,
      reduced: local.f4ReducedBlocks
    });
    const active = protos[local.f4Variant] || protos['4A'];
    const doneToday = hasTodayPhaseActivity('F4', 'VO2max');

    let warnHtml = '';
    if (rd === 'high') {
      warnHtml =
        '<div class="setup-box" style="margin-bottom:10px;border-left-color:var(--red)">' +
          '<strong>Pozor — vysoká únava před VO2max!</strong> Intervaly na 100 % MAP při únavě CNS snižují adaptaci a prodlužují regeneraci před F6. ' +
          '<div class="row-wrap" style="margin-top:6px">' +
            '<button type="button" id="btn-f4-to-z2" class="btn btn-sm btn-gold">Přepnout na F2 (Zóna 2)</button>' +
            '<button type="button" id="btn-f4-reduce" class="btn btn-sm ' + (local.f4ReducedBlocks ? 'btn-primary' : '') + '">' + (local.f4ReducedBlocks ? 'Zkráceno (−1 blok) ✓' : 'Zkrátit o 1 blok') + '</button>' +
          '</div>' +
        '</div>';
    } else if (rd === 'mild') {
      warnHtml =
        '<div class="setup-box" style="margin-bottom:10px;border-left-color:var(--gold)">' +
          '<strong>Mírná únava (F4):</strong> Pokud po prvním bloku nedržíš cílové watty, zkrať jednotku o 1 blok nebo zvol plynulejší 4B/4D.' +
        '</div>';
    }

    return (
      warnHtml +
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 class="card-title">F4 — VO2max Intervaly</h3>' +
          (doneToday ? '<span class="badge badge-green">Dnes splněno ✓</span>' : '') +
        '</div>' +
        '<div class="scroll-strip">' +
          Object.keys(protos).map(function (k) {
            return '<button type="button" class="chip ' + (k === local.f4Variant ? 'active' : '') + '" data-f4-var="' + k + '">' + protos[k].code + ' • ' + protos[k].title + '</button>';
          }).join('') +
        '</div>' +
        '<div class="row-wrap" style="margin-bottom:8px">' +
          '<button type="button" class="chip ' + (local.f4Warmup ? 'active-gold' : '') + '" id="f4-tog-wu">' + (local.f4Warmup ? '✓ ' : '') + 'Rozjetí 10 min</button>' +
          '<button type="button" class="chip ' + (local.f4Cooldown ? 'active-gold' : '') + '" id="f4-tog-cd">' + (local.f4Cooldown ? '✓ ' : '') + 'Vyjetí 5 min</button>' +
          '<button type="button" class="chip ' + (local.f4ReducedBlocks ? 'active-gold' : '') + '" id="f4-tog-red">' + (local.f4ReducedBlocks ? '✓ ' : '') + '−1 blok</button>' +
        '</div>' +
        '<div class="setup-box" style="margin-top:4px;margin-bottom:10px">' +
          '<div class="row-between"><strong>' + TOS.esc(active.title) + '</strong><span class="small muted tabular">~' + active.defaultDuration + ' min</span></div>' +
          '<div class="tabular" style="margin-top:3px">' + TOS.esc(active.summary) + '</div>' +
          '<div class="small muted" style="margin-top:3px">' + TOS.esc(active.targetText) + '</div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<button type="button" id="btn-start-f4" class="btn btn-primary">Spustit hlasový časovač</button>' +
          '<button type="button" id="btn-log-endurance" class="btn ' + (doneToday ? 'btn-ghost' : 'btn-green') + '">' + (doneToday ? '+ Zapsat další' : 'Zapsat F4 (W/HR)') + '</button>' +
        '</div>' +
        renderTodayPhaseActivities('F4', 'VO2max') +
      '</div>' +
      '<div id="iv-timer-box"></div>'
    );
  }

  function renderF5Phase() {
    const ftp = TOS.state.settings.ftp;
    const vt1 = TOS.state.settings.vt1;
    const rd = TOS.state.ui.readiness;
    const is60 = local.f5Dur === 60;
    const adj = rd === 'high' ? -10 : 0;
    const w = function (pct) { return Math.round((ftp * pct) / 100) + adj; };
    const doneToday = hasTodayPhaseActivity('F5', 'Flush');

    return (
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:10px">' +
          '<div class="row-wrap"><h3 class="card-title">F5 — Active Flush (Z1/Z2)</h3>' + (doneToday ? '<span class="badge badge-green">Dnes splněno ✓</span>' : '') + '</div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-sm ' + (!is60 ? 'btn-primary' : '') + '" data-f5-dur="50">50 min</button>' +
            '<button type="button" class="btn btn-sm ' + (is60 ? 'btn-primary' : '') + '" data-f5-dur="60">60 min</button>' +
          '</div>' +
        '</div>' +
        '<div class="row-wrap" style="margin-bottom:10px">' +
          '<span class="badge badge-green">Cílový tep: 118–128 t/m (≤ ' + vt1 + ')</span>' +
          '<span class="badge">Kadence 85–95 RPM</span>' +
          (rd === 'high' ? '<span class="badge badge-gold">Únava: čistá Z1 (−10 W)</span>' : '') +
        '</div>' +
        '<div class="set-row"><span>1. Rozjetí (3 min)</span><strong class="tabular">50 % • ' + w(50) + ' W</strong></div>' +
        '<div class="set-row backoff-set"><span>2. Blok A (' + (is60 ? 30 : 25) + ' min)</span><strong class="tabular">60 % • ' + w(60) + ' W</strong></div>' +
        '<div class="set-row backoff-set"><span>3. Blok B (' + (is60 ? 25 : 20) + ' min)</span><strong class="tabular">57 % • ' + w(57) + ' W</strong></div>' +
        '<div class="set-row"><span>4. Vyjetí (2 min)</span><strong class="tabular">42 % • ' + w(42) + ' W</strong></div>' +
        '<button type="button" id="btn-log-endurance" class="btn ' + (doneToday ? 'btn-ghost' : 'btn-green') + ' btn-block" style="margin-top:12px">' +
          (doneToday ? '+ Zapsat další F5 aktivitu' : 'Zapsat splněnou F5 (délka, W, HR)') +
        '</button>' +
        renderTodayPhaseActivities('F5', 'Flush') +
      '</div>'
    );
  }

  function renderF7Phase() {
    const doneToday = hasTodayPhaseActivity('F7', 'Kompenzace');
    return (
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:6px">' +
          '<h3 class="card-title">F7 — 15min dekompresní protokol</h3>' +
          (doneToday ? '<span class="badge badge-green">Dnes splněno ✓</span>' : '') +
        '</div>' +
        '<p class="small muted" style="margin-top:0">Kompenzace páteře a kyčlí po excentrickém RDL z F6. Spusť vedený časovač s českým hlasem.</p>' +
        '<div style="margin-bottom:12px">' +
          F7_PROTOCOL.map(function (st, i) {
            return '<div class="set-row"><span>' + (i + 1) + '. ' + TOS.esc(st.name) + '</span><span class="small muted tabular">' + formatMMSS(st.sec) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="grid-2">' +
          '<button type="button" id="btn-start-f7" class="btn btn-primary">Spustit 15min protokol</button>' +
          '<button type="button" id="btn-log-endurance" class="btn ' + (doneToday ? 'btn-ghost' : 'btn-green') + '">' + (doneToday ? '+ Zapsat znovu' : 'Zapsat splněnou F7') + '</button>' +
        '</div>' +
        renderTodayPhaseActivities('F7', 'Kompenzace') +
      '</div>' +
      '<div id="iv-timer-box"></div>'
    );
  }

  /* ==================== HLAVNÍ RENDER ZÁLOŽKY DNES ==================== */

  function renderWorkout(container) {
    TOS.ensureTodayReadiness();
    const schedule = TOS.state.data.schedule;
    const idx = Math.max(0, Math.min(schedule.length - 1, TOS.state.ui.currentPhaseIdx || 0));
    const phase = schedule[idx] || schedule[0];
    const phaseCode = TOS.phaseIdxToCode(idx);
    const splitKey = TOS.phaseIdxToSplitKey(idx);
    const readiness = TOS.state.ui.readiness || 'full';
    const suggestion = TOS.getSuggestedNextPhase();

    let html = '';

    // Chytrý návrh dnešní fáze (pokud uživatel kouká na jinou, než která logicky následuje po posledním tréninku)
    if (suggestion && suggestion.nextPhaseIdx !== idx && suggestion.daysAgo !== null && suggestion.daysAgo <= 7) {
      const sugPhase = schedule[suggestion.nextPhaseIdx];
      if (sugPhase) {
        const whenTxt = suggestion.daysAgo === 0 ? 'dnes' : (suggestion.daysAgo === 1 ? 'včera' : ('před ' + suggestion.daysAgo + ' dny'));
        html +=
          '<div class="suggest-banner">' +
            '<span>Naposledy: <strong>' + TOS.esc(suggestion.lastLabel) + '</strong> (' + whenTxt + ') → na řadě <strong>F' + (suggestion.nextPhaseIdx + 1) + '</strong></span>' +
            '<button type="button" class="btn btn-sm btn-primary" id="btn-accept-sug">Přepnout</button>' +
          '</div>';
      }
    }

    // 1. Pás výběru fáze F1–F7
    html += '<div class="scroll-strip">';
    schedule.forEach(function (ph, i) {
      html += '<button type="button" class="chip ' + (i === idx ? 'active' : '') + '" data-phase-idx="' + i + '">F' + (i + 1) + ' • ' + TOS.esc(ph.unit) + '</button>';
    });
    html += '</div>';

    // 2. Karta aktivní fáze + autoregulace
    html +=
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<div class="row-wrap" style="margin-bottom:4px">' +
              '<span class="badge badge-blue">' + TOS.esc(phase.phase) + '</span>' +
              '<span class="badge">' + TOS.esc(phase.unit) + '</span>' +
            '</div>' +
            '<h2 class="card-title">' + TOS.esc(phase.focus) + '</h2>' +
          '</div>' +
          '<button type="button" id="btn-next-phase" class="btn btn-sm btn-ghost">Další fáze →</button>' +
        '</div>' +
        '<p class="small muted" style="margin:0 0 10px 0">' + TOS.esc(phase.context) + '</p>' +
        '<div class="row-between" style="border-top:1px solid var(--border);padding-top:10px">' +
          '<span class="small muted" style="font-weight:600">Připravenost (HRV / CNS):</span>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-sm ' + (readiness === 'full' ? 'btn-green' : '') + '" data-rd="full">Plná</button>' +
            '<button type="button" class="btn btn-sm ' + (readiness === 'mild' ? 'btn-gold' : '') + '" data-rd="mild">Mírná</button>' +
            '<button type="button" class="btn btn-sm ' + (readiness === 'high' ? 'btn-danger' : '') + '" data-rd="high">Únava</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    // 3. Obsah podle typu fáze
    if (splitKey) {
      html += renderStrengthPhase(idx, phaseCode, splitKey);
    } else if (idx === 1) {
      html += renderF2Phase();
    } else if (idx === 3) {
      html += renderF4Phase();
    } else if (idx === 4) {
      html += renderF5Phase();
    } else {
      html += renderF7Phase();
    }

    // 4. Relevantní podněty ke zlepšení pro tuto fázi
    const ideas = (TOS.state.data.ideas || []).filter(function (it) {
      return (it.targetPhase || '').indexOf(phaseCode) !== -1 || (it.targetPhase || '').indexOf('Fáze ' + (idx + 1)) !== -1;
    });
    if (ideas.length > 0) {
      html +=
        '<div class="card">' +
          '<details><summary>Podněty ke zlepšení pro ' + phaseCode + ' (' + ideas.length + ')</summary>' +
          ideas.map(function (it) {
            return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
              '<div class="row-wrap"><span class="badge badge-gold">' + TOS.esc(it.priority) + '</span><strong>' + TOS.esc(it.area) + '</strong></div>' +
              '<div class="small" style="margin-top:4px">' + TOS.esc(it.recommendation) + '</div>' +
              (it.trigger ? '<div class="small muted" style="margin-top:2px">Spouštěč: ' + TOS.esc(it.trigger) + '</div>' : '') +
            '</div>';
          }).join('') +
          '</details>' +
        '</div>';
    }

    container.innerHTML = html;
    updateIntervalTimerUI();
    TOS.restTimer.syncExternalBar();

    // ==================== EVENT LISTENERS ====================
    const sugBtn = container.querySelector('#btn-accept-sug');
    if (sugBtn && suggestion) {
      sugBtn.addEventListener('click', function () {
        TOS.state.ui.currentPhaseIdx = suggestion.nextPhaseIdx;
        TOS.save();
        renderWorkout(container);
      });
    }

    container.querySelectorAll('[data-phase-idx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TOS.state.ui.currentPhaseIdx = parseInt(btn.dataset.phaseIdx, 10);
        TOS.save();
        renderWorkout(container);
      });
    });

    const nextBtn = container.querySelector('#btn-next-phase');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        TOS.state.ui.currentPhaseIdx = (idx + 1) % schedule.length;
        TOS.save();
        renderWorkout(container);
        TOS.toast('Přepnuto na ' + schedule[TOS.state.ui.currentPhaseIdx].phase);
      });
    }

    container.querySelectorAll('[data-rd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TOS.setReadiness(btn.dataset.rd);
        renderWorkout(container);
      });
    });

    const gymBtn = container.querySelector('#btn-w-gym');
    if (gymBtn) gymBtn.addEventListener('click', function () { TOS.openQuickGymModal(); });

    const warmupBtn = container.querySelector('#btn-w-warmup');
    if (warmupBtn) warmupBtn.addEventListener('click', function () { TOS.switchTab('big3'); });

    // Silové akce
    container.querySelectorAll('[data-log-ex]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const ex = TOS.getCatalogById(btn.dataset.logEx);
        if (ex) openLogSetModal(ex, { setType: 'Top Set' });
      });
    });

    container.querySelectorAll('[data-backoff-ex]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const ex = TOS.getCatalogById(btn.dataset.backoffEx);
        if (ex) openLogSetModal(ex, { setType: 'Back-off Set' });
      });
    });

    container.querySelectorAll('[data-edit-set]').forEach(function (el) {
      el.addEventListener('click', function () {
        const log = TOS.state.data.strengthLogs.find(function (l) { return l.id === el.dataset.editSet; });
        const ex = TOS.getCatalogById(el.dataset.editEx) || (log ? { id: log.exerciseId, name: log.exerciseName, resistanceType: log.resistanceType, gymId: log.gymId } : null);
        if (log && ex) openLogSetModal(ex, { editLog: log });
      });
    });

    container.querySelectorAll('[data-ramp-ex]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const ex = TOS.getCatalogById(btn.dataset.rampEx);
        if (!ex) return;
        const activeGym = TOS.getActiveGym();
        const mKey = TOS.computeMachineKey(ex.resistanceType, ex.gymName || (activeGym ? activeGym.name : ''), ex.name);
        const lastTop = TOS.getLastSetForMachine(mKey, 'Top Set', TOS.todayISO()) || TOS.getLastSetForMachine(mKey, 'Top Set');
        openRampUpModal(ex, lastTop ? lastTop.weight : 80);
      });
    });

    const addExtraBtn = container.querySelector('#btn-add-extra-ex');
    if (addExtraBtn) {
      addExtraBtn.addEventListener('click', function () {
        openAddExtraExerciseModal(phaseCode, splitKey);
      });
    }

    // Vytrvalostní přepínače
    container.querySelectorAll('[data-f2-dur]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.f2Dur = parseInt(btn.dataset.f2Dur, 10);
        renderWorkout(container);
      });
    });
    container.querySelectorAll('[data-f5-dur]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.f5Dur = parseInt(btn.dataset.f5Dur, 10);
        renderWorkout(container);
      });
    });
    container.querySelectorAll('[data-f4-var]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.f4Variant = btn.dataset.f4Var;
        renderWorkout(container);
      });
    });

    const f4Wu = container.querySelector('#f4-tog-wu');
    if (f4Wu) f4Wu.addEventListener('click', function () { local.f4Warmup = !local.f4Warmup; renderWorkout(container); });
    const f4Cd = container.querySelector('#f4-tog-cd');
    if (f4Cd) f4Cd.addEventListener('click', function () { local.f4Cooldown = !local.f4Cooldown; renderWorkout(container); });
    const f4Red = container.querySelector('#f4-tog-red');
    if (f4Red) f4Red.addEventListener('click', function () { local.f4ReducedBlocks = !local.f4ReducedBlocks; renderWorkout(container); });

    const f4ToZ2 = container.querySelector('#btn-f4-to-z2');
    if (f4ToZ2) {
      f4ToZ2.addEventListener('click', function () {
        TOS.state.ui.currentPhaseIdx = 1;
        TOS.save();
        renderWorkout(container);
        TOS.toast('Přepnuto na F2 Zóna 2');
      });
    }
    const f4ReduceWarn = container.querySelector('#btn-f4-reduce');
    if (f4ReduceWarn) {
      f4ReduceWarn.addEventListener('click', function () {
        local.f4ReducedBlocks = !local.f4ReducedBlocks;
        renderWorkout(container);
      });
    }

    const startF4 = container.querySelector('#btn-start-f4');
    if (startF4) {
      startF4.addEventListener('click', function () {
        const protos = buildF4Protocols(TOS.state.settings.ftp, TOS.state.settings.map, {
          warmup: local.f4Warmup,
          cooldown: local.f4Cooldown,
          reduced: local.f4ReducedBlocks
        });
        const p = protos[local.f4Variant];
        if (p) {
          startIntervalTimer(p.buildSteps(), 'F4 ' + p.code + ' ' + p.title, 'F4', {
            phase: 'F4',
            type: 'VO2max',
            sport: 'Kolo',
            detail: 'F4 ' + p.code + ' ' + p.title,
            durationMin: p.defaultDuration,
            avgWatts: p.defaultWatts
          });
        }
      });
    }

    const startF7 = container.querySelector('#btn-start-f7');
    if (startF7) {
      startF7.addEventListener('click', function () {
        const steps = F7_PROTOCOL.map(function (st) {
          return { kind: 'f7', name: st.name, sec: st.sec, cue: st.cue };
        });
        startIntervalTimer(steps, 'F7 15min dekomprese', 'F7', {
          phase: 'F7',
          type: 'Kompenzace',
          sport: 'Kompenzace',
          detail: 'F7 15min dekomprese',
          durationMin: 15
        });
      });
    }

    const logEndBtn = container.querySelector('#btn-log-endurance');
    if (logEndBtn) {
      logEndBtn.addEventListener('click', function () {
        const ftp = TOS.state.settings.ftp;
        const map = TOS.state.settings.map;
        const rd = TOS.state.ui.readiness;
        if (idx === 1) {
          const adj = rd === 'high' ? -10 : (rd === 'mild' ? -5 : 0);
          openEnduranceLogModal({
            phase: 'F2',
            type: 'Z2',
            sport: 'Kolo',
            detail: 'F2 Zóna 2',
            durationMin: local.f2Dur,
            avgWatts: Math.round(ftp * 0.61) + adj
          });
        } else if (idx === 3) {
          const protos = buildF4Protocols(ftp, map, {
            warmup: local.f4Warmup,
            cooldown: local.f4Cooldown,
            reduced: local.f4ReducedBlocks
          });
          const p = protos[local.f4Variant] || protos['4A'];
          openEnduranceLogModal({
            phase: 'F4',
            type: 'VO2max',
            sport: 'Kolo',
            detail: 'F4 ' + p.code + ' ' + p.title,
            durationMin: p.defaultDuration,
            avgWatts: p.defaultWatts
          });
        } else if (idx === 4) {
          const adj = rd === 'high' ? -10 : 0;
          openEnduranceLogModal({
            phase: 'F5',
            type: 'Flush',
            sport: 'Kolo',
            detail: 'F5 Active Flush',
            durationMin: local.f5Dur,
            avgWatts: Math.round(ftp * 0.58) + adj
          });
        } else {
          openEnduranceLogModal({
            phase: 'F7',
            type: 'Kompenzace',
            sport: 'Kompenzace',
            detail: 'F7 15min dekomprese',
            durationMin: 15
          });
        }
      });
    }

    container.querySelectorAll('[data-edit-act]').forEach(function (el) {
      el.addEventListener('click', function () {
        const act = (TOS.state.data.activityLogs || []).find(function (a) { return a.id === el.dataset.editAct; });
        if (act) openEnduranceLogModal({ editActivity: act });
      });
    });
  }

  TOS.registerView('workout', renderWorkout);
  TOS.openCreateExerciseModal = openCreateExerciseModal;
  TOS.openLogSetModal = openLogSetModal;
  TOS.openEnduranceLogModal = openEnduranceLogModal;
})();
