/**
 * Training OS v2.1 — Záložka Warm-up & Big 3 (přehled z Log_Aktivity + zpětný zápis/zrušení + RAM Warm-up)
 */
(function () {
  'use strict';

  const EXTERNAL_BIG3_URL = 'https://michalspratek0311-byte.github.io/';
  const WARMUP_STORAGE_KEY = 'training_os_warmup_checks';

  const RAM_WARMUP_ITEMS = [
    { id: 'r1', phase: 'Raise', title: 'Zahřátí 3–5 min (kolo / chůze / veslo)', detail: 'Lehká Z1, zvýšení tepové frekvence a promazání kloubů bez únavy.' },
    { id: 'm1', phase: 'Mobilize', title: 'Cat-Camel (8–10 pomalých cyklů)', detail: 'Plynulý pohyb páteře bez tlačení do krajních bolestivých poloh.' },
    { id: 'm2', phase: 'Mobilize', title: 'Kyčle 90/90 + World’s Greatest Stretch (5×/strana)', detail: 'Otevření kyčlí a hrudní rotace před dřepy a kyčelním ohybem.' },
    { id: 'm3', phase: 'Mobilize', title: 'Band Pull-Aparts / lopatkové CARs (15×)', detail: 'Aktivace mezilopatkových svalů a rotátorové manžety před tlaky/tahy.' },
    { id: 'a1', phase: 'Activate', title: 'Glute Bridge (2×8 s 3s výdrží nahoře)', detail: 'Aktivace hýždí a kontrola pánve (klíčové před F6 RDL a F1 dřepy).' },
    { id: 'a2', phase: 'Activate', title: 'Mobilita kotníků (koleno přes špičku 10×/noha)', detail: 'Rozsah dorziflexe pro stabilní dolní pozici Hack dřepu / Leg pressu.' },
    { id: 'p1', phase: 'Potentiate', title: 'Ramp-up 1. hlavního cviku (50 % → 70 % → 85 %)', detail: 'V F3 Upper přidej před dipy 1–2 lehké zahřívací série tricepsu na kladce (RIR 5+).' }
  ];

  function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getWeekMonday(offsetWeeks) {
    const now = new Date();
    const dow = now.getDay();
    const diffToMon = dow === 0 ? -6 : (1 - dow);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + (offsetWeeks * 7), 12, 0, 0);
  }

  function getLast4Weeks() {
    const doneSet = new Set(TOS.state.data.big3Dates || []);
    const today = TOS.todayISO();
    const labels = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const weeks = [];

    for (let w = 0; w >= -3; w--) {
      const mon = getWeekMonday(w);
      const days = [];
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(mon.getTime() + i * 86400000);
        const iso = toISO(d);
        const done = doneSet.has(iso);
        if (done) count++;
        days.push({
          label: labels[i],
          dayNum: d.getDate(),
          iso: iso,
          isToday: iso === today,
          isFuture: iso > today,
          done: done
        });
      }
      weeks.push({
        title: w === 0 ? 'Tento týden' : (w === -1 ? 'Minulý týden' : ('Před ' + Math.abs(w) + ' týdny')),
        count: count,
        days: days
      });
    }
    return weeks;
  }

  function calcBig3Streak() {
    const set = new Set(TOS.state.data.big3Dates || []);
    if (!set.size) return 0;
    const now = new Date();
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    if (!set.has(toISO(cursor))) {
      cursor = new Date(cursor.getTime() - 86400000);
    }
    let streak = 0;
    while (set.has(toISO(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 86400000);
    }
    return streak;
  }

  function loadWarmupChecks() {
    try {
      const raw = localStorage.getItem(WARMUP_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed.date === TOS.todayISO() ? (parsed.checks || {}) : {};
    } catch (e) {
      return {};
    }
  }

  function saveWarmupChecks(checks) {
    try {
      localStorage.setItem(WARMUP_STORAGE_KEY, JSON.stringify({ date: TOS.todayISO(), checks: checks }));
    } catch (e) {}
  }

  function toggleBig3Date(iso, curPhaseCode) {
    const doneSet = new Set(TOS.state.data.big3Dates || []);
    if (doneSet.has(iso)) {
      if (confirm('Zrušit záznam McGill Big 3 pro ' + TOS.formatDateCZ(iso) + '?')) {
        TOS.deleteActivity('', iso, 'big3');
        TOS.toast('Big 3 zrušeno (' + TOS.formatDateShortCZ(iso) + ')');
      }
    } else {
      TOS.logActivity({
        id: 'big3_' + iso,
        date: iso,
        type: 'big3',
        phase: curPhaseCode,
        detail: 'McGill Big 3 (ruční zápis)',
        value: 'hotovo'
      });
      TOS.toast('McGill Big 3 zapsáno (' + TOS.formatDateShortCZ(iso) + ')');
    }
  }

  function renderBig3(container) {
    const weeks = getLast4Weeks();
    const thisWeek = weeks[0];
    const streak = calcBig3Streak();
    const today = TOS.todayISO();
    const yesterday = TOS.shiftDateISO(today, -1);
    const doneSet = new Set(TOS.state.data.big3Dates || []);
    const todayDone = doneSet.has(today);
    const yesterdayDone = doneSet.has(yesterday);

    const checks = loadWarmupChecks();
    const checkedCount = RAM_WARMUP_ITEMS.filter(function (it) { return !!checks[it.id]; }).length;
    const warmupPct = Math.round((checkedCount / RAM_WARMUP_ITEMS.length) * 100);
    const curPhaseCode = TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx);

    let html = '';

    // 1. Karta McGill Big 3 — stav, přímé spuštění, interaktivní týden a 4týdenní historie
    html +=
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<h2 class="card-title">McGill Big 3</h2>' +
            '<div class="small muted">Tento týden: <strong>' + thisWeek.count + '/7</strong> • Série: <strong>' + streak + ' dnů</strong></div>' +
          '</div>' +
          (todayDone ? '<span class="badge badge-green">Dnes splněno</span>' : '<span class="badge badge-gold">Dnes čeká</span>') +
        '</div>' +
        '<div class="cal-grid" style="margin-bottom:8px">' +
          thisWeek.days.map(function (d) {
            const canToggle = !d.isFuture;
            return '<button type="button" class="cal-cell ' + (d.isToday ? 'today' : '') + '" ' +
              (canToggle ? ('data-b3-toggle="' + d.iso + '" style="cursor:pointer;') : 'disabled style="opacity:0.45;cursor:default;') +
              (d.done ? 'background:var(--green-soft);border-color:rgba(16,185,129,0.5)' : '') + '">' +
              '<span class="small muted">' + d.label + '</span>' +
              '<strong class="tabular">' + d.dayNum + '</strong>' +
              '<span style="font-size:12px;font-weight:800;color:' + (d.done ? 'var(--green)' : 'var(--text-dim)') + '">' + (d.done ? '✓' : '·') + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<div class="small muted" style="margin-bottom:10px">Tip: kliknutím na libovolný den výše můžeš Big 3 dopsat zpětně nebo zrušit. Po návratu z externí appky proběhne tichý auto-sync.</div>' +
        '<div class="grid-2">' +
          '<a href="' + TOS.esc(EXTERNAL_BIG3_URL) + '" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none">Otevřít Big 3 app</a>' +
          (todayDone
            ? '<button type="button" id="b3-undo-today" class="btn btn-ghost">Zrušit dnešek ✓</button>'
            : '<button type="button" id="b3-manual-log" class="btn btn-green">Zapsat dnešek</button>') +
        '</div>' +
        (!yesterdayDone
          ? '<button type="button" id="b3-log-yesterday" class="btn btn-sm btn-ghost btn-block" style="margin-top:8px">+ Dopsat včerejšek (' + TOS.formatDateShortCZ(yesterday) + ')</button>'
          : '') +
        '<details style="margin-top:12px"><summary>Historie posledních 4 týdnů</summary>' +
          '<div style="margin-top:8px">' +
            weeks.slice(1).map(function (wk) {
              return '<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border)">' +
                '<span class="small muted">' + wk.title + ' (' + wk.count + '/7)</span>' +
                '<div class="row" style="gap:4px">' +
                  wk.days.map(function (d) {
                    return '<span style="width:18px;height:18px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:' +
                      (d.done ? 'var(--green-soft);color:var(--green);border:1px solid rgba(16,185,129,0.5)' : 'var(--surface-2);color:var(--text-dim)') + '">' +
                      (d.done ? '✓' : d.label[0]) + '</span>';
                  }).join('') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</details>' +
      '</div>';

    // 2. RAM Warm-up Checklist
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

    container.querySelectorAll('[data-b3-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleBig3Date(btn.dataset.b3Toggle, curPhaseCode);
      });
    });

    const manBtn = container.querySelector('#b3-manual-log');
    if (manBtn) {
      manBtn.addEventListener('click', function () {
        toggleBig3Date(today, curPhaseCode);
      });
    }

    const undoBtn = container.querySelector('#b3-undo-today');
    if (undoBtn) {
      undoBtn.addEventListener('click', function () {
        toggleBig3Date(today, curPhaseCode);
      });
    }

    const yestBtn = container.querySelector('#b3-log-yesterday');
    if (yestBtn) {
      yestBtn.addEventListener('click', function () {
        toggleBig3Date(yesterday, curPhaseCode);
      });
    }

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

    const goBtn = container.querySelector('#wu-go-workout');
    if (goBtn) {
      goBtn.addEventListener('click', function () {
        TOS.switchTab('workout');
      });
    }
  }

  TOS.registerView('big3', renderBig3);
})();
