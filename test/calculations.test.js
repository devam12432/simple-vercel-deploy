const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../backend/services/calculations');

test('BUY profit uses price difference times quantity',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:10,lot_size:1,average_price:2950,current_price:3000}),500));
test('BUY loss is negative',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:10,lot_size:1,average_price:2950,current_price:2900}),-500));
test('SELL profits when simulated price falls',()=>assert.equal(c.calculatePositionPnL({position_type:'SELL',quantity:10,lot_size:1,average_price:100,current_price:90}),100));
test('lot size scales total quantity',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:1,lot_size:25,average_price:120.5,current_price:134.85}),358.75));
test('quantity mode uses entered units without multiplying lot size',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:5,lot_size:25,quantity_mode:'QUANTITY',average_price:100,current_price:110}),50));
test('quantity mode total units are the entered quantity',()=>assert.equal(c.totalQuantity({quantity:25,lot_size:25,quantity_mode:'QUANTITY'}),25));
test('automatic displayed price-change percentage follows LTP versus average',()=>assert.ok(Math.abs(c.calculatePriceChangePct({average_price:100,current_price:100.18})-0.18)<1e-12));
test('manual displayed price-change percentage persists an exact user-entered value',()=>assert.equal(c.calculatePriceChangePct({average_price:100,current_price:130,change_pct_mode:'MANUAL',manual_change_pct:0.18}),0.18));
test('range displayed price-change percentage shows the saved value inside its range',()=>assert.equal(c.calculatePriceChangePct({average_price:100,current_price:130,change_pct_mode:'RANGE',manual_change_pct:-0.25,change_min_pct:-1,change_max_pct:1}),-0.25));
test('P&L percentage guards zero investment',()=>assert.equal(c.calculatePnLPercentage({quantity:1,lot_size:1,average_price:0,current_price:0}),0));
test('manual P&L percentage overrides automatic BUY price calculation',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:1,lot_size:25,average_price:120.5,current_price:135.2,pnl_mode:'MANUAL',manual_pnl_pct:2}),60.25));
test('manual P&L percentage reverses direction for SELL positions',()=>assert.equal(c.calculatePositionPnL({position_type:'SELL',quantity:1,lot_size:1,average_price:2950,current_price:3000,pnl_mode:'MANUAL',manual_pnl_pct:2}),-59));
test('range mode uses the persisted sampled percentage',()=>assert.equal(c.calculatePositionPnL({position_type:'BUY',quantity:1,lot_size:1,average_price:100,current_price:999,pnl_mode:'RANGE',manual_pnl_pct:-1.25,pnl_min_pct:-2,pnl_max_pct:3}),-1.25));
test('portfolio aggregation sums position values and pnl',()=>{const s=c.summarizePositions([{position_type:'BUY',quantity:2,lot_size:1,average_price:100,current_price:110}]);assert.deepEqual(s,{invested:200,current:220,pnl:20,pnlPercent:10});});
test('realized report splits profit and loss before charges',()=>assert.deepEqual(c.summarizeRealized([{realized_pnl:100},{realized_pnl:-25}],5),{grossProfit:100,grossLoss:25,charges:5,netPnL:70,trades:2}));
