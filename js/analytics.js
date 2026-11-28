/**
 * Training OS v2.1 — Záložky Progres (Síla + Vytrvalost + Statistiky + PR + Kalendář + Zóny), Katalog a Sync/Nastavení
 */
(function () {
  'use strict';

  const local = {
    analyticsSub: 'strength', // strength | endurance | stats | pr | calendar | zones
    gymFilter: 'active',      // 'active' | 'all' | 'free' | '<gymId>'
    selectedMachineKey: '',
    selectedChartIdx: -1,
    showAllStrengthHist: false,
    selectedEfIdx: -1,
    statsWindowDays: 7,       // 7 (výchozí týdenní objem) | 30 | 0 (vše)
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(), // 0-11
    calSelectedDate: TOS.todayISO(),
    catSearch: '',
    catMuscle: '',
    catGymFilter: 'active'    // 'active' | 'all' | 'free' | '<gymId>'
  };

  /* ==================== HELPERY PRO FILTROVÁNÍ ==================== */

  function resolveGymFilter(filterVal, logs) {
    if (filterVal === 'all') return logs;
    if (filterVal === 'free') {
      return logs.filter(function (l) { return l.resistanceType === 'Volna_Vaha'; });
    }
    const targetGymId = filterVal === 'active' ? TOS.state.ui.activeGymId : filterVal;
    if (!targetGymId) return logs;
    return logs.filter(function (l) {
      return l.resistanceType === 'Volna_Vaha' || !l.gymId || l.gymId === targetGymId;
    });
  }

  function renderGymFilterChips(currentVal, attrName) {
    const activeGym = TOS.getActiveGym();
    const gyms = TOS.state.data.gyms || [];
    const items = [
      { val: 'active', lbl: activeGym ? ('Aktivní (' + activeGym.name + ')') : 'Aktivní fitko' },
      { val: 'all', lbl: 'Všechna fitka' },
      { val: 'free', lbl: 'Jen volné váhy' }
    ];
    gyms.forEach(function (g) {
      if (!activeGym || g.id !== activeGym.id) {
        items.push({ val: g.id, lbl: g.name });
      }
    });
    return '<div class="scroll-strip">' +
      items.map(function (it) {
        return '<button type="button" class="chip ' + (currentVal === it.val ? 'active' : '') + '" ' + attrName + '="' + TOS.esc(it.val) + '">' + TOS.esc(it.lbl) + '</button>';
      }).join('') +
      '</div>';
  }

  function formatYTick(val, range) {
    if (range < 8) return String(Math.round(val * 10) / 10);
    return String(Math.round(val));
  }

  /* ==================== INTERAKTIVNÍ SVG GRAF VÝVOJE SÍLY ==================== */

  function buildStrengthSVG(points, isPureBW, usesBW, selectedIdx) {
    const W = 560;
    const H = 220;
    const padL = 44;
    const padR = 16;
    const padT = 18;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (!points.length) {
      return '<div class="muted small" style="padding:18px 0;text-align:center">Pro tento cvik zatím nejsou žádné Top Sety.</div>';
    }

    const activeIdx = (selectedIdx >= 0 && selectedIdx < points.length) ? selectedIdx : (points.length - 1);
    const primaryVals = points.map(function (p) { return isPureBW ? p.reps : p.e1rm; });
    const secondaryVals = points.map(function (p) { return isPureBW ? p.reps : (usesBW ? p.effectiveWeight : p.weight); });
    const allVals = primaryVals.concat(secondaryVals).filter(function (v) { return v > 0; });
    let minV = Math.min.apply(null, allVals);
    let maxV = Math.max.apply(null, allVals);
    if (!isFinite(minV) || !isFinite(maxV)) { minV = 0; maxV = 10; }
    if (minV === maxV) {
      minV = Math.max(0, minV - 5);
      maxV = maxV + 5;
    } else {
      const margin = (maxV - minV) * 0.12;
      minV = Math.max(0, minV - margin);
      maxV = maxV + margin;
    }
    const range = maxV - minV;

    function xAt(i) {
      if (points.length === 1) return padL + plotW / 2;
      return padL + (i / (points.length - 1)) * plotW;
    }
    function yAt(v) {
      return padT + plotH - ((v - minV) / range) * plotH;
    }

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';

    // Horizontální mřížka (4 linky)
    for (let g = 0; g <= 3; g++) {
      const val = minV + (range * (3 - g)) / 3;
      const y = padT + (plotH * g) / 3;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#27344a" stroke-dasharray="3,3" stroke-width="1"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 4).toFixed(1) + '" fill="#94a3b8" font-size="11" text-anchor="end">' + formatYTick(val, range) + '</text>';
    }

    // Sekundární křivka (pracovní / efektivní váha kg)
    if (!isPureBW && points.length > 1) {
      const dW = points.map(function (p, i) {
        const wVal = usesBW ? p.effectiveWeight : p.weight;
        return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(wVal).toFixed(1);
      }).join(' ');
      svg += '<path d="' + dW + '" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,4" opacity="0.85"/>';
    }

    // Primární křivka (Odhad 1RM nebo opakování)
    if (points.length > 1) {
      const d1 = points.map(function (p, i) {
        const v = isPureBW ? p.reps : p.e1rm;
        return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(v).toFixed(1);
      }).join(' ');
      svg += '<path d="' + d1 + '" fill="none" stroke="#3b82f6" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>';
    }

    // Vertikální vodící linka vybraného bodu
    const selX = xAt(activeIdx);
    svg += '<line x1="' + selX.toFixed(1) + '" y1="' + padT + '" x2="' + selX.toFixed(1) + '" y2="' + (H - padB) + '" stroke="#60a5fa" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"/>';

    // Body + neviditelné dotykové plochy + popisky osy X
    const labelStep = Math.max(1, Math.ceil(points.length / 6));
    points.forEach(function (p, i) {
      const x = xAt(i);
      const v1 = isPureBW ? p.reps : p.e1rm;
      const y1 = yAt(v1);
      const isSel = i === activeIdx;

      if (!isPureBW) {
        const yw = yAt(usesBW ? p.effectiveWeight : p.weight);
        svg += '<circle cx="' + x.toFixed(1) + '" cy="' + yw.toFixed(1) + '" r="' + (isSel ? '4.5' : '3') + '" fill="#f59e0b"/>';
      }
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="' + (isSel ? '6.5' : (p.isAllTimeBest ? '5' : '4')) + '" fill="' + (p.isAllTimeBest ? '#f59e0b' : '#3b82f6') + '" stroke="' + (isSel ? '#ffffff' : '#0b0f17') + '" stroke-width="' + (isSel ? '2' : '1.5') + '"/>';
      svg += '<circle class="chart-point-hit" data-str-pt="' + i + '" cx="' + x.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="15" fill="transparent"/>';

      if (i === 0 || i === points.length - 1 || i % labelStep === 0) {
        svg += '<text x="' + x.toFixed(1) + '" y="' + (H - 10) + '" fill="#94a3b8" font-size="10.5" text-anchor="middle">' + TOS.esc(TOS.formatDateShortCZ(p.date)) + '</text>';
      }
    });

    svg += '</svg>';

    const selPt = points[activeIdx];
    const tooltipHtml = selPt
      ? '<div class="chart-tooltip tabular">' +
          '<span><strong>' + TOS.formatDateCZ(selPt.date) + '</strong> • ' + TOS.esc(selPt.perfText) + '</span>' +
          '<span>' +
            (isPureBW ? ('<strong>' + selPt.reps + ' op.</strong>') : ('1RM <strong>' + selPt.e1rm + ' kg</strong>' + (usesBW ? (' (celk. ' + selPt.effectiveWeight + ' kg)') : ''))) +
            (selPt.isAllTimeBest ? ' <span style="color:var(--gold)">★ PR</span>' : '') +
          '</span>' +
        '</div>'
      : '';

    const legend = isPureBW
      ? '<div class="row-wrap small muted" style="margin-top:6px"><span style="color:#3b82f6">● Opakování (Top Set)</span><span style="color:#f59e0b">● PR</span><span>(klepni na bod pro detail)</span></div>'
      : '<div class="row-wrap small muted" style="margin-top:6px"><span style="color:#3b82f6">━ Odhad 1RM (kg)</span><span style="color:#f59e0b">┅ ' + (usesBW ? 'BW + zátěž (kg)' : 'Pracovní váha (kg)') + '</span><span style="color:#f59e0b">● PR</span></div>';

    return '<div class="chart-wrap">' + svg + '</div>' + tooltipHtml + legend;
  }

  /* ==================== INTERAKTIVNÍ SVG GRAF AEROBNÍ EFEKTIVITY (EF = W/HR) ==================== */

  function buildEfSVG(points, selectedIdx) {
    const W = 560;
    const H = 200;
    const padL = 44;
    const padR = 16;
    const padT = 18;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (!points.length) {
      return '<div class="muted small" style="padding:16px 0;text-align:center">Zapiš u F2 / F5 průměrné watty (W) i průměrný tep (t/m) a zobrazí se trend aerobní efektivity (EF = W / tep).</div>';
    }

    const activeIdx = (selectedIdx >= 0 && selectedIdx < points.length) ? selectedIdx : (points.length - 1);
    const vals = points.map(function (p) { return p.ef; });
    let minV = Math.min.apply(null, vals);
    let maxV = Math.max.apply(null, vals);
    if (minV === maxV) {
      minV = Math.max(0, minV - 0.15);
      maxV = maxV + 0.15;
    } else {
      const m = (maxV - minV) * 0.15;
      minV = Math.max(0, minV - m);
      maxV = maxV + m;
    }
    const range = maxV - minV;

    function xAt(i) {
      if (points.length === 1) return padL + plotW / 2;
      return padL + (i / (points.length - 1)) * plotW;
    }
    function yAt(v) {
      return padT + plotH - ((v - minV) / range) * plotH;
    }

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    for (let g = 0; g <= 3; g++) {
      const val = minV + (range * (3 - g)) / 3;
      const y = padT + (plotH * g) / 3;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="#27344a" stroke-dasharray="3,3" stroke-width="1"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 4).toFixed(1) + '" fill="#94a3b8" font-size="11" text-anchor="end">' + val.toFixed(2) + '</text>';
    }

    if (points.length > 1) {
      const d = points.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(p.ef).toFixed(1);
      }).join(' ');
      svg += '<path d="' + d + '" fill="none" stroke="#10b981" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>';
    }

    const labelStep = Math.max(1, Math.ceil(points.length / 6));
    points.forEach(function (p, i) {
      const x = xAt(i);
      const y = yAt(p.ef);
      const isSel = i === activeIdx;
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (isSel ? '6' : '4') + '" fill="#10b981" stroke="' + (isSel ? '#fff' : '#0b0f17') + '" stroke-width="1.8"/>';
      svg += '<circle class="chart-point-hit" data-ef-pt="' + i + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" fill="transparent"/>';
      if (i === 0 || i === points.length - 1 || i % labelStep === 0) {
        svg += '<text x="' + x.toFixed(1) + '" y="' + (H - 10) + '" fill="#94a3b8" font-size="10.5" text-anchor="middle">' + TOS.esc(TOS.formatDateShortCZ(p.date)) + '</text>';
      }
    });
    svg += '</svg>';

    const sel = points[activeIdx];
    const tip = sel
      ? '<div class="chart-tooltip tabular">' +
          '<span><strong>' + TOS.formatDateCZ(sel.date) + '</strong> • ' + TOS.esc(sel.detail) + '</span>' +
          '<span><strong>EF ' + sel.ef.toFixed(2) + '</strong> (' + sel.avgWatts + ' W / ' + sel.avgHr + ' t/m)</span>' +
        '</div>'
      : '';

    return '<div class="chart-wrap">' + svg + '</div>' + tip;
  }

  /* ==================== PODZÁLOŽKY PROGRESU ==================== */

  function renderSubStrength(allLogs) {
    const filtered = resolveGymFilter(local.gymFilter, allLogs);
    const topSets = filtered.filter(function (l) { return l.setType === 'Top Set'; });

    const byKey = {};
    topSets.forEach(function (l) {
      const k = l.machineKey || l.exerciseName;
      if (!byKey[k]) {
        byKey[k] = { key: k, muscle: l.muscle || 'Ostatní', split: l.split || '', count: 0, logs: [] };
      }
      byKey[k].count++;
      byKey[k].logs.push(l);
    });

    const keys = Object.values(byKey).sort(function (a, b) {
      if (a.muscle !== b.muscle) return a.muscle.localeCompare(b.muscle, 'cs');
      return a.key.localeCompare(b.key, 'cs');
    });

    if (!keys.length) {
      return renderGymFilterChips(local.gymFilter, 'data-agym') +
        '<div class="card"><p class="muted small" style="margin:0">Pro zvolený filtr zatím nejsou žádné Top Sety.</p></div>';
    }

    if (!local.selectedMachineKey || !byKey[local.selectedMachineKey]) {
      const bestDefault = keys.slice().sort(function (a, b) { return b.count - a.count; })[0];
      local.selectedMachineKey = bestDefault ? bestDefault.key : keys[0].key;
      local.selectedChartIdx = -1;
      local.showAllStrengthHist = false;
    }

    const activeGroup = byKey[local.selectedMachineKey];
    const dailyBestMap = {};
    activeGroup.logs.forEach(function (l) {
      const cur = dailyBestMap[l.date];
      if (!cur || (l.score || 0) >= (cur.score || 0)) dailyBestMap[l.date] = l;
    });
    const series = Object.keys(dailyBestMap).sort().map(function (d) { return dailyBestMap[d]; });
    const isPureBW = series.length > 0 && series.every(function (p) { return p.isBW; });
    const usesBW = series.some(function (p) { return p.usesBW; });

    const first = series[0];
    const latest = series[series.length - 1];
    const best = series.reduce(function (m, p) {
      return (p.score || 0) > (m.score || 0) ? p : m;
    }, series[0]);

    const delta = series.length > 1
      ? Math.round(((latest.score - first.score)) * 10) / 10
      : 0;

    const musclesOrder = {};
    keys.forEach(function (k) {
      if (!musclesOrder[k.muscle]) musclesOrder[k.muscle] = [];
      musclesOrder[k.muscle].push(k);
    });

    let optionsHtml = '';
    Object.keys(musclesOrder).sort(function (a, b) { return a.localeCompare(b, 'cs'); }).forEach(function (m) {
      optionsHtml += '<optgroup label="' + TOS.esc(m) + '">';
      musclesOrder[m].forEach(function (k) {
        optionsHtml += '<option value="' + TOS.esc(k.key) + '" ' + (k.key === local.selectedMachineKey ? 'selected' : '') + '>' +
          TOS.esc(k.key) + ' (' + k.count + '×)</option>';
      });
      optionsHtml += '</optgroup>';
    });

    let html = renderGymFilterChips(local.gymFilter, 'data-agym');
    html +=
      '<div class="card">' +
        '<div class="field" style="margin-bottom:10px">' +
          '<label>Vyber stroj / cvik (izolováno podle posilovny)</label>' +
          '<select id="an-machine-sel" class="select">' + optionsHtml + '</select>' +
        '</div>' +
        '<div class="grid-3" style="margin-bottom:10px">' +
          '<div class="stat-box"><div class="stat-val">' + (isPureBW ? (latest.reps + ' op.') : (latest.e1rm + ' kg')) + '</div><div class="stat-lbl">Poslední ' + (isPureBW ? 'výkon' : '1RM') + '</div></div>' +
          '<div class="stat-box"><div class="stat-val" style="color:var(--gold)">' + (isPureBW ? (best.reps + ' op.') : (best.e1rm + ' kg')) + '</div><div class="stat-lbl">Absolutní PR</div></div>' +
          '<div class="stat-box"><div class="stat-val" style="color:' + (delta >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (delta >= 0 ? '+' : '') + delta + (isPureBW ? '' : ' kg') + '</div><div class="stat-lbl">Změna celkem</div></div>' +
        '</div>' +
        buildStrengthSVG(series, isPureBW, usesBW, local.selectedChartIdx) +
      '</div>';

    const reversedLogs = activeGroup.logs.slice().reverse();
    const visibleLogs = local.showAllStrengthHist ? reversedLogs : reversedLogs.slice(0, 15);

    html += '<div class="section-label">Historie Top Setů (' + reversedLogs.length + ') — klikni pro úpravu</div>';
    html += '<div class="card" style="padding:8px 12px">';
    visibleLogs.forEach(function (l) {
      html +=
        '<div class="set-row top-set' + (l.isProgress ? ' is-progress' : '') + '" style="cursor:pointer" data-hist-edit="' + TOS.esc(l.id) + '">' +
          '<div>' +
            '<div class="row-wrap">' +
              '<span class="small muted tabular">' + TOS.formatDateCZ(l.date) + '</span>' +
              '<strong class="tabular">' + TOS.esc(l.perfText) + '</strong>' +
              (l.isAllTimeBest ? '<span class="badge badge-gold">PR</span>' : '') +
              (l.isProgress ? '<span class="badge badge-green">↑ Progres</span>' : '') +
            '</div>' +
            (l.setupNote ? '<div class="small muted" style="margin-top:2px">' + TOS.esc(l.setupNote) + '</div>' : '') +
          '</div>' +
          (!l.isBW ? '<div class="small muted tabular" style="text-align:right">1RM<br><strong>' + l.e1rm + ' kg</strong></div>' : '') +
        '</div>';
    });
    if (reversedLogs.length > 15) {
      html += '<button type="button" id="btn-toggle-all-hist" class="btn btn-sm btn-ghost btn-block" style="margin-top:8px">' +
        (local.showAllStrengthHist ? 'Zobrazit jen posledních 15' : ('Zobrazit celou historii (' + reversedLogs.length + ')')) +
      '</button>';
    }
    html += '</div>';

    return html;
  }

  function renderSubEndurance() {
    const today = TOS.todayISO();
    const acts = (TOS.state.data.activityLogs || []).filter(function (a) {
      return String(a.type || '').toLowerCase().indexOf('big3') === -1;
    }).map(function (a) {
      return Object.assign({}, a, TOS.parseEnduranceMetrics(a));
    }).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date));
    });

    const last7 = acts.filter(function (a) {
      const d = TOS.daysBetween(a.date, today);
      return d !== null && d <= 7;
    });
    const last30 = acts.filter(function (a) {
      const d = TOS.daysBetween(a.date, today);
      return d !== null && d <= 30;
    });

    const min7 = last7.reduce(function (acc, a) { return acc + (a.sport === 'Kompenzace' ? 0 : (a.durationMin || 0)); }, 0);
    const min30 = last30.reduce(function (acc, a) { return acc + (a.sport === 'Kompenzace' ? 0 : (a.durationMin || 0)); }, 0);
    const vo2_30 = last30.filter(function (a) { return String(a.type || '').toLowerCase().indexOf('vo2') !== -1 || a.phase === 'F4'; }).length;

    const efPoints = acts.filter(function (a) { return a.ef > 0; });
    const latestEf = efPoints.length ? efPoints[efPoints.length - 1].ef : 0;

    let html =
      '<div class="card">' +
        '<h3 class="card-title" style="margin-bottom:10px">Přehled vytrvalosti</h3>' +
        '<div class="grid-3">' +
          '<div class="stat-box"><div class="stat-val">' + min7 + ' m</div><div class="stat-lbl">Objem 7 dní</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + Math.round(min30 / 60 * 10) / 10 + ' h</div><div class="stat-lbl">Objem 30 dní</div></div>' +
          '<div class="stat-box"><div class="stat-val" style="color:var(--green)">' + (latestEf ? latestEf.toFixed(2) : '—') + '</div><div class="stat-lbl">Poslední EF (W/HR)</div></div>' +
        '</div>' +
        '<div class="small muted" style="margin-top:8px">VO2max jednotek za 30 dní: <strong>' + vo2_30 + '×</strong> • Celkem zapsaných aktivit: <strong>' + acts.length + '</strong></div>' +
      '</div>';

    // Graf aerobní efektivity (EF = W / HR)
    html +=
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:6px">' +
          '<h3 class="card-title">Aerobní efektivita (EF = W / tep)</h3>' +
          '<span class="badge badge-green">Rostoucí trend = lepší kondice</span>' +
        '</div>' +
        buildEfSVG(efPoints, local.selectedEfIdx) +
      '</div>';

    // Týdenní vytrvalostní objem (posledních 8 týdnů)
    const wkMap = {};
    acts.forEach(function (a) {
      if (!a.date || a.sport === 'Kompenzace') return;
      const wk = TOS.getISOWeekInfo(a.date).key;
      if (!wk) return;
      if (!wkMap[wk]) wkMap[wk] = { key: wk, mins: 0, count: 0, vo2: 0 };
      wkMap[wk].mins += a.durationMin || 0;
      wkMap[wk].count++;
      if (String(a.type || '').toLowerCase().indexOf('vo2') !== -1 || a.phase === 'F4') wkMap[wk].vo2++;
    });
    const weeks = Object.values(wkMap).sort(function (a, b) { return a.key.localeCompare(b.key); }).slice(-8);
    const maxMins = weeks.reduce(function (m, w) { return Math.max(m, w.mins); }, 1);

    html += '<div class="card"><h3 class="card-title" style="margin-bottom:10px">Týdenní vytrvalostní objem</h3>';
    if (!weeks.length) {
      html += '<div class="small muted">Zatím nejsou zapsané žádné vytrvalostní aktivity (F2 / F4 / F5).</div>';
    } else {
      weeks.slice().reverse().forEach(function (w) {
        const pct = Math.max(5, Math.round((w.mins / maxMins) * 100));
        html +=
          '<div class="hbar-row">' +
            '<div class="hbar-head">' +
              '<strong>' + TOS.esc(w.key) + '</strong>' +
              '<span class="tabular"><strong>' + w.mins + ' min</strong> (' + w.count + '×)' + (w.vo2 ? (' • ' + w.vo2 + '× VO2') : '') + '</span>' +
            '</div>' +
            '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + (w.mins >= 120 ? 'var(--green)' : 'var(--gold)') + '"></div></div>' +
          '</div>';
      });
    }
    html += '</div>';

    // Historie aktivit (kliknutím úprava/smazání)
    html += '<div class="section-label">Historie aktivit (' + acts.length + ') — klikni pro úpravu</div>';
    html += '<div class="card" style="padding:8px 12px">';
    if (!acts.length) {
      html += '<div class="small muted">Zatím bez záznamů.</div>';
    } else {
      acts.slice().reverse().slice(0, 25).forEach(function (a) {
        html +=
          '<div class="set-row" style="cursor:pointer;border-left:3px solid var(--gold)" data-end-edit="' + TOS.esc(a.id) + '">' +
            '<div>' +
              '<div class="row-wrap">' +
                '<span class="small muted tabular">' + TOS.formatDateCZ(a.date) + '</span>' +
                '<strong>' + TOS.esc(a.detail || a.type) + '</strong>' +
                (a.ef > 0 ? '<span class="badge badge-green tabular">EF ' + a.ef.toFixed(2) + '</span>' : '') +
              '</div>' +
              (a.note ? '<div class="small muted" style="margin-top:2px">' + TOS.esc(a.note) + '</div>' : '') +
            '</div>' +
            '<span class="badge badge-gold tabular">' + TOS.esc(a.value || 'OK') + '</span>' +
          '</div>';
      });
    }
    html += '</div>';

    return html;
  }

  function renderSubStats(allLogs) {
    const rec = TOS.getRecoveryStatus();
    const today = TOS.todayISO();

    const scopedLogs = local.statsWindowDays > 0
      ? allLogs.filter(function (l) {
          const d = TOS.daysBetween(l.date, today);
          return d !== null && d <= local.statsWindowDays;
        })
      : allLogs;

    const badgeLvl = function (lvl) {
      return lvl === 'green' ? 'badge-green' : (lvl === 'gold' ? 'badge-gold' : (lvl === 'red' ? 'badge-red' : ''));
    };

    // 1. Karta Hybridní regenerace (48h / 72h+) + Frekvence
    let html =
      '<div class="card">' +
        '<h3 class="card-title" style="margin-bottom:10px">Hybridní stav regenerace (48h / 72h+)</h3>' +
        '<div class="grid-2" style="margin-bottom:10px">' +
          '<div class="stat-box">' +
            '<div class="small muted">Upper Body</div>' +
            '<div style="font-weight:700;margin:2px 0">' + (rec.upper.days !== null ? ('před ' + rec.upper.days + ' dny (' + TOS.formatDateShortCZ(rec.upper.date) + ')') : '—') + '</div>' +
            '<span class="badge ' + badgeLvl(rec.upper.level) + '">' + TOS.esc(rec.upper.label) + '</span>' +
          '</div>' +
          '<div class="stat-box">' +
            '<div class="small muted">Lower / CNS ' + (rec.lower.source ? ('(' + TOS.esc(rec.lower.source) + ')') : '') + '</div>' +
            '<div style="font-weight:700;margin:2px 0">' + (rec.lower.days !== null ? ('před ' + rec.lower.days + ' dny (' + TOS.formatDateShortCZ(rec.lower.date) + ')') : '—') + '</div>' +
            '<span class="badge ' + badgeLvl(rec.lower.level) + '">' + TOS.esc(rec.lower.label) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="stat-box"><div class="stat-val">' + rec.weeklyCounts.thisWeek + '</div><div class="stat-lbl">Tento týden</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + rec.weeklyCounts.lastWeek + '</div><div class="stat-lbl">Minulý týden</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + rec.weeklyCounts.twoWeeksAgo + '</div><div class="stat-lbl">Před 2 týdny</div></div>' +
        '</div>' +
        (rec.lastSession ? '<div class="small muted" style="margin-top:8px">Poslední silový trénink: <strong>' + TOS.formatDateCZ(rec.lastSession.date) + '</strong> (' + TOS.esc(rec.lastSession.split || '—') + (rec.lastSession.gymName ? (' • ' + TOS.esc(rec.lastSession.gymName)) : '') + ')</div>' : '') +
      '</div>';

    // 2. Týdenní tonáž a týdenní frekvence (posledních 8 týdnů)
    const weekMap = {};
    allLogs.forEach(function (l) {
      if (!l.weekKey) return;
      if (!weekMap[l.weekKey]) weekMap[l.weekKey] = { key: l.weekKey, tonnage: 0, sessions: 0, sets: 0 };
      weekMap[l.weekKey].tonnage += l.tonnage || 0;
      weekMap[l.weekKey].sets++;
      if (l.isUniqueSession) weekMap[l.weekKey].sessions++;
    });
    const weeks = Object.values(weekMap).sort(function (a, b) { return a.key.localeCompare(b.key); }).slice(-8);
    const maxTon = weeks.reduce(function (m, w) { return Math.max(m, w.tonnage); }, 1);

    html += '<div class="card"><h3 class="card-title" style="margin-bottom:10px">Týdenní tonáž & frekvence (posledních ' + weeks.length + ' týdnů)</h3>';
    if (!weeks.length) {
      html += '<div class="small muted">Zatím bez dat.</div>';
    } else {
      weeks.slice().reverse().forEach(function (w) {
        const pct = Math.max(4, Math.round((w.tonnage / maxTon) * 100));
        html +=
          '<div class="hbar-row">' +
            '<div class="hbar-head">' +
              '<strong>' + TOS.esc(w.key) + '</strong>' +
              '<span class="tabular">' + Math.round(w.tonnage).toLocaleString('cs-CZ') + ' kg • <strong>' + w.sessions + '×</strong> trénink (' + w.sets + ' sér.)</span>' +
            '</div>' +
            '<div class="hbar-track"><div class="hbar-fill" style="width:' + pct + '%;background:' + (w.sessions >= 3 ? 'var(--green)' : 'var(--accent)') + '"></div></div>' +
          '</div>';
      });
    }
    html += '</div>';

    // 3. Filtr časového okna (výchozí: Posledních 7 dní pro smysluplný týdenní objem)
    html +=
      '<div class="scroll-strip">' +
        [{ d: 7, l: 'Posledních 7 dní' }, { d: 30, l: 'Posledních 30 dní' }, { d: 0, l: 'Celá historie' }].map(function (o) {
          return '<button type="button" class="chip ' + (local.statsWindowDays === o.d ? 'active' : '') + '" data-swin="' + o.d + '">' + o.l + '</button>';
        }).join('') +
      '</div>';

    // 4. Objem podle svalových partií (v 7denním okně barevně zvýrazní cílové pásmo 6–14 sérií)
    const muscleCounts = {};
    scopedLogs.forEach(function (l) {
      const m = l.muscle || 'Nezařazeno';
      muscleCounts[m] = (muscleCounts[m] || 0) + 1;
    });
    const muscleArr = Object.keys(muscleCounts).map(function (m) {
      return { muscle: m, count: muscleCounts[m] };
    }).sort(function (a, b) { return b.count - a.count; });
    const totalSetsScoped = scopedLogs.length || 1;
    const maxM = muscleArr.length ? muscleArr[0].count : 1;

    html += '<div class="card"><div class="row-between" style="margin-bottom:10px"><h3 class="card-title">Objem podle partií (' + scopedLogs.length + ' sér.)</h3>' +
      (local.statsWindowDays === 7 ? '<span class="small muted">Cíl: 6–14 sér./týden</span>' : '') + '</div>';
    muscleArr.forEach(function (item) {
      const wPct = Math.max(5, Math.round((item.count / maxM) * 100));
      const sharePct = Math.round((item.count / totalSetsScoped) * 100);
      let barColor = 'var(--accent)';
      if (local.statsWindowDays === 7) {
        if (item.count >= 6 && item.count <= 14) barColor = 'var(--green)';
        else if (item.count > 14) barColor = 'var(--gold)';
      }
      html +=
        '<div class="hbar-row">' +
          '<div class="hbar-head"><span>' + TOS.esc(item.muscle) + '</span><span class="tabular"><strong>' + item.count + '</strong> sér. (' + sharePct + ' %)</span></div>' +
          '<div class="hbar-track"><div class="hbar-fill" style="width:' + wPct + '%;background:' + barColor + '"></div></div>' +
        '</div>';
    });
    if (!muscleArr.length) html += '<div class="small muted">Žádné série v tomto období.</div>';
    html += '</div>';

    // 5. Poměr splitů
    const splitCounts = {};
    let totalUnique = 0;
    scopedLogs.forEach(function (l) {
      if (!l.isUniqueSession) return;
      const sp = l.split || 'Ostatní';
      splitCounts[sp] = (splitCounts[sp] || 0) + 1;
      totalUnique++;
    });
    const splitColors = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444'];
    const splitArr = Object.keys(splitCounts).map(function (s, idx) {
      return { split: s, count: splitCounts[s], color: splitColors[idx % splitColors.length] };
    }).sort(function (a, b) { return b.count - a.count; });

    html += '<div class="card"><h3 class="card-title" style="margin-bottom:10px">Poměr splitů (' + totalUnique + ' tréninků)</h3>';
    if (totalUnique > 0) {
      html += '<div style="display:flex;height:14px;border-radius:999px;overflow:hidden;margin-bottom:10px;background:var(--surface-3)">' +
        splitArr.map(function (s) {
          const pct = (s.count / totalUnique) * 100;
          return '<div style="width:' + pct.toFixed(1) + '%;background:' + s.color + '" title="' + TOS.esc(s.split) + '"></div>';
        }).join('') +
      '</div>';
      html += '<div class="row-wrap">' +
        splitArr.map(function (s) {
          const pct = Math.round((s.count / totalUnique) * 100);
          return '<span class="badge" style="border-color:' + s.color + '"><span style="width:8px;height:8px;border-radius:50%;background:' + s.color + ';display:inline-block"></span> ' + TOS.esc(s.split) + ': ' + s.count + '× (' + pct + ' %)</span>';
        }).join('') +
      '</div>';
    } else {
      html += '<div class="small muted">Žádné tréninky v tomto období.</div>';
    }
    html += '</div>';

    return html;
  }

  function renderSubPR(allLogs) {
    const filtered = resolveGymFilter(local.gymFilter, allLogs);
    const bestByKey = {};
    filtered.forEach(function (l) {
      const k = l.machineKey || l.exerciseName;
      const sc = l.score || 0;
      if (sc <= 0) return;
      const cur = bestByKey[k];
      const curSc = cur ? (cur.score || 0) : -1;
      if (!cur || sc > curSc || (sc === curSc && l.date >= cur.date)) {
        bestByKey[k] = l;
      }
    });

    const grouped = {};
    Object.values(bestByKey).forEach(function (l) {
      const m = l.muscle || 'Ostatní';
      if (!grouped[m]) grouped[m] = [];
      grouped[m].push(l);
    });

    let html = renderGymFilterChips(local.gymFilter, 'data-agym');
    const muscles = Object.keys(grouped).sort(function (a, b) { return a.localeCompare(b, 'cs'); });
    if (!muscles.length) {
      return html + '<div class="card"><p class="muted small" style="margin:0">Zatím nejsou evidována žádná PR pro zvolený filtr.</p></div>';
    }

    muscles.forEach(function (m) {
      html += '<div class="section-label">' + TOS.esc(m) + '</div>';
      html += '<div class="card" style="padding:8px 12px">';
      grouped[m].sort(function (a, b) { return (a.machineKey || '').localeCompare(b.machineKey || '', 'cs'); }).forEach(function (pr) {
        html +=
          '<div class="set-row top-set">' +
            '<div>' +
              '<div style="font-weight:700">' + TOS.esc(pr.machineKey) + '</div>' +
              '<div class="small muted tabular">' + TOS.esc(pr.perfText) + ' • ' + TOS.formatDateCZ(pr.date) + '</div>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<span class="badge badge-gold tabular">' + (pr.isBW ? (pr.reps + ' op.') : ('1RM ' + pr.e1rm + ' kg')) + '</span>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    });

    return html;
  }

  function renderSubCalendar(allLogs) {
    const actLogs = TOS.state.data.activityLogs || [];
    const big3Set = new Set(TOS.state.data.big3Dates || []);
    const y = local.calYear;
    const m = local.calMonth;
    const monthNames = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
    const today = TOS.todayISO();

    const dayInfo = {};
    function ensureDay(iso) {
      if (!dayInfo[iso]) dayInfo[iso] = { strength: [], activities: [], big3: false };
      return dayInfo[iso];
    }
    allLogs.forEach(function (l) { if (l.date) ensureDay(l.date).strength.push(l); });
    actLogs.forEach(function (a) {
      if (!a.date) return;
      const d = ensureDay(a.date);
      if (String(a.type).toLowerCase().indexOf('big3') !== -1) d.big3 = true;
      else d.activities.push(a);
    });
    big3Set.forEach(function (iso) { ensureDay(iso).big3 = true; });

    const firstDay = new Date(y, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let html =
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<button type="button" class="btn btn-sm" id="cal-prev">←</button>' +
          '<strong style="font-size:16px">' + monthNames[m] + ' ' + y + '</strong>' +
          '<button type="button" class="btn btn-sm" id="cal-next">→</button>' +
        '</div>' +
        '<div class="cal-grid">' +
          ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');

    for (let i = 0; i < startOffset; i++) {
      html += '<div class="cal-cell empty"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const info = dayInfo[iso];
      const isSelected = iso === local.calSelectedDate;
      const dots = [];
      if (info && info.strength.length) dots.push('<span class="cal-dot" style="background:var(--accent)" title="Síla"></span>');
      if (info && info.activities.length) dots.push('<span class="cal-dot" style="background:var(--gold)" title="Vytrvalost / F7"></span>');
      if (info && info.big3) dots.push('<span class="cal-dot" style="background:var(--green)" title="McGill Big 3"></span>');

      html +=
        '<button type="button" class="cal-cell ' + (iso === today ? 'today' : '') + '" data-cal-day="' + iso + '" style="cursor:pointer;' + (isSelected ? 'background:var(--surface-3);border-color:var(--gold)' : '') + '">' +
          '<span class="tabular" style="font-weight:' + (info ? '700' : '400') + '">' + day + '</span>' +
          '<div class="cal-dots">' + dots.join('') + '</div>' +
        '</button>';
    }
    html +=
        '</div>' +
        '<div class="row-wrap small muted" style="margin-top:10px">' +
          '<span><span class="cal-dot" style="background:var(--accent);display:inline-block"></span> Síla</span>' +
          '<span><span class="cal-dot" style="background:var(--gold);display:inline-block"></span> Vytrvalost / F7</span>' +
          '<span><span class="cal-dot" style="background:var(--green);display:inline-block"></span> Big 3</span>' +
        '</div>' +
      '</div>';

    // Detail vybraného dne (s plnou možností editace/mazání!)
    const sel = dayInfo[local.calSelectedDate];
    const isPastOrToday = local.calSelectedDate <= today;
    html += '<div class="section-label">Detail dne — ' + TOS.formatDateCZ(local.calSelectedDate) + ' (klepni na položku pro úpravu)</div>';
    html += '<div class="card">';

    if (sel && sel.big3) {
      html += '<div class="set-row" style="cursor:pointer;border-left:3px solid var(--green)" id="cal-toggle-b3"><strong>McGill Big 3</strong><span class="badge badge-green">Splněno (zrušit)</span></div>';
    } else if (isPastOrToday) {
      html += '<button type="button" id="cal-toggle-b3" class="btn btn-sm btn-ghost btn-block" style="margin-bottom:8px">+ Dopsat McGill Big 3 pro tento den</button>';
    }

    if (!sel || (!sel.strength.length && !sel.activities.length && !sel.big3)) {
      html += '<div class="small muted">V tento den není žádný záznam.</div>';
    } else {
      sel.activities.forEach(function (a) {
        html +=
          '<div class="set-row" style="cursor:pointer;border-left:3px solid var(--gold)" data-cal-edit-act="' + TOS.esc(a.id) + '">' +
            '<div><strong>' + TOS.esc(a.detail || a.type) + '</strong><div class="small muted">' + TOS.esc(a.phase) + (a.note ? (' • ' + TOS.esc(a.note)) : '') + '</div></div>' +
            '<span class="badge badge-gold tabular">' + TOS.esc(a.value || 'OK') + '</span>' +
          '</div>';
      });
      if (sel.strength.length) {
        const dayTon = sel.strength.reduce(function (acc, l) { return acc + (l.tonnage || 0); }, 0);
        const gymName = sel.strength[0].gymName || '';
        const splitName = sel.strength[0].split || '';
        html += '<div class="row-between" style="margin:10px 0 4px"><strong>Silový trénink (' + TOS.esc(splitName) + (gymName ? (' • ' + TOS.esc(gymName)) : '') + ')</strong><span class="small muted tabular">' + Math.round(dayTon).toLocaleString('cs-CZ') + ' kg</span></div>';
        sel.strength.forEach(function (s) {
          const isTop = s.setType === 'Top Set';
          html +=
            '<div class="set-row ' + (isTop ? 'top-set' : 'backoff-set') + '" style="cursor:pointer" data-cal-edit-set="' + TOS.esc(s.id) + '">' +
              '<div>' +
                '<div style="font-weight:600">' + TOS.esc(s.exerciseName) + '</div>' +
                '<div class="small muted tabular">' + TOS.esc(s.setType) + ' • ' + TOS.esc(s.perfText) + (s.e1rm ? (' • 1RM ' + s.e1rm + ' kg') : '') + '</div>' +
              '</div>' +
              '<div class="row">' +
                (s.isAllTimeBest ? '<span class="badge badge-gold">PR</span>' : '') +
                (s.isProgress ? '<span class="badge badge-green">↑</span>' : '') +
                '<span class="small muted">✎</span>' +
              '</div>' +
            '</div>';
        });
      }
    }
    html += '</div>';

    // Poslední tréninkové dny
    const recentDates = Array.from(new Set(allLogs.map(function (l) { return l.date; }))).sort().reverse().slice(0, 12);
    if (recentDates.length) {
      html += '<div class="section-label">Poslední silové tréninky</div><div class="card" style="padding:8px 12px">';
      recentDates.forEach(function (iso) {
        const sets = dayInfo[iso] ? dayInfo[iso].strength : [];
        const ton = sets.reduce(function (a, b) { return a + (b.tonnage || 0); }, 0);
        const sp = sets[0] ? sets[0].split : '';
        const g = sets[0] ? sets[0].gymName : '';
        html +=
          '<div class="set-row" style="cursor:pointer" data-jump-date="' + iso + '">' +
            '<div><strong>' + TOS.formatDateCZ(iso) + '</strong><div class="small muted">' + TOS.esc(sp) + (g ? (' • ' + TOS.esc(g)) : '') + '</div></div>' +
            '<div class="small muted tabular" style="text-align:right">' + sets.length + ' sér.<br><strong>' + Math.round(ton).toLocaleString('cs-CZ') + ' kg</strong></div>' +
          '</div>';
      });
      html += '</div>';
    }

    return html;
  }

  function renderSubZones() {
    const zones = TOS.state.data.zones || [];
    const ideas = TOS.state.data.ideas || [];
    const s = TOS.state.settings;

    let html =
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 class="card-title">Tepové & Wattové zóny</h3>' +
          '<span class="badge badge-blue">FTP ' + s.ftp + ' W • MAP ' + s.map + ' W • VT1 ' + s.vt1 + '</span>' +
        '</div>';

    if (!zones.length) {
      html += '<div class="small muted">Zóny se načtou po synchronizaci ze Sheetu.</div>';
    } else {
      zones.forEach(function (z) {
        html +=
          '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div class="row-wrap"><span class="badge badge-blue">' + TOS.esc(z.zone) + '</span><strong>' + TOS.esc(z.goal) + '</strong></div>' +
            '<div class="small" style="margin-top:5px"><strong>Kolo:</strong> ' + TOS.esc(z.cycling) + '</div>' +
            '<div class="small"><strong>Běh:</strong> ' + TOS.esc(z.running) + ' | <strong>Airbike:</strong> ' + TOS.esc(z.airbike) + '</div>' +
            (z.rules ? '<div class="small muted" style="margin-top:3px">' + TOS.esc(z.rules) + '</div>' : '') +
          '</div>';
      });
    }
    html += '</div>';

    html += '<div class="section-label">Podněty ke zlepšení (' + ideas.length + ')</div><div class="card">';
    if (!ideas.length) {
      html += '<div class="small muted">Žádné podněty v tabulce.</div>';
    } else {
      ideas.forEach(function (it) {
        html +=
          '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
            '<div class="row-wrap">' +
              '<span class="badge badge-gold">' + TOS.esc(it.priority) + '</span>' +
              '<span class="badge">' + TOS.esc(it.targetPhase) + '</span>' +
              '<strong>' + TOS.esc(it.area) + '</strong>' +
            '</div>' +
            '<div class="small" style="margin-top:5px">' + TOS.esc(it.recommendation) + '</div>' +
            (it.trigger ? '<div class="small muted" style="margin-top:3px"><strong>Spouštěč:</strong> ' + TOS.esc(it.trigger) + '</div>' : '') +
            (it.reason ? '<div class="small muted" style="margin-top:2px"><strong>Důvod:</strong> ' + TOS.esc(it.reason) + '</div>' : '') +
          '</div>';
      });
    }
    html += '</div>';

    return html;
  }

  /* ==================== HLAVNÍ RENDER ZÁLOŽKY PROGRES ==================== */

  function openEditStrengthById(logId) {
    const log = TOS.state.data.strengthLogs.find(function (l) { return l.id === logId; });
    if (!log || typeof TOS.openLogSetModal !== 'function') return;
    const ex = TOS.getCatalogById(log.exerciseId) || {
      id: log.exerciseId,
      name: log.exerciseName,
      resistanceType: log.resistanceType,
      gymId: log.gymId,
      muscle: log.muscle
    };
    TOS.openLogSetModal(ex, { editLog: log });
  }

  function renderAnalytics(container) {
    const allLogs = TOS.getEnrichedLogs();
    const tabs = [
      { id: 'strength', lbl: 'Vývoj síly' },
      { id: 'endurance', lbl: 'Vytrvalost' },
      { id: 'stats', lbl: 'Statistiky' },
      { id: 'pr', lbl: 'Síň slávy (PR)' },
      { id: 'calendar', lbl: 'Kalendář' },
      { id: 'zones', lbl: 'Zóny & Podněty' }
    ];

    let html = '<div class="scroll-strip">' +
      tabs.map(function (t) {
        return '<button type="button" class="chip ' + (local.analyticsSub === t.id ? 'active-gold' : '') + '" data-asub="' + t.id + '">' + t.lbl + '</button>';
      }).join('') +
      '</div>';

    if (local.analyticsSub === 'strength') html += renderSubStrength(allLogs);
    else if (local.analyticsSub === 'endurance') html += renderSubEndurance();
    else if (local.analyticsSub === 'stats') html += renderSubStats(allLogs);
    else if (local.analyticsSub === 'pr') html += renderSubPR(allLogs);
    else if (local.analyticsSub === 'calendar') html += renderSubCalendar(allLogs);
    else html += renderSubZones();

    container.innerHTML = html;

    // Event listenery
    container.querySelectorAll('[data-asub]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.analyticsSub = btn.dataset.asub;
        renderAnalytics(container);
      });
    });

    container.querySelectorAll('[data-agym]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.gymFilter = btn.dataset.agym;
        local.selectedChartIdx = -1;
        renderAnalytics(container);
      });
    });

    const mSel = container.querySelector('#an-machine-sel');
    if (mSel) {
      mSel.addEventListener('change', function () {
        local.selectedMachineKey = mSel.value;
        local.selectedChartIdx = -1;
        local.showAllStrengthHist = false;
        renderAnalytics(container);
      });
    }

    container.querySelectorAll('[data-str-pt]').forEach(function (pt) {
      pt.addEventListener('click', function () {
        local.selectedChartIdx = parseInt(pt.dataset.strPt, 10);
        renderAnalytics(container);
      });
    });

    container.querySelectorAll('[data-ef-pt]').forEach(function (pt) {
      pt.addEventListener('click', function () {
        local.selectedEfIdx = parseInt(pt.dataset.efPt, 10);
        renderAnalytics(container);
      });
    });

    const toggleAllHist = container.querySelector('#btn-toggle-all-hist');
    if (toggleAllHist) {
      toggleAllHist.addEventListener('click', function () {
        local.showAllStrengthHist = !local.showAllStrengthHist;
        renderAnalytics(container);
      });
    }

    container.querySelectorAll('[data-hist-edit]').forEach(function (el) {
      el.addEventListener('click', function () { openEditStrengthById(el.dataset.histEdit); });
    });

    container.querySelectorAll('[data-end-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        const act = (TOS.state.data.activityLogs || []).find(function (a) { return a.id === el.dataset.endEdit; });
        if (act && typeof TOS.openEnduranceLogModal === 'function') TOS.openEnduranceLogModal({ editActivity: act });
      });
    });

    container.querySelectorAll('[data-swin]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.statsWindowDays = parseInt(btn.dataset.swin, 10);
        renderAnalytics(container);
      });
    });

    const prevM = container.querySelector('#cal-prev');
    const nextM = container.querySelector('#cal-next');
    if (prevM) {
      prevM.addEventListener('click', function () {
        local.calMonth--;
        if (local.calMonth < 0) { local.calMonth = 11; local.calYear--; }
        renderAnalytics(container);
      });
    }
    if (nextM) {
      nextM.addEventListener('click', function () {
        local.calMonth++;
        if (local.calMonth > 11) { local.calMonth = 0; local.calYear++; }
        renderAnalytics(container);
      });
    }

    container.querySelectorAll('[data-cal-day]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.calSelectedDate = btn.dataset.calDay;
        renderAnalytics(container);
      });
    });

    const calB3 = container.querySelector('#cal-toggle-b3');
    if (calB3) {
      calB3.addEventListener('click', function () {
        const iso = local.calSelectedDate;
        const done = (TOS.state.data.big3Dates || []).indexOf(iso) !== -1;
        if (done) {
          if (confirm('Zrušit McGill Big 3 pro ' + TOS.formatDateCZ(iso) + '?')) {
            TOS.deleteActivity('', iso, 'big3');
            TOS.toast('Big 3 zrušeno');
          }
        } else {
          TOS.logActivity({
            id: 'big3_' + iso,
            date: iso,
            type: 'big3',
            phase: TOS.phaseIdxToCode(TOS.state.ui.currentPhaseIdx),
            detail: 'McGill Big 3 (zapsáno z kalendáře)',
            value: 'hotovo'
          });
          TOS.toast('Big 3 dopsáno pro ' + TOS.formatDateShortCZ(iso));
        }
      });
    }

    container.querySelectorAll('[data-cal-edit-set]').forEach(function (el) {
      el.addEventListener('click', function () { openEditStrengthById(el.dataset.calEditSet); });
    });

    container.querySelectorAll('[data-cal-edit-act]').forEach(function (el) {
      el.addEventListener('click', function () {
        const act = (TOS.state.data.activityLogs || []).find(function (a) { return a.id === el.dataset.calEditAct; });
        if (act && typeof TOS.openEnduranceLogModal === 'function') TOS.openEnduranceLogModal({ editActivity: act });
      });
    });

    container.querySelectorAll('[data-jump-date]').forEach(function (el) {
      el.addEventListener('click', function () {
        const iso = el.dataset.jumpDate;
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) {
          local.calYear = parseInt(m[1], 10);
          local.calMonth = parseInt(m[2], 10) - 1;
          local.calSelectedDate = iso;
          renderAnalytics(container);
        }
      });
    });
  }

  /* ==================== ZÁLOŽKA KATALOG CVIKŮ ==================== */

  function openExerciseDetailModal(ex) {
    const mKey = ex.machineKey || TOS.computeMachineKey(ex.resistanceType, ex.gymName, ex.name);
    const history = TOS.getEnrichedLogs().filter(function (l) { return l.machineKey === mKey; }).reverse();
    const gyms = TOS.state.data.gyms || [];
    const muscles = ['Prsa', 'Záda', 'Ramena', 'Biceps', 'Triceps', 'Kvadricepsy', 'Hamstringy', 'Lýtka', 'Hýždě', 'Spodní záda', 'Břicho'];
    if (ex.muscle && muscles.indexOf(ex.muscle) === -1) muscles.unshift(ex.muscle);
    const patterns = ['Dřepový vzor', 'Kyčelní ohyb', 'Vertikální tah', 'Horizontální tlak', 'Horizontální tah', 'Vertikální tlak', 'Tlakový vzor (ramena)', 'Alternativní tlak', 'Izolace přední', 'Izolace zadní', 'Izolace vršek', 'Biceps', 'Triceps', 'Zadní delty', 'Čistá flexe břicha', 'Spodní břicho / Flexe kyčle', 'Anti-rotace / Anti-extenze', 'Anti-úklon / Boční stabilita', 'Izolace adduktory', 'Izolace hýždí', 'Lýtka', 'Přední strana holeně'];
    if (ex.pattern && patterns.indexOf(ex.pattern) === -1) patterns.unshift(ex.pattern);

    const html =
      '<div class="row-wrap" style="margin-bottom:10px">' +
        '<span class="badge">' + TOS.esc(ex.id) + '</span>' +
        '<span class="badge">CNS #' + (ex.cnsPriority || 99) + '</span>' +
      '</div>' +
      '<div class="field"><label>Název cviku</label><input id="ed-name" class="input" value="' + TOS.esc(ex.name || '') + '"></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Typ odporu</label><select id="ed-res" class="select">' +
          '<option value="Stroj/Kladka" ' + (ex.resistanceType !== 'Volna_Vaha' ? 'selected' : '') + '>Stroj / Kladka</option>' +
          '<option value="Volna_Vaha" ' + (ex.resistanceType === 'Volna_Vaha' ? 'selected' : '') + '>Volná váha</option>' +
        '</select></div>' +
        '<div class="field" id="ed-gym-wrap" style="' + (ex.resistanceType === 'Volna_Vaha' ? 'display:none' : '') + '"><label>Posilovna</label><select id="ed-gym" class="select">' +
          '<option value="">— Bez fitka —</option>' +
          gyms.map(function (g) { return '<option value="' + TOS.esc(g.id) + '" ' + (g.id === ex.gymId ? 'selected' : '') + '>' + TOS.esc(g.name) + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Svalová partie</label><select id="ed-muscle" class="select">' +
          muscles.map(function (m) { return '<option value="' + TOS.esc(m) + '" ' + (m === ex.muscle ? 'selected' : '') + '>' + TOS.esc(m) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>Pohybový vzor (CNS)</label><select id="ed-pattern" class="select">' +
          patterns.map(function (p) { return '<option value="' + TOS.esc(p) + '" ' + (p === ex.pattern ? 'selected' : '') + '>' + TOS.esc(p) + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="field"><label>Určeno pro split</label>' +
        '<div class="row-wrap">' +
          ['Full Body (A)', 'Upper', 'Full Body (B)', 'Lower', 'Abs'].map(function (sp) {
            const chk = (Array.isArray(ex.targetSplits) && ex.targetSplits.indexOf(sp) !== -1) || ex.split === sp ? 'checked' : '';
            return '<label class="chip" style="display:inline-flex;align-items:center;gap:5px"><input type="checkbox" name="ed-sp" value="' + sp + '" ' + chk + '> ' + sp + '</label>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field"><label>Nastavení stroje (obousměrná synchronizace s Katalog_Cviku)</label><input id="ed-setup" class="input" value="' + TOS.esc(ex.machineSetup || '') + '" placeholder="Sedák, opěrka, pozice kladky..."></div>' +
      '<div class="grid-2">' +
        '<div class="field"><label>Cílové série × op.</label><input id="ed-sr" class="input" value="' + TOS.esc(ex.targetSetsReps || '') + '"></div>' +
        '<div class="field"><label>Cílové RIR</label><input id="ed-rir" class="input" value="' + TOS.esc(ex.targetRir || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Biomechanická poznámka</label><textarea id="ed-bio" class="textarea">' + TOS.esc(ex.biomechanics || '') + '</textarea></div>' +
      '<div class="field"><label>Bezpečnostní protokol</label><input id="ed-safe" class="input" value="' + TOS.esc(ex.safetyProtocol || '') + '"></div>' +
      '<button type="button" id="ed-save" class="btn btn-green btn-block" style="margin-bottom:14px">Uložit změny do katalogu</button>' +
      '<div class="small muted" style="font-weight:700;margin-bottom:6px">Poslední záznamy (' + history.length + ')</div>' +
      (history.slice(0, 8).map(function (h) {
        return '<div class="set-row ' + (h.setType === 'Top Set' ? 'top-set' : 'backoff-set') + '">' +
          '<span>' + TOS.formatDateShortCZ(h.date) + ' • ' + TOS.esc(h.setType) + '</span>' +
          '<strong class="tabular">' + TOS.esc(h.perfText) + '</strong>' +
        '</div>';
      }).join('') || '<div class="small muted">Zatím žádná historie.</div>');

    TOS.openModal(ex.name, html, function (bodyEl) {
      const resSel = bodyEl.querySelector('#ed-res');
      const gymWrap = bodyEl.querySelector('#ed-gym-wrap');
      resSel.addEventListener('change', function () {
        gymWrap.style.display = resSel.value === 'Volna_Vaha' ? 'none' : 'block';
      });
      bodyEl.querySelector('#ed-save').addEventListener('click', function () {
        const splits = Array.from(bodyEl.querySelectorAll('input[name="ed-sp"]:checked')).map(function (el) { return el.value; });
        TOS.updateExerciseSetup(ex.id, {
          name: bodyEl.querySelector('#ed-name').value.trim(),
          resistanceType: resSel.value,
          gymId: bodyEl.querySelector('#ed-gym').value,
          muscle: bodyEl.querySelector('#ed-muscle').value,
          pattern: bodyEl.querySelector('#ed-pattern').value,
          targetSplits: splits,
          machineSetup: bodyEl.querySelector('#ed-setup').value.trim(),
          targetSetsReps: bodyEl.querySelector('#ed-sr').value.trim(),
          targetRir: bodyEl.querySelector('#ed-rir').value.trim(),
          biomechanics: bodyEl.querySelector('#ed-bio').value.trim(),
          safetyProtocol: bodyEl.querySelector('#ed-safe').value.trim()
        });
        TOS.closeModal();
        TOS.toast('Katalog aktualizován');
      });
    });
  }

  function renderCatalogList(container) {
    const catalog = TOS.state.data.catalog || [];
    const targetGymId = local.catGymFilter === 'active' ? TOS.state.ui.activeGymId : local.catGymFilter;
    const q = local.catSearch.toLowerCase();

    const filtered = catalog.filter(function (ex) {
      if (local.catGymFilter === 'free' && ex.resistanceType !== 'Volna_Vaha') return false;
      if (local.catGymFilter !== 'all' && local.catGymFilter !== 'free' && targetGymId) {
        if (ex.resistanceType !== 'Volna_Vaha' && ex.gymId && ex.gymId !== targetGymId) return false;
      }
      if (local.catMuscle && ex.muscle !== local.catMuscle) return false;
      if (q) {
        const hay = (ex.name + ' ' + ex.muscle + ' ' + ex.pattern + ' ' + ex.machineSetup + ' ' + ex.gymName).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      if ((a.cnsPriority || 99) !== (b.cnsPriority || 99)) return (a.cnsPriority || 99) - (b.cnsPriority || 99);
      return a.name.localeCompare(b.name, 'cs');
    });

    const titleEl = container.querySelector('#cat-count-title');
    if (titleEl) titleEl.textContent = 'Katalog cviků (' + filtered.length + ' / ' + catalog.length + ')';

    const listEl = container.querySelector('#cat-list-wrap');
    if (!listEl) return;

    let html = '';
    if (!filtered.length) {
      html = '<div class="card"><p class="small muted" style="margin:0">Žádný cvik neodpovídá filtru.</p></div>';
    } else {
      filtered.forEach(function (ex) {
        const mKey = ex.machineKey || TOS.computeMachineKey(ex.resistanceType, ex.gymName, ex.name);
        const lastTop = TOS.getLastSetForMachine(mKey, 'Top Set');
        html +=
          '<div class="ex-card" style="cursor:pointer" data-open-ex="' + TOS.esc(ex.id) + '">' +
            '<div class="row-between" style="align-items:flex-start">' +
              '<div>' +
                '<div class="row-wrap" style="margin-bottom:4px">' +
                  '<span class="badge ' + (ex.resistanceType === 'Volna_Vaha' ? 'badge-purple' : 'badge-blue') + '">' +
                    (ex.resistanceType === 'Volna_Vaha' ? 'Volná váha' : TOS.esc(ex.gymName || 'Stroj')) +
                  '</span>' +
                  (ex.muscle ? '<span class="badge">' + TOS.esc(ex.muscle) + '</span>' : '') +
                  (ex.targetSplits && ex.targetSplits.length ? '<span class="badge">' + TOS.esc(ex.targetSplits.join(', ')) + '</span>' : '') +
                '</div>' +
                '<div style="font-weight:700">' + TOS.esc(ex.name) + '</div>' +
              '</div>' +
              '<span class="small muted">Upravit →</span>' +
            '</div>' +
            (ex.machineSetup ? '<div class="setup-box"><strong>Nastavení:</strong> ' + TOS.esc(ex.machineSetup) + '</div>' : '') +
            '<div class="ghost-line">' +
              (lastTop ? ('<span>Poslední Top: <strong class="tabular">' + TOS.esc(lastTop.perfText) + '</strong> (' + TOS.formatDateShortCZ(lastTop.date) + ')</span>') : '<span>Bez záznamu</span>') +
            '</div>' +
          '</div>';
      });
    }

    listEl.innerHTML = html;
    listEl.querySelectorAll('[data-open-ex]').forEach(function (card) {
      card.addEventListener('click', function () {
        const ex = TOS.getCatalogById(card.dataset.openEx);
        if (ex) openExerciseDetailModal(ex);
      });
    });
  }

  function renderCatalog(container) {
    const catalog = TOS.state.data.catalog || [];
    const muscles = Array.from(new Set(catalog.map(function (c) { return c.muscle; }).filter(Boolean))).sort(function (a, b) {
      return a.localeCompare(b, 'cs');
    });

    // Shell se vykreslí jen jednou — input #cat-search tak nikdy neztratí focus při psaní!
    container.innerHTML =
      '<div class="row-between" style="margin-bottom:10px">' +
        '<h2 id="cat-count-title" class="card-title">Katalog cviků (' + catalog.length + ')</h2>' +
        '<div class="row">' +
          '<button type="button" id="cat-add-gym" class="btn btn-sm">+ Fitko</button>' +
          '<button type="button" id="cat-add-ex" class="btn btn-sm btn-primary">+ Cvik</button>' +
        '</div>' +
      '</div>' +
      renderGymFilterChips(local.catGymFilter, 'data-cgym') +
      '<div class="grid-2" style="margin-bottom:10px">' +
        '<input id="cat-search" class="input" placeholder="Hledat cvik / nastavení..." value="' + TOS.esc(local.catSearch) + '">' +
        '<select id="cat-muscle" class="select">' +
          '<option value="">Všechny partie</option>' +
          muscles.map(function (m) {
            return '<option value="' + TOS.esc(m) + '" ' + (local.catMuscle === m ? 'selected' : '') + '>' + TOS.esc(m) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div id="cat-list-wrap"></div>';

    renderCatalogList(container);

    container.querySelector('#cat-add-gym').addEventListener('click', function () { TOS.openQuickGymModal(); });
    container.querySelector('#cat-add-ex').addEventListener('click', function () {
      if (typeof TOS.openCreateExerciseModal === 'function') {
        TOS.openCreateExerciseModal('Upper', function () { renderCatalog(container); });
      }
    });
    container.querySelectorAll('[data-cgym]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        local.catGymFilter = btn.dataset.cgym;
        renderCatalog(container);
      });
    });
    container.querySelector('#cat-search').addEventListener('input', function (e) {
      local.catSearch = e.target.value;
      renderCatalogList(container);
    });
    container.querySelector('#cat-muscle').addEventListener('change', function (e) {
      local.catMuscle = e.target.value;
      renderCatalogList(container);
    });
  }

  /* ==================== ZÁLOŽKA SYNC & NASTAVENÍ ==================== */

  function renderSettings(container) {
    const s = TOS.state.settings;
    const ui = TOS.state.ui;
    const outbox = TOS.state.outbox || [];
    const lastSyncText = ui.lastSyncAt ? new Date(ui.lastSyncAt).toLocaleString('cs-CZ') : 'Zatím neproběhla';

    let html = '';

    if (!s.apiToken) {
      html +=
        '<div class="setup-box" style="margin-bottom:12px;border-left-color:var(--gold)">' +
          '<strong>Chybí API Token:</strong> Z bezpečnostních důvodů není token uložený v kódu. Zadej svůj token níže a klikni na „Uložit připojení & otestovat“ (uloží se pouze lokálně v tvém zařízení).' +
        '</div>';
    }

    html +=
      '<div class="card">' +
        '<div class="card-header">' +
          '<div>' +
            '<h2 class="card-title">Synchronizace s Master Sheetem</h2>' +
            '<div class="small muted">Poslední sync: ' + TOS.esc(lastSyncText) + '</div>' +
          '</div>' +
          '<span class="badge ' + (outbox.length ? 'badge-gold' : 'badge-green') + '">' +
            (outbox.length ? (outbox.length + ' čeká ve frontě') : 'Vše synchronizováno') +
          '</span>' +
        '</div>' +
        '<div class="grid-3" style="margin-bottom:12px">' +
          '<div class="stat-box"><div class="stat-val">' + TOS.state.data.gyms.length + '</div><div class="stat-lbl">Posilovny</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + TOS.state.data.catalog.length + '</div><div class="stat-lbl">Cviky</div></div>' +
          '<div class="stat-box"><div class="stat-val">' + TOS.state.data.strengthLogs.length + '</div><div class="stat-lbl">Série v logu</div></div>' +
        '</div>' +
        '<div class="grid-2">' +
          '<button type="button" id="set-sync-now" class="btn btn-primary">Synchronizovat vše</button>' +
          '<button type="button" id="set-push-only" class="btn">Odeslat frontu (' + outbox.length + ')</button>' +
        '</div>' +
      '</div>';

    // Připojení API
    html +=
      '<div class="card">' +
        '<h3 class="card-title" style="margin-bottom:10px">Google Apps Script API v2.1</h3>' +
        '<div class="field"><label>Web App URL (/exec)</label><input id="set-url" class="input" value="' + TOS.esc(s.apiUrl) + '"></div>' +
        '<div class="field"><label>API Token (uloží se jen lokálně)</label><input id="set-token" class="input" type="password" placeholder="Zadej svůj tajný API token" value="' + TOS.esc(s.apiToken) + '"></div>' +
        '<button type="button" id="set-save-api" class="btn btn-green btn-block">Uložit připojení & otestovat</button>' +
      '</div>';

    // Kalibrace zón, tělesné váhy, pauzovače a zvuku
    html +=
      '<div class="card">' +
        '<h3 class="card-title" style="margin-bottom:10px">Kalibrace výkonu & Časovače</h3>' +
        '<div class="grid-3">' +
          '<div class="field"><label>Indoor FTP (W)</label><input id="set-ftp" class="input tabular" type="number" value="' + s.ftp + '"></div>' +
          '<div class="field"><label>MAP (W)</label><input id="set-map" class="input tabular" type="number" value="' + s.map + '"></div>' +
          '<div class="field"><label>VT1 (t/m)</label><input id="set-vt1" class="input tabular" type="number" value="' + s.vt1 + '"></div>' +
        '</div>' +
        '<div class="grid-3">' +
          '<div class="field"><label>Váha těla (kg)</label><input id="set-bw" class="input tabular" type="number" step="0.5" value="' + (s.bodyweight || 80) + '"></div>' +
          '<div class="field"><label>Pauza těžké (s)</label><input id="set-rc" class="input tabular" type="number" value="' + s.restCompound + '"></div>' +
          '<div class="field"><label>Pauza izolace (s)</label><input id="set-ri" class="input tabular" type="number" value="' + s.restIso + '"></div>' +
        '</div>' +
        '<div class="small muted" style="margin-bottom:10px">Váha těla slouží k přesnému výpočtu 1RM a grafů u dipů/shybů s přídavnou zátěží (BW + kg).</div>' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<label class="row small" style="cursor:pointer"><input id="set-sound" type="checkbox" ' + (s.sound ? 'checked' : '') + ' style="width:18px;height:18px"> Zvukové signály</label>' +
          '<label class="row small" style="cursor:pointer"><input id="set-voice" type="checkbox" ' + (s.voice ? 'checked' : '') + ' style="width:18px;height:18px"> Český hlas</label>' +
        '</div>' +
        '<button type="button" id="set-save-cal" class="btn btn-primary btn-block">Uložit nastavení</button>' +
      '</div>';

    // Správa posiloven
    html +=
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 class="card-title">Posilovny (' + TOS.state.data.gyms.length + ')</h3>' +
          '<button type="button" id="set-manage-gyms" class="btn btn-sm">Spravovat / Přidat</button>' +
        '</div>' +
        TOS.state.data.gyms.map(function (g) {
          const isAct = g.id === ui.activeGymId;
          return '<div class="set-row"><div><strong>' + TOS.esc(g.name) + '</strong> <span class="small muted">(' + TOS.esc(g.id) + ')</span></div>' +
            (isAct ? '<span class="badge badge-blue">Aktivní</span>' : '<button type="button" class="btn btn-sm btn-ghost" data-set-gym="' + TOS.esc(g.id) + '">Vybrat</button>') +
          '</div>';
        }).join('') +
      '</div>';

    // Offline fronta & Záloha dat
    html +=
      '<div class="card">' +
        '<h3 class="card-title" style="margin-bottom:10px">Záloha & Údržba</h3>' +
        '<div class="grid-2" style="margin-bottom:8px">' +
          '<button type="button" id="set-export" class="btn btn-sm">Exportovat JSON</button>' +
          '<label class="btn btn-sm" style="cursor:pointer">Importovat JSON<input id="set-import" type="file" accept="application/json" style="display:none"></label>' +
        '</div>' +
        (outbox.length > 0 ? '<button type="button" id="set-clear-outbox" class="btn btn-sm btn-danger btn-block" style="margin-bottom:8px">Vymazat uvízlou frontu (' + outbox.length + ')</button>' : '') +
        '<button type="button" id="set-reset-cache" class="btn btn-sm btn-ghost btn-block">Znovu načíst čistá data ze Sheetu</button>' +
      '</div>';

    container.innerHTML = html;

    // Event listenery
    container.querySelector('#set-sync-now').addEventListener('click', function () {
      TOS.toast('Synchronizuji...');
      TOS.syncAll(false);
    });
    container.querySelector('#set-push-only').addEventListener('click', function () {
      TOS.pushOutbox(false);
    });
    container.querySelector('#set-save-api').addEventListener('click', function () {
      TOS.state.settings.apiUrl = container.querySelector('#set-url').value.trim();
      TOS.state.settings.apiToken = container.querySelector('#set-token').value.trim();
      TOS.save();
      TOS.syncAll(false);
    });
    container.querySelector('#set-save-cal').addEventListener('click', function () {
      TOS.state.settings.ftp = Math.max(100, Math.round(TOS.toNum(container.querySelector('#set-ftp').value) || 265));
      TOS.state.settings.map = Math.max(150, Math.round(TOS.toNum(container.querySelector('#set-map').value) || 360));
      TOS.state.settings.vt1 = Math.max(90, Math.round(TOS.toNum(container.querySelector('#set-vt1').value) || 132));
      TOS.state.settings.bodyweight = Math.max(35, TOS.round1(TOS.toNum(container.querySelector('#set-bw').value) || 80));
      TOS.state.settings.restCompound = Math.max(30, Math.round(TOS.toNum(container.querySelector('#set-rc').value) || 150));
      TOS.state.settings.restIso = Math.max(20, Math.round(TOS.toNum(container.querySelector('#set-ri').value) || 75));
      TOS.state.settings.sound = container.querySelector('#set-sound').checked;
      TOS.state.settings.voice = container.querySelector('#set-voice').checked;
      TOS.save();
      TOS.toast('Nastavení uloženo');
    });
    container.querySelector('#set-manage-gyms').addEventListener('click', function () {
      TOS.openQuickGymModal();
    });
    container.querySelectorAll('[data-set-gym]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        TOS.setActiveGym(btn.dataset.setGym);
        TOS.toast('Přepnuto fitko');
      });
    });

    container.querySelector('#set-export').addEventListener('click', function () {
      const blob = new Blob([JSON.stringify(TOS.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'training-os-backup-' + TOS.todayISO() + '.json';
      a.click();
      URL.revokeObjectURL(url);
      TOS.toast('Záloha stažena');
    });

    container.querySelector('#set-import').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!parsed || !parsed.data || !parsed.settings) throw new Error('Neplatný formát zálohy');
          TOS.state = TOS.normalizeState(parsed);
          TOS.save();
          TOS.renderAll();
          TOS.toast('Záloha bezpečně obnovena');
        } catch (err) {
          TOS.toast('Chyba importu: ' + err.message, 3500);
        }
      };
      reader.readAsText(file);
    });

    const clearOutBtn = container.querySelector('#set-clear-outbox');
    if (clearOutBtn) {
      clearOutBtn.addEventListener('click', function () {
        if (confirm('Opravdu zahodit neodeslanou frontu (' + outbox.length + ' položek)?')) {
          TOS.state.outbox = [];
          TOS.state.ui.syncStatus = 'online';
          TOS.save();
          renderSettings(container);
          TOS.toast('Fronta vymazána');
        }
      });
    }

    container.querySelector('#set-reset-cache').addEventListener('click', async function () {
      if (!navigator.onLine) {
        TOS.toast('Jsi offline — nelze obnovit data ze Sheetu.', 3200);
        return;
      }
      if (TOS.state.outbox.length > 0) {
        TOS.toast('Nejdřív odešli nebo smaž čekající frontu.', 3200);
        return;
      }
      if (!confirm('Stáhnout kompletně čerstvá data z Google Sheetu a nahradit lokální cache?')) return;
      const res = await TOS.pullFromServer(false);
      if (res && res.ok) {
        renderSettings(container);
      }
    });
  }

  TOS.registerView('analytics', renderAnalytics);
  TOS.registerView('catalog', renderCatalog);
  TOS.registerView('settings', renderSettings);
})();
