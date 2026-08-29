var ProjectService = (function () {
  'use strict';

  var nodeUtils;

  function utils() {
    if (typeof DongUtils !== 'undefined') return DongUtils;
    if (typeof require !== 'undefined') {
      if (!nodeUtils) nodeUtils = require('./utils/Utils');
      return nodeUtils;
    }
    throw new Error('DongUtils is not loaded.');
  }

  function computeP14(codeRows, timeRows) {
    var U = utils();
    var actualByCode = {};
    for (var i = 0; i < (timeRows || []).length; i++) {
      var t = timeRows[i] || {};
      var code = String(t.code || '').trim();
      actualByCode[code] = (actualByCode[code] || 0) + (Number(t.hours) || 0);
    }
    return (codeRows || []).map(function (row) {
      row = row || {};
      var planned = Number(row.plannedHours == null ? row.planned : row.plannedHours);
      if (!isFinite(planned)) planned = 0;
      var actual = Number(actualByCode[String(row.code || '').trim()] || 0);
      var hasPlan = planned > 0;
      var percent = hasPlan ? Math.max(0, Math.round(actual * 100 / planned)) : null;
      return {
        code: row.code || '',
        status: row.status || '',
        dateString: row.dateString || '',
        payment: row.payment || '',
        sent: row.sent || '',
        account: row.account || '',
        contact: row.contact || '',
        description: row.description || '',
        planned: U.round2(planned),
        actual: U.round2(actual),
        percent: percent,
        hasPlan: hasPlan,
        plannedDisplay: U.pad3(planned),
        actualDisplay: U.pad3(actual),
        hoursDisplay: U.pad3(planned) + ' | ' + U.pad3(actual),
        filename: row.filename || '',
        path: row.path || '',
        rev: row.rev || '',
        modified: row.modified || ''
      };
    });
  }

  function newTimeGroup(task) {
    return { task: task || '(none)', hours: 0, accounts: [], lastSerial: -1, lastDay: '' };
  }

  function addTimeToGroup(group, row) {
    row = row || {};
    group.hours += Number(row.hours) || 0;
    if (row.account && group.accounts.indexOf(row.account) < 0) group.accounts.push(row.account);
    var serial = Number(row.dateSerial) || 0;
    if (serial > group.lastSerial) {
      group.lastSerial = serial;
      group.lastDay = row.dateString || '';
    }
  }

  function finalizeTimeGroups(order, groups) {
    var U = utils();
    var rows = [];
    for (var i = 0; i < (order || []).length; i++) {
      var group = groups[order[i]];
      rows.push({
        task: group.task,
        hours: U.round2(group.hours),
        accounts: group.accounts,
        accountDisplay: group.accounts.length ? (group.accounts[0] + '+') : '',
        lastDay: group.lastDay
      });
    }
    return rows;
  }

  function computeP15(timeRows, code) {
    var order = [];
    var groups = {};
    for (var i = 0; i < (timeRows || []).length; i++) {
      var row = timeRows[i] || {};
      if (code && String(row.code || '') !== String(code)) continue;
      var task = row.task || '(none)';
      if (!groups[task]) {
        groups[task] = newTimeGroup(task);
        order.push(task);
      }
      addTimeToGroup(groups[task], row);
    }
    return finalizeTimeGroups(order, groups);
  }

  function computeP16(p15Rows) {
    var sum = 0;
    for (var i = 0; i < (p15Rows || []).length; i++) sum += Number(p15Rows[i].hours) || 0;
    return utils().round2(sum);
  }

  function computeProgress(totalHours, estimate) {
    var est = Number(estimate);
    if (!isFinite(est) || est <= 0) return '';
    return String(Math.max(0, Math.min(999, Math.round((Number(totalHours) || 0) * 100 / est))));
  }

  function computeP18(codeRows) {
    return (codeRows || []).map(function (row) {
      row = row || {};
      return {
        code: row.code || '',
        planned: Number(row.plannedHours == null ? row.planned : row.plannedHours) || 0,
        description: row.description || '',
        label: '+ Code ' + (row.code || '') + ' (' + (Number(row.plannedHours == null ? row.planned : row.plannedHours) || 0) + 'h)->' + (row.description || '')
      };
    });
  }

  function materializeJob(jobNo, project, codeRows, timeRows) {
    project = project || {};
    var p14 = computeP14(codeRows || [], timeRows || []);
    var p15All = computeP15(timeRows || [], '');
    var p16All = computeP16(p15All);
    var timeSummaryByCode = {};
    var timeTotalByCode = {};
    for (var i = 0; i < (codeRows || []).length; i++) {
      var code = String(codeRows[i] && codeRows[i].code || '').trim();
      if (!code || timeSummaryByCode[code]) continue;
      timeSummaryByCode[code] = computeP15(timeRows || [], code);
      timeTotalByCode[code] = computeP16(timeSummaryByCode[code]);
    }
    project.progress = computeProgress(p16All, project.P7_estimate);
    return {
      jobNo: String(jobNo || project.P1_jobNumber || ''),
      project: project,
      p14: p14,
      codeItems: p14,
      p18: computeP18(codeRows || []),
      p15All: p15All,
      p16All: p16All,
      timeSummaryAll: p15All,
      timeSummaryByCode: timeSummaryByCode,
      timeTotalAll: p16All,
      timeTotalByCode: timeTotalByCode,
      progress: project.progress
    };
  }

  return {
    computeP14: computeP14,
    computeP15: computeP15,
    computeP16: computeP16,
    computeProgress: computeProgress,
    computeP18: computeP18,
    materializeJob: materializeJob
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ProjectService;
