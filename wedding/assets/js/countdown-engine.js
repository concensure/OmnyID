(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OmnyWeddingCountdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY_MS = 86400000;

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    var date = new Date(String(value) + 'T00:00:00.000Z');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function iso(date) { return date.toISOString().slice(0, 10); }
  function addDays(date, days) { var next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
  function daysBetween(from, to) { return Math.round((to.getTime() - from.getTime()) / DAY_MS); }
  function unique(values) { return Array.from(new Set((values || []).filter(Boolean))); }
  function escapeIcs(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
  function icsDate(value) { return String(value).replace(/-/g, ''); }

  function scheduleTask(task, weddingDate, today, done, catchUpIndex) {
    var originalTarget = addDays(weddingDate, Number(task.targetOffsetDays || 0));
    var overdue = originalTarget < today;
    var displayTarget = overdue && !done ? addDays(today, catchUpIndex) : originalTarget;
    var status = done ? 'completed' : overdue ? 'catch_up' : daysBetween(today, originalTarget) <= 30 ? 'due_soon' : 'upcoming';
    return Object.assign({}, task, {
      originalTargetDate: iso(originalTarget),
      targetDate: iso(displayTarget),
      windowStartDate: iso(addDays(weddingDate, Number(task.windowStartOffsetDays || task.targetOffsetDays || 0))),
      windowEndDate: iso(addDays(weddingDate, Number(task.windowEndOffsetDays || task.targetOffsetDays || 0))),
      status: status,
      completed: done,
      behind: overdue && !done,
    });
  }

  function buildPlan(catalogue, input) {
    input = input || {};
    var weddingDate = parseDate(input.weddingDate);
    if (!weddingDate) return { ok: false, error: 'Choose an exact wedding date.' };
    var today = parseDate(input.today) || new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    var doneIds = new Set(unique(input.doneIds));
    var catchUpIndex = 0;
    var tasks = (catalogue.tasks || []).map(function (task) {
      var done = doneIds.has(task.id);
      var originalTarget = addDays(weddingDate, Number(task.targetOffsetDays || 0));
      var scheduled = scheduleTask(task, weddingDate, today, done, originalTarget < today && !done ? catchUpIndex++ : 0);
      return scheduled;
    }).sort(function (left, right) { return left.targetDate.localeCompare(right.targetDate) || left.title.localeCompare(right.title); });
    var active = tasks.filter(function (task) { return !task.completed; });
    var stages = (catalogue.stages || []).map(function (stage) {
      var stageTasks = tasks.filter(function (task) { return task.stageId === stage.id; });
      var completed = stageTasks.filter(function (task) { return task.completed; }).length;
      return Object.assign({}, stage, { taskCount: stageTasks.length, completedCount: completed, complete: stageTasks.length > 0 && completed === stageTasks.length });
    });
    var weddingDay = iso(weddingDate);
    var weekend = weddingDate.getUTCDay() === 6 || weddingDate.getUTCDay() === 0;
    return {
      ok: true,
      schema: catalogue.schema,
      weddingDate: weddingDay,
      daysToGo: daysBetween(today, weddingDate),
      compressedPlan: daysBetween(today, weddingDate) < 365,
      weekendDate: weekend,
      tasks: tasks,
      nextTasks: active.slice(0, 5),
      catchUpTasks: active.filter(function (task) { return task.status === 'catch_up'; }),
      currentStage: stages.find(function (stage) { return !stage.complete && active.some(function (task) { return task.stageId === stage.id; }); }) || stages[stages.length - 1] || null,
      stages: stages,
      completedCount: tasks.length - active.length,
      totalCount: tasks.length,
      noim: tasks.find(function (task) { return task.id === 'submit-noim'; }) || null,
    };
  }

  function buildIcs(plan) {
    if (!plan || !plan.ok) return '';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OmnyID//Wedding Countdown//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    plan.tasks.forEach(function (task) {
      var start = icsDate(task.targetDate);
      var end = icsDate(iso(addDays(parseDate(task.targetDate), 1)));
      lines.push('BEGIN:VEVENT', 'UID:' + escapeIcs(task.id + '@wedding.omnyid.com'), 'DTSTART;VALUE=DATE:' + start, 'DTEND;VALUE=DATE:' + end,
        'SUMMARY:' + escapeIcs(task.title), 'DESCRIPTION:' + escapeIcs(task.whyItMatters + ' Planning date: confirm supplier-specific timing before relying on it.'),
        'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeIcs(task.title), 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function buildShareHash(weddingDate, doneIds) {
    if (!parseDate(weddingDate)) return '';
    return '#date=' + encodeURIComponent(weddingDate) + '&done=' + encodeURIComponent(unique(doneIds).join(','));
  }

  function parseShareHash(hash) {
    var params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    var date = params.get('date') || '';
    var done = (params.get('done') || '').split(',').filter(function (value) { return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value); });
    return { weddingDate: parseDate(date) ? date : '', doneIds: unique(done).slice(0, 100) };
  }

  return { parseDate: parseDate, buildPlan: buildPlan, buildIcs: buildIcs, buildShareHash: buildShareHash, parseShareHash: parseShareHash };
});
