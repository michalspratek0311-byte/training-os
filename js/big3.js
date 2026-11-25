/**
 * Training OS v2.0 — Záložka Big 3 (McGill Big 3 časovač, týdenní přehled Po–Ne, RAM Warm-up)
 */
(function () {
  'use strict';

  const WARMUP_STORAGE_KEY = 'training_os_warmup_checks';

  const RAM_WARMUP_ITEMS = [
    { id: 'r1', phase: 'Raise', title: 'Zahřátí 3–5 min (kolo / chůze / veslo)', detail: 'Lehká Z1, zvýšení tepové frekvence a promazání kloubů bez únavy.' },
    { id: 'm1', phase: 'Mobilize', title: 'Cat-Camel (8–10 pomalých cyklů)', detail: 'Plynulý pohyb páteře bez tlačení do krajních bolestivých poloh.' },
    { id: 'm2', phase: 'Mobilize', title: 'Kyčle 90/90 + World’s Greatest Stretch (5×/strana)', detail: 'Otevření kyčlí a hrudní rotace před dřepy a kyčelním ohybem.' },
    { id: 'm3', phase: 'Mobilize', title: 'Band Pull-Aparts / lopatkové CARs (15×)', detail: 'Aktivace mezilopatkových svalů a rotátorové manžety před tlaky/tahy.' },
    { id: 'a1', phase: 'Activate', title: 'Glute Bridge (2×8 s 3s výdrží nahoře)', detail: 'Aktivace hýždí a kontrola pánve (klíčové hlavně před F6 RDL a F1 dřepy).' },
    { id: 'a2', phase: 'Activate', title: 'Mobilita kotníků (koleno přes špičku 10×/noha)', detail: 'Rozsah dorziflexe pro stabilní dolní pozici Hack dřepu / Leg pressu.' },
    { id: 'p1', phase: 'Potentiate', title: 'Ramp-up 1. hlavního cviku (50 % → 70 % → 85 %)', detail: 'V F3 Upper přidej před dipy 1–2 lehké zahřívací série tricepsu na kladce (RIR 5+).' }
  ];

  const local = {
    preset: '642', // '642' (Klasická pyramida 6-4-2) | '321' (Rychlá 3-2-1)
    holdSec: 10,
    repRestSec: 3,
    setRestSec: 15,
    timer: {
      running: false,
      paused: false,
      completed: false,
      timerId: null,
      steps: [],
      idx: 0,
      remSec: 0
    }
  };

  /* ==================== GENERÁTOR KROKŮ MCGILL BIG 3 ==================== */

  function buildBig3Steps() {
    const hold = local.holdSec;
    const repRest = local.repRestSec;
    const setRest = local.setRestSec;
    const steps = [];

    steps.push({
      ex: 'Příprava',
      kind: 'prep',
      label: 'Lehni si na podložku',
      cue: 'Ruce pod bedra, jedna noha pokrčená (levá), druhá natažená. Neutrální páteř.',
      sec: 8,
      speech: 'Připrav se na McGill Big 3. Začínáme Curl Up, pokrčená levá noha.'
    });

    // 1. CURL-UP (symetrické rozdělení levé a pravé pokrčené nohy)
    if (local.preset === '321') {
      // 3 levá → výměna v pauze → 2 pravá → pauza → 1 pravá (celkem 3+3)
      addCurlUpBlock(steps, 3, 'Levá noha pokrčená', 1, 3, hold, repRest);
      steps.push({
        ex: 'Curl-Up',
        kind: 'switch',
        label: 'Pauza & výměna nohy',
        cue: 'Natáhni levou nohu, pokrč pravou nohu. Uvolni krk.',
        sec: setRest,
        speech: 'Pauza. Vyměň nohy, pokrč pravou nohu.'
      });
      addCurlUpBlock(steps, 2, 'Pravá noha pokrčená', 2, 3, hold, repRest);
      steps.push({
        ex: 'Curl-Up',
        kind: 'rest',
        label: 'Krátká pauza (pravá zůstává)',
        cue: 'Krátký nádech, připrav poslední 1 opakování s pravou pokrčenou.',
        sec: Math.min(10, setRest),
        speech: 'Krátká pauza, poslední opakování.'
      });
      addCurlUpBlock(steps, 1, 'Pravá noha pokrčená', 3, 3, hold, repRest);
    } else {
      // Klasická pyramida 6-4-2: každá série půlená L/P (3+3, 2+2, 1+1)
      const pyramid = [6, 4, 2];
      pyramid.forEach(function (totalReps, sIdx) {
        const half = totalReps / 2;
        addCurlUpBlock(steps, half, 'Levá noha pokrčená', sIdx + 1, 3, hold, repRest);
        steps.push({
          ex: 'Curl-Up',
          kind: 'switch',
          label: 'Výměna pokrčené nohy',
          cue: 'Rychle vyměň nohy — pokrč pravou nohu, ruce zůstávají pod bedry.',
          sec: 6,
          speech: 'Vyměň nohy.'
        });
        addCurlUpBlock(steps, half, 'Pravá noha pokrčená', sIdx + 1, 3, hold, repRest);
        if (sIdx < pyramid.length - 1) {
          steps.push({
            ex: 'Curl-Up',
            kind: 'rest',
            label: 'Pauza mezi sériemi (' + (sIdx + 1) + '/3)',
            cue: 'Uvolni břišní stěnu, dýchej nosem. Na další sérii opět pokrč levou nohu.',
            sec: setRest,
            speech: 'Pauza mezi sériemi.'
          });
        }
      });
    }

    // Přechod na Side Plank
    steps.push({
      ex: 'Side Plank',
      kind: 'switch',
      label: 'Přechod na Boční prkno — Levý bok',
      cue: 'Opři se o levé předloktí, nohy nůžkově nebo nad sebou, zpevni trup.',
      sec: setRest,
      speech: 'Přecházíme na boční prkno, levý bok.'
    });

    // 2. SIDE PLANK (Levá & Pravá po sériích pyramidy)
    const spPyramid = local.preset === '321' ? [3, 2, 1] : [6, 4, 2];
    spPyramid.forEach(function (reps, sIdx) {
      addHoldBlock(steps, 'Side Plank', 'Levý bok', reps, sIdx + 1, spPyramid.length, hold, repRest, 'Pánev dopředu, tělo v jedné přímce, pevné rameno.');
      steps.push({
        ex: 'Side Plank',
        kind: 'switch',
        label: 'Přetočení na Pravý bok',
        cue: 'Plynule se přetoč na pravé předloktí, srovnej osu těla.',
        sec: 10,
        speech: 'Vyměň stranu, pravý bok.'
      });
      addHoldBlock(steps, 'Side Plank', 'Pravý bok', reps, sIdx + 1, spPyramid.length, hold, repRest, 'Pánev dopředu, bez propadání v boku, klidný dech.');
      if (sIdx < spPyramid.length - 1) {
        steps.push({
          ex: 'Side Plank',
          kind: 'rest',
          label: 'Pauza mezi sériemi (' + (sIdx + 1) + '/' + spPyramid.length + ')',
          cue: 'Uvolni ramena, připrav další sérii na levý bok.',
          sec: setRest,
          speech: 'Pauza.'
        });
      }
    });

    // Přechod na Bird-Dog
    steps.push({
      ex: 'Bird-Dog',
      kind: 'switch',
      label: 'Přechod na Bird-Dog (na všechny čtyři)',
      cue: 'Dlaně pod rameny, kolena pod kyčlemi, neutrální bedra, zpevněný střed.',
      sec: setRest,
      speech: 'Přecházíme na Bird Dog, zaujmi pozici na všech čtyřech.'
    });

    // 3. BIRD-DOG (Střídavě L+P / P+L)
    const bdPyramid = local.preset === '321' ? [3, 2, 1] : [6, 4, 2];
    bdPyramid.forEach(function (reps, sIdx) {
      for (let r = 1; r <= reps; r++) {
        const isLeftArm = r % 2 === 1;
        const sideLbl = isLeftArm ? 'Levá ruka + Pravá noha' : 'Pravá ruka + Levá noha';
        steps.push({
          ex: 'Bird-Dog',
          kind: 'hold',
          label: 'Série ' + (sIdx + 1) + '/' + bdPyramid.length + ' • ' + r + '/' + reps + ' (' + sideLbl + ')',
          cue: 'Zatni pěst, patu tlač dozadu, nezvedej nohu nad úroveň pánve, bedra bez pohybu.',
          sec: hold,
          speech: r === 1 ? ('Jedeme, ' + sideLbl) : sideLbl
        });
        if (r < reps) {
          steps.push({
            ex: 'Bird-Dog',
            kind: 'repRest',
            label: 'Sweep / výměna končetin',
            cue: 'Plynule projeď rukou a kolenem nad podložkou a vyměň diagonálu.',
            sec: repRest,
            speech: ''
          });
        }
      }
      if (sIdx < bdPyramid.length - 1) {
        steps.push({
          ex: 'Bird-Dog',
          kind: 'rest',
          label: 'Pauza mezi sériemi (' + (sIdx + 1) + '/' + bdPyramid.length + ')',
          cue: 'Krátce uvolni zápěstí a střed těla.',
          sec: setRest,
          speech: 'Pauza.'
        });
      }
    });

    return steps;
  }

  function addCurlUpBlock(steps, count, sideLabel, setNum, totalSets, hold, repRest) {
    for (let r = 1; r <= count; r++) {
      steps.push({
        ex: 'Curl-Up',
        kind: 'hold',
        label: 'Série ' + setNum + '/' + totalSets + ' • ' + sideLabel + ' (' + r + '/' + count + ')',
        cue: 'Zpevni břicho (bracing), zvedni hlavu a horní lopatky jen pár cm, brada v ose.',
        sec: hold,
        speech: r === 1 ? ('Drž. ' + sideLabel) : 'Drž.'
      });
      if (r < count) {
        steps.push({
          ex: 'Curl-Up',
          kind: 'repRest',
          label: 'Krátké položení',
          cue: 'Polož hlavu, krátký nádech a znovu zpevni střed.',
          sec: repRest,
          speech: ''
        });
      }
    }
  }

  function addHoldBlock(steps, exName, sideLabel, count, setNum, totalSets, hold, repRest, cue) {
    for (let r = 1; r <= count; r++) {
      steps.push({
        ex: exName,
        kind: 'hold',
        label: 'Série ' + setNum + '/' + totalSets + ' • ' + sideLabel + ' (' + r + '/' + count + ')',
        cue: cue,
        sec: hold,
        speech: r === 1 ? ('Nahoru, ' + sideLabel) : 'Nahoru.'
      });
      if (r < count) {
        steps.push({
          ex: exName,
          kind: 'repRest',
          label: 'Krátký dotyk bokem',
          cue: 'Klesni bokem dolů, krátký nádech a hned zpět nahoru.',
          sec: repRest,
          speech: ''
        });
      }
    }
  }

  function totalProtocolMinutes(steps) {
    const totalSec = steps.reduce(function (acc, s) { return acc + s.sec; }, 0);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ':' + String(sec).padStart(2, '0');
  }

  /* ==================== ŘÍZENÍ ČASOVAČE ==================== */

  function announceBig3Step(step) {
    if (!step) return;
    if (step.kind === 'hold') {
      TOS.audio.beep(880, 170, 'triangle', 0.22);
      if (step.speech) TOS.audio.speak(step.speech);
    } else if (step.kind === 'repRest') {
      TOS.audio.beep(480, 110, 'sine', 0.14);
    } else if (step.kind === 'switch' || step.kind === 'rest' || step.kind === 'prep') {
      TOS.audio.beep(580, 180, 'sine', 0.18);
      if (step.speech) TOS.audio.speak(step.speech);
    }
  }

  function stopBig3Timer(silent) {
    if (local.timer.timerId) {
      clearInterval(local.timer.timerId);
      local.timer.timerId = null;
    }
    local.timer.running = false;
    local.timer.paused = false;
    TOS.wakeLock.release();
    if (!silent) updateBig3TimerCard();
  }

  function startBig3Timer() {
    stopBig3Timer(true);
    const steps = buildBig3Steps();
    local.timer.steps = steps;
    local.timer.idx = 0;
    local.timer.remSec = steps[0] ? steps[0].sec : 0;
    local.timer.running = true;
    local.timer.paused = false;
    local.timer.completed = false;

    TOS.wakeLock.acquire();
    announceBig3Step(steps[0]);
    updateBig3TimerCard();

    local.timer.timerId = setInterval(function () {
      if (!local.timer.running || local.timer.paused) return;
      local.timer.remSec--;

      const cur = local.timer.steps[local.timer.idx];
      if (cur && cur.kind === 'hold' && local.timer.remSec > 0 && local.timer.remSec <= 3) {
        TOS.audio.beep(640, 80, 'sine', 0.14);
      }

      if (local.timer.remSec <= 0) {
        local.timer.idx++;
        if (local.timer.idx >= local.timer.steps.length) {
          finishBig3Session();
          return;
        }
        const nextStep = local.timer.steps[local.timer.idx];
        local.timer.remSec = nextStep.sec;
        announceBig3Step(nextStep);
      }
      updateBig3TimerCard();
    }, 1000);
  }

  function finishBig3Session() {
    stopBig3Timer(true);
    local.timer.completed = true;
    TOS.audio.chime();
    TOS.audio.speak('McGill Big 3 dokončeno, skvělá práce.');
    if (navigator.vibrate) navigator.vibrate([200, 100, 250]);

    const detail = 'McGill Big 3 (' + (local.preset === '321' ? '3-2-1' : '6-4-2') + ', ' + local.holdSec + 's)';
    TOS.logActivity({
      type: 'big3',
      phase: TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx),
      detail: detail,
      value: totalProtocolMinutes(local.timer.steps)
    });
    TOS.toast('McGill Big 3 zapsáno do dnešního logu!');
    if (TOS.state.ui.activeTab === 'big3') {
      TOS.renderActiveTab();
    }
  }

  /* ==================== TÝDENNÍ PŘEHLED PO–NE & STREAK ==================== */

  function getCurrentWeekDays() {
    const now = new Date();
    const dow = now.getDay(); // 0 = Ne, 1 = Po ...
    const diffToMon = dow === 0 ? -6 : (1 - dow);
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon, 12, 0, 0);
    const labels = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const today = TOS.todayISO();
    const doneSet = new Set(TOS.state.data.big3Dates || []);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getTime() + i * 86400000);
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      days.push({
        label: labels[i],
        dayNum: d.getDate(),
        iso: iso,
        isToday: iso === today,
        done: doneSet.has(iso)
      });
    }
    return days;
  }

  function calcBig3Streak() {
    const dates = Array.from(new Set(TOS.state.data.big3Dates || [])).sort();
    if (!dates.length) return 0;
    const set = new Set(dates);
    const today = TOS.todayISO();
    const now = new Date();
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

    // Pokud dnes ještě necvičeno, počítej sérii od včerejška
    if (!set.has(today)) {
      cursor = new Date(cursor.getTime() - 86400000);
    }

    let streak = 0;
    while (true) {
      const iso = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
      if (set.has(iso)) {
        streak++;
        cursor = new Date(cursor.getTime() - 86400000);
      } else {
        break;
      }
    }
    return streak;
  }

  /* ==================== RAM WARM-UP CHECKLIST (DENNÍ STAV) ==================== */

  function loadWarmupChecks() {
    try {
      const raw = localStorage.getItem(WARMUP_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed.date !== TOS.todayISO()) return {};
      return parsed.checks || {};
    } catch (e) {
      return {};
    }
  }

  function saveWarmupChecks(checks) {
    try {
      localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify({
        date: TOS.todayISO(),
        checks: checks
      }));
    } catch (e) {}
  }

  /* ==================== RENDER ČASOVAČE A ZÁLOŽKY ==================== */

  function updateBig3TimerCard() {
    const host = document.getElementById('b3-timer-card');
    if (!host) return;

    if (!local.timer.running) {
      const previewSteps = buildBig3Steps();
      const totalDuration = totalProtocolMinutes(previewSteps);
      const todayDone = (TOS.state.data.big3Dates || []).indexOf(TOS.todayISO()) !== -1;

      host.innerHTML =
        '<div class="card">' +
          '<div class="card-header">' +
            '<div>' +
              '<h2 class="card-title">McGill Big 3 Protokol</h2>' +
              '<div class="small muted">Curl-Up • Side Plank • Bird-Dog (celkem ~' + totalDuration + ')</div>' +
            '</div>' +
            (todayDone ? '<span class="badge badge-green">Dnes hotovo</span>' : '<span class="badge">Čeká dnes</span>') +
          '</div>' +
          '<div class="field">' +
            '<label>Pyramida</label>' +
            '<div class="grid-2">' +
              '<button type="button" class="btn btn-sm ' + (local.preset === '642' ? 'btn-primary' : '') + '" data-b3-preset="642">Klasika 6–4–2</button>' +
              '<button type="button" class="btn btn-sm ' + (local.preset === '321' ? 'btn-primary' : '') + '" data-b3-preset="321">Rychlá 3–2–1</button>' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label>Délka izometrické výdrže</label>' +
            '<div class="grid-3">' +
              [8, 10, 12].map(function (s) {
                return '<button type="button" class="btn btn-sm ' + (local.holdSec === s ? 'btn-primary' : '') + '" data-b3-hold="' + s + '">' + s + ' s</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="grid-2" style="margin-top:12px">' +
            '<button type="button" id="b3-start" class="btn btn-green">Spustit časovač</button>' +
            '<button type="button" id="b3-manual-log" class="btn btn-ghost">Zapsat ručně</button>' +
          '</div>' +
        '</div>';

      host.querySelectorAll('[data-b3-preset]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          local.preset = btn.dataset.b3Preset;
          updateBig3TimerCard();
        });
      });
      host.querySelectorAll('[data-b3-hold]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          local.holdSec = parseInt(btn.dataset.b3Hold, 10);
          updateBig3TimerCard();
        });
      });
      const startBtn = host.querySelector('#b3-start');
      if (startBtn) startBtn.addEventListener('click', startBig3Timer);

      const manBtn = host.querySelector('#b3-manual-log');
      if (manBtn) {
        manBtn.addEventListener('click', function () {
          TOS.logActivity({
            type: 'big3',
            phase: TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx),
            detail: 'McGill Big 3 (ruční zápis)',
            value: 'hotovo'
          });
          TOS.toast('Dnešní McGill Big 3 zapsáno');
          TOS.renderActiveTab();
        });
      }
      return;
    }

    // Aktivní běžící časovač
    const step = local.timer.steps[local.timer.idx];
    const next = local.timer.steps[local.timer.idx + 1];
    const totalPct = Math.round(((local.timer.idx + 1) / local.timer.steps.length) * 100);
    const stepPct = step && step.sec ? Math.round(((step.sec - local.timer.remSec) / step.sec) * 100) : 0;
    const badgeCls = step.kind === 'hold' ? 'badge-green' : (step.kind === 'switch' ? 'badge-gold' : 'badge-blue');

    host.innerHTML =
      '<div class="card" style="border-color:var(--green);background:var(--surface-2)">' +
        '<div class="row-between">' +
          '<span class="badge ' + badgeCls + '">' + TOS.esc(step.ex) + '</span>' +
          '<span class="small muted tabular">Krok ' + (local.timer.idx + 1) + ' / ' + local.timer.steps.length + ' (' + totalPct + ' %)</span>' +
        '</div>' +
        '<div style="text-align:center;font-weight:700;font-size:15.5px;margin-top:8px">' + TOS.esc(step.label) + '</div>' +
        '<div class="timer-display" style="color:' + (step.kind === 'hold' ? 'var(--green)' : 'var(--text)') + '">' + local.timer.remSec + 's</div>' +
        '<div class="small muted" style="text-align:center;margin-bottom:10px">' + TOS.esc(step.cue) + '</div>' +
        '<div class="progress-track" style="margin-bottom:10px"><div class="progress-fill" style="width:' + stepPct + '%;background:' + (step.kind === 'hold' ? 'var(--green)' : 'var(--accent)') + '"></div></div>' +
        (next ? '<div class="small muted" style="text-align:center;margin-bottom:12px">Další: ' + TOS.esc(next.ex + ' — ' + next.label) + '</div>' : '') +
        '<div class="grid-3">' +
          '<button type="button" class="btn btn-sm" id="b3-prev">← Zpět</button>' +
          '<button type="button" class="btn btn-sm btn-primary" id="b3-pause">' + (local.timer.paused ? 'Pokračovat' : 'Pauza') + '</button>' +
          '<button type="button" class="btn btn-sm" id="b3-skip">Další →</button>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-danger btn-block" id="b3-stop" style="margin-top:8px">Ukončit časovač</button>' +
      '</div>';

    host.querySelector('#b3-pause').onclick = function () {
      local.timer.paused = !local.timer.paused;
      updateBig3TimerCard();
    };
    host.querySelector('#b3-skip').onclick = function () {
      local.timer.remSec = 1;
    };
    host.querySelector('#b3-prev').onclick = function () {
      if (local.timer.idx > 0) {
        local.timer.idx--;
        local.timer.remSec = local.timer.steps[local.timer.idx].sec;
        updateBig3TimerCard();
      }
    };
    host.querySelector('#b3-stop').onclick = function () {
      stopBig3Timer(false);
    };
  }

  function renderBig3(container) {
    const weekDays = getCurrentWeekDays();
    const weekDoneCount = weekDays.filter(function (d) { return d.done; }).length;
    const streak = calcBig3Streak();
    const checks = loadWarmupChecks();
    const checkedCount = RAM_WARMUP_ITEMS.filter(function (it) { return !!checks[it.id]; }).length;
    const warmupPct = Math.round((checkedCount / RAM_WARMUP_ITEMS.length) * 100);
    const curPhaseCode = TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx);

    let html = '';

    // 1. Týdenní přehled Po–Ne + statistiky
    html +=
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<div>' +
            '<h3 class="card-title">Týdenní přehled Big 3</h3>' +
            '<div class="small muted">Tento týden: <strong>' + weekDoneCount + '/7</strong> • Série: <strong>' + streak + ' dnů</strong></div>' +
          '</div>' +
          '<span class="badge ' + (weekDoneCount >= 5 ? 'badge-green' : 'badge-blue') + '">' + weekDoneCount + '/7</span>' +
        '</div>' +
        '<div class="cal-grid" style="margin-top:6px">' +
          weekDays.map(function (d) {
            return '<div class="cal-cell ' + (d.isToday ? 'today' : '') + '" style="' + (d.done ? 'background:var(--green-soft);border-color:rgba(16,185,129,0.5)' : '') + '">' +
              '<span class="small muted">' + d.label + '</span>' +
              '<strong class="tabular">' + d.dayNum + '</strong>' +
              '<span style="font-size:12px;font-weight:800;color:' + (d.done ? 'var(--green)' : 'var(--text-dim)') + '">' + (d.done ? '✓' : '·') + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    // 2. Hostovací prvek pro McGill Big 3 časovač
    html += '<div id="b3-timer-card"></div>';

    // 3. RAM Warm-up Checklist
    html +=
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<h3 class="card-title">RAM Warm-up před silovým tréninkem</h3>' +
            '<div class="small muted">Splněno ' + checkedCount + ' / ' + RAM_WARMUP_ITEMS.length + ' (' + warmupPct + ' %)</div>' +
          '</div>' +
          '<button type="button" id="wu-reset" class="btn btn-sm btn-ghost">Reset</button>' +
        '</div>' +
        '<div class="progress-track" style="margin-bottom:10px"><div class="progress-fill" style="width:' + warmupPct + '%;background:var(--green)"></div></div>';

    if (curPhaseCode === 'F3') {
      html += '<div class="setup-box" style="margin-bottom:8px;border-left-color:var(--gold)"><strong>Kontext F3 Upper:</strong> Nevynechej zahřátí loktů (1–2 lehké série tricepsu na kladce) před dipy.</div>';
    } else if (curPhaseCode === 'F6') {
      html += '<div class="setup-box" style="margin-bottom:8px;border-left-color:var(--accent)"><strong>Kontext F6 Full Body B:</strong> Důkladná aktivace hýždí (Glute Bridge) chrání bedra při RDL.</div>';
    }

    RAM_WARMUP_ITEMS.forEach(function (it) {
      const isChecked = !!checks[it.id];
      html +=
        '<label class="set-row" style="cursor:pointer;align-items:flex-start;' + (isChecked ? 'opacity:0.65;border-color:rgba(16,185,129,0.4)' : '') + '">' +
          '<input type="checkbox" data-wu-id="' + it.id + '" ' + (isChecked ? 'checked' : '') + ' style="width:20px;height:20px;margin-top:2px;flex:0 0 auto">' +
          '<div style="flex:1">' +
            '<div class="row-wrap"><span class="badge">' + it.phase + '</span><strong style="' + (isChecked ? 'text-decoration:line-through' : '') + '">' + TOS.esc(it.title) + '</strong></div>' +
            '<div class="small muted" style="margin-top:3px">' + TOS.esc(it.detail) + '</div>' +
          '</div>' +
        '</label>';
    });

    html +=
        '<button type="button" id="wu-go-workout" class="btn btn-primary btn-block" style="margin-top:12px">Hotovo → Přejít na trénink (Dnes)</button>' +
      '</div>';

    container.innerHTML = html;
    updateBig3TimerCard();

    // Event listenery RAM Warm-up
    container.querySelectorAll('[data-wu-id]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const cur = loadWarmupChecks();
        cur[cb.dataset.wuId] = cb.checked;
        saveWarmupChecks(cur);
        renderBig3(container);
      });
    });

    const resetBtn = container.querySelector('#wu-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        saveWarmupChecks({});
        renderBig3(container);
      });
    }

    const goWorkoutBtn = container.querySelector('#wu-go-workout');
    if (goWorkoutBtn) {
      goWorkoutBtn.addEventListener('click', function () {
        TOS.switchTab('workout');
      });
    }
  }

  TOS.registerView('big3', renderBig3);
})();