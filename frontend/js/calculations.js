(() => {
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  function totalQuantity(position) { const quantity=Number(position.quantity || 0); return String(position.quantity_mode || 'LOTS').toUpperCase() === 'QUANTITY' ? quantity : quantity * Number(position.lot_size || 1); }
  function calculatePriceChangePct(position) { if (['MANUAL','RANGE'].includes(String(position.change_pct_mode || 'AUTO').toUpperCase()) && Number.isFinite(Number(position.manual_change_pct))) return Number(position.manual_change_pct); const average=Number(position.average_price || 0); return average ? (Number(position.current_price || 0)-average)/average*100 : 0; }
  function calculatePositionPnL(position) {
    const side = String(position.position_type || 'BUY').toUpperCase();
    const sign = side === 'SELL' ? -1 : 1;
    return roundMoney((Number(position.current_price || 0) - Number(position.average_price || 0)) * totalQuantity(position) * sign);
  }
  function calculateInvestedValue(position) { return roundMoney(Number(position.average_price || 0) * totalQuantity(position)); }
  function calculatePnLPercentage(position) {
    const investment = calculateInvestedValue(position);
    return investment === 0 ? 0 : roundMoney(calculatePositionPnL(position) / investment * 100);
  }
  window.SimCalculations = { roundMoney, totalQuantity, calculatePriceChangePct, calculatePositionPnL, calculateInvestedValue, calculatePnLPercentage };
})();
