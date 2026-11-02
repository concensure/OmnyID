(function (global) {
  'use strict';

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function selectedIds(value) {
    return Array.isArray(value) ? Array.from(new Set(value.filter(function (item) { return typeof item === 'string'; }))).slice(0, 3) : [];
  }

  function shares(model, priorityIds) {
    var priorities = selectedIds(priorityIds);
    var rows = model.categories.map(function (category) {
      return { id: category.id, share: category.targetShare, low: category.lowShare, high: category.highShare };
    });
    var boost = 0;
    rows.forEach(function (row) {
      if (!priorities.includes(row.id)) return;
      var amount = Math.min(2, row.high - row.share);
      row.share += amount;
      boost += amount;
    });
    var donors = rows.filter(function (row) { return !priorities.includes(row.id); });
    while (boost > 0.0001) {
      var available = donors.filter(function (row) { return row.share > row.low; });
      if (!available.length) break;
      var slice = Math.min(boost / available.length, 0.25);
      available.forEach(function (row) {
        var reduction = Math.min(slice, row.share - row.low, boost);
        row.share -= reduction;
        boost -= reduction;
      });
    }
    var rounded = rows.map(function (row) { return { id: row.id, share: Math.round(row.share * 100) / 100 }; });
    var difference = Math.round((100 - rounded.reduce(function (sum, row) { return sum + row.share; }, 0)) * 100) / 100;
    var correction = rounded.reduce(function (best, row) { return !best || row.share > best.share ? row : best; }, null);
    if (correction) correction.share = Math.round((correction.share + difference) * 100) / 100;
    return rounded;
  }

  function amounts(model, total, priorityIds) {
    var allocationShares = shares(model, priorityIds);
    var unit = number(model.roundingUnit) || 50;
    var rows = allocationShares.map(function (row) {
      var category = model.categories.find(function (item) { return item.id === row.id; });
      return {
        id: row.id,
        label: category.label,
        share: row.share,
        lowShare: category.lowShare,
        highShare: category.highShare,
        amount: Math.round((total * row.share / 100) / unit) * unit
      };
    });
    var difference = total - rows.reduce(function (sum, row) { return sum + row.amount; }, 0);
    var largest = rows.reduce(function (best, row) { return !best || row.amount > best.amount ? row : best; }, null);
    if (largest) largest.amount += difference;
    return rows;
  }

  function missingCosts(costs, input) {
    var active = {
      always: true,
      outdoor: input.setting === 'outdoor' || input.setting === 'mixed',
      regional: input.locationType === 'regional' || input.locationType === 'destination',
      open_drinks: input.drinks === 'tab' || input.drinks === 'byo' || input.drinks === 'not_decided',
      sunday: input.day === 'sunday' || input.day === 'public_holiday',
      large: number(input.guests) > 100
    };
    return costs.filter(function (item) { return active[item.trigger] === true; });
  }

  function calculate(input, model, costs) {
    var total = Math.round(number(input.totalBudget));
    var guests = Math.round(number(input.guests));
    if (total < 1000 || total > 1000000) return { ok: false, error: 'Enter a total budget between A$1,000 and A$1,000,000.' };
    if (guests < 1 || guests > 500) return { ok: false, error: 'Enter a guest count between 1 and 500.' };
    var allocation = amounts(model, total, input.priorities);
    return {
      ok: true,
      engineVersion: 'budget-engine.v1',
      modelVersion: model.version,
      totalBudget: total,
      guests: guests,
      perGuest: Math.round(total / guests),
      allocation: allocation,
      missingCosts: missingCosts(costs, input),
      targetTotal: allocation.reduce(function (sum, row) { return sum + row.share; }, 0),
      amountTotal: allocation.reduce(function (sum, row) { return sum + row.amount; }, 0)
    };
  }

  global.OmnyWeddingBudgetEngine = Object.freeze({ calculate: calculate, shares: shares, missingCosts: missingCosts });
})(window);
