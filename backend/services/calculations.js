const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function totalQuantity(position) {
  const qty = Number(position.quantity || 0);
  const lot = Number(position.lot_size || 1);
  return String(position.quantity_mode || 'LOTS').toUpperCase() === 'QUANTITY' ? qty : qty * lot;
}
function calculatePriceChangePct(position) {
  if (['MANUAL','RANGE'].includes(String(position.change_pct_mode || 'AUTO').toUpperCase()) && Number.isFinite(Number(position.manual_change_pct))) return Number(position.manual_change_pct);
  const average = Number(position.average_price || 0);
  return average ? (Number(position.current_price || 0) - average) / average * 100 : 0;
}
function calculatePositionPnL(position) {
  const direction = String(position.position_type || 'BUY').toUpperCase() === 'SELL' ? -1 : 1;
  if (['MANUAL','RANGE'].includes(position.pnl_mode) && Number.isFinite(Number(position.manual_pnl_pct))) {
    return roundMoney(calculateInvestedValue(position) * Number(position.manual_pnl_pct) / 100 * direction);
  }
  return roundMoney((Number(position.current_price) - Number(position.average_price)) * totalQuantity(position) * direction);
}
function calculateInvestedValue(position) {
  return roundMoney(Number(position.average_price || 0) * totalQuantity(position));
}
function calculatePositionValue(position) {
  return roundMoney(Number(position.current_price || 0) * totalQuantity(position));
}
function calculatePnLPercentage(position) {
  const invested = calculateInvestedValue(position);
  return invested === 0 ? 0 : roundMoney(calculatePositionPnL(position) / invested * 100);
}
function summarizePositions(positions) {
  const invested = roundMoney(positions.reduce((s, p) => s + calculateInvestedValue(p), 0));
  const current = roundMoney(positions.reduce((s, p) => s + calculatePositionValue(p), 0));
  const pnl = roundMoney(positions.reduce((s, p) => s + calculatePositionPnL(p), 0));
  return { invested, current, pnl, pnlPercent: invested ? roundMoney(pnl / invested * 100) : 0 };
}
function summarizeRealized(closedPositions, charges = 0) {
  const values = closedPositions.map(p => Number(p.realized_pnl || 0));
  const grossProfit = roundMoney(values.filter(x => x > 0).reduce((s, x) => s + x, 0));
  const grossLoss = roundMoney(Math.abs(values.filter(x => x < 0).reduce((s, x) => s + x, 0)));
  return { grossProfit, grossLoss, charges: roundMoney(charges), netPnL: roundMoney(grossProfit - grossLoss - charges), trades: values.length };
}
module.exports = { roundMoney, totalQuantity, calculatePriceChangePct, calculatePositionPnL, calculateInvestedValue, calculatePositionValue, calculatePnLPercentage, summarizePositions, summarizeRealized };
