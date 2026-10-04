(() => {
  function unit(value) {
    return Math.max(0, Math.min(1, Number(value) / 100));
  }

  function probability({ crowd, severity, evacuees, capacity, featureRisk }) {
    const crowdPressure = unit(crowd);
    const incidentSeverity = unit(severity);
    const demand = Math.min(1.5, Math.max(0, Number(evacuees)) / Math.max(1, capacity * 12));
    const score = -4.4 + crowdPressure * 1.5 + incidentSeverity * 1.1 +
      Math.max(0, Math.min(1, featureRisk)) * 1.2 + demand * 1.4;
    return 1 / (1 + Math.exp(-score));
  }

  function adjustedMinutes(minutes, crowd, risk) {
    return Number(minutes) * (1 + unit(crowd) * 0.65) * (1 + risk * 2);
  }

  function effectiveCapacity(capacity, crowd, risk) {
    return Math.max(1, Number(capacity) * (1 - unit(crowd) * 0.7) * (1 - risk * 0.45));
  }

  function summarize(legs, evacuees, crowd) {
    let survival = 1;
    let walkingMinutes = 0;
    let bottleneck = null;
    for (const leg of legs) {
      survival *= 1 - leg.risk;
      walkingMinutes += adjustedMinutes(leg.minutes, crowd, leg.risk);
      const capacity = effectiveCapacity(leg.capacity, crowd, leg.risk);
      if (bottleneck === null || capacity < bottleneck.capacity) {
        bottleneck = { capacity, name: leg.name };
      }
    }
    const risk = 1 - survival;
    const clearanceMinutes = walkingMinutes +
      (bottleneck === null ? 0 : Math.max(0, Number(evacuees)) / bottleneck.capacity);
    return {
      riskPercent: Math.round(risk * 100),
      walkingMinutes: Math.max(1, Math.ceil(walkingMinutes)),
      clearanceMinutes: Math.max(1, Math.ceil(clearanceMinutes)),
      bottleneck: bottleneck === null ? "No route segments" : bottleneck.name,
      capacityPerMinute: bottleneck === null ? 0 : Math.floor(bottleneck.capacity)
    };
  }

  window.campusRiskModel = Object.freeze({ probability, adjustedMinutes, effectiveCapacity, summarize });
})();