const express = require('express');
const db = require('../database/database');
const calc = require('../services/calculations');
const router = express.Router();
const PRODUCT_TYPES = ['INTRADAY','DELIVERY / CNC','MTF','NORMAL'];
function normalizeProductType(value) { const requested=String(value||'').trim().toUpperCase(); if(requested==='CF')return 'NORMAL'; if(PRODUCT_TYPES.includes(requested))return requested; fail(400,'Choose INTRADAY, DELIVERY / CNC, or CF.'); }
function normalizeQuantityMode(value) { const mode=String(value||'LOTS').trim().toUpperCase(); if(!['LOTS','QUANTITY'].includes(mode))fail(400,'Choose Lots or Quantity.'); return mode; }
const getPosition = db.prepare('SELECT * FROM positions WHERE id=?');
const getOpenPositions = db.prepare("SELECT * FROM positions WHERE status='OPEN' ORDER BY created_at DESC, id DESC");
const nowIso = () => new Date().toISOString();
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function number(value, name, min = 0) { const n = Number(value); if (!Number.isFinite(n) || n < min) fail(400, `${name} must be ${min === 0 ? 'zero or greater' : `at least ${min}`}.`); return n; }
function cleanSymbol(value) { const s = String(value || '').trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9 ._/-]{0,49}$/.test(s)) fail(400, 'Enter a valid stock or option symbol.'); return s; }
function validatePosition(body) {
  const symbol = cleanSymbol(body.symbol);
  const position_type = String(body.position_type || '').toUpperCase();
  const product_type = normalizeProductType(body.product_type);
  if (!['BUY','SELL'].includes(position_type)) fail(400, 'Choose BUY or SELL.');
  const quantity_mode = normalizeQuantityMode(body.quantity_mode);
  const quantity = number(body.quantity, 'Quantity'); if (quantity <= 0) fail(400, 'Quantity must be greater than zero.');
  const lot_size = number(body.lot_size ?? 1, 'Lot size'); if (lot_size <= 0) fail(400, 'Lot size must be greater than zero.');
  return { symbol, company_name: String(body.company_name || symbol).trim().slice(0, 80) || symbol, position_type, product_type, quantity, lot_size, quantity_mode, average_price: number(body.average_price, 'Average price'), current_price: number(body.current_price, 'Current price') };
}
function account() { return db.prepare('SELECT * FROM account WHERE id=1').get(); }
function aggregate() { return calc.summarizePositions(getOpenPositions.all()); }
function createOrder(p, status='COMPLETED', pnl=null) {
  return db.prepare(`INSERT INTO orders(position_id,symbol,order_type,transaction_type,product_type,quantity,price,status,realized_pnl)
    VALUES(?,?,'MARKET',?,?,?,?,?,?)`).run(p.id || null,p.symbol,p.position_type,p.product_type,calc.totalQuantity(p),p.current_price,status,pnl);
}
router.get('/state', (req,res) => {
  const open = getOpenPositions.all(); const closed = db.prepare("SELECT * FROM positions WHERE status='CLOSED' ORDER BY closed_at DESC").all();
  const acct=account(), totals=calc.summarizePositions(open);
  res.json({ account:acct, positions:open, closedPositions:closed, orders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC,id DESC').all(), watchlist:db.prepare(`SELECT w.*,m.price,m.change_percent,m.category FROM watchlists w LEFT JOIN market_data m ON m.symbol=w.symbol ORDER BY w.id DESC`).all(), markets:db.prepare('SELECT * FROM market_data ORDER BY category,symbol').all(), totals, report:calc.summarizeRealized(closed, totalCharges()), transactions:db.prepare('SELECT * FROM transactions ORDER BY created_at DESC,id DESC').all(), funds:db.prepare('SELECT * FROM fund_transactions ORDER BY created_at DESC,id DESC').all() });
});
router.get('/positions', (req,res)=>res.json(getOpenPositions.all()));
router.get('/positions/closed', (req,res)=>res.json(db.prepare("SELECT * FROM positions WHERE status='CLOSED' ORDER BY closed_at DESC").all()));
router.post('/positions', (req,res)=>{
  const p=validatePosition(req.body);
  const result=db.transaction(()=>{
    const x=db.prepare(`INSERT INTO positions(symbol,company_name,position_type,product_type,quantity,lot_size,quantity_mode,average_price,current_price) VALUES(@symbol,@company_name,@position_type,@product_type,@quantity,@lot_size,@quantity_mode,@average_price,@current_price)`).run(p);
    p.id=Number(x.lastInsertRowid); createOrder(p); db.prepare("INSERT INTO transactions(type,symbol,amount,description,reference_id) VALUES('TRADE',?,?,?,?)").run(p.symbol,calc.calculateInvestedValue(p),`${p.position_type} ${calc.totalQuantity(p)} ${p.symbol} simulated position created`,p.id); return getPosition.get(p.id);
  })(); res.status(201).json(result);
});
router.put('/positions/:id', (req,res)=>{
  const old=getPosition.get(Number(req.params.id)); if(!old || old.status!=='OPEN') fail(404,'Open position not found.');
  const p=validatePosition(req.body);
  db.prepare(`UPDATE positions SET symbol=@symbol,company_name=@company_name,position_type=@position_type,product_type=@product_type,quantity=@quantity,lot_size=@lot_size,quantity_mode=@quantity_mode,average_price=@average_price,current_price=@current_price,updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({...p,id:old.id}); res.json(getPosition.get(old.id));
});
router.put('/positions/:id/settings', (req,res)=>{
  const old=getPosition.get(Number(req.params.id)); if(!old || old.status!=='OPEN') fail(404,'Open position not found.');
  const mode=String(req.body.pnl_mode||'AUTO').toUpperCase(); if(!['AUTO','MANUAL','RANGE'].includes(mode)) fail(400,'Choose AUTO, MANUAL, or RANGE P&L mode.');
  const optionalNumber=(value,name,min=-100000)=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<min)fail(400,`${name} is invalid.`);return n;};
  const ltpMin=optionalNumber(req.body.ltp_min,'LTP minimum',0), ltpMax=optionalNumber(req.body.ltp_max,'LTP maximum',0);
  const pnlMin=optionalNumber(req.body.pnl_min_pct,'P&L minimum'), pnlMax=optionalNumber(req.body.pnl_max_pct,'P&L maximum');
  const manual=optionalNumber(req.body.manual_pnl_pct,'Manual P&L percentage');
  const currentPrice=optionalNumber(req.body.current_price,'Current LTP',0);
  if((ltpMin===null)!==(ltpMax===null) || (ltpMin!==null&&ltpMin>ltpMax)) fail(400,'Enter a complete LTP range with minimum no greater than maximum.');
  if(mode==='MANUAL'&&manual===null) fail(400,'Enter a manual P&L percentage.');
  if(mode==='RANGE'&&(pnlMin===null||pnlMax===null||pnlMin>pnlMax)) fail(400,'Enter a valid P&L percentage range.');
  db.prepare(`UPDATE positions SET current_price=COALESCE(?,current_price),ltp_min=?,ltp_max=?,pnl_mode=?,manual_pnl_pct=?,pnl_min_pct=?,pnl_max_pct=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(currentPrice,ltpMin,ltpMax,mode,mode==='AUTO'?null:manual,pnlMin,pnlMax,old.id);
  res.json(getPosition.get(old.id));
});
router.put('/positions/:id/change-percent',(req,res)=>{
  const old=getPosition.get(Number(req.params.id)); if(!old || old.status!=='OPEN') fail(404,'Open position not found.');
  const mode=String(req.body.change_pct_mode||'AUTO').toUpperCase(); if(!['AUTO','MANUAL','RANGE'].includes(mode)) fail(400,'Choose AUTO, MANUAL, or RANGE for the displayed percentage.');
  const percent=(value,label)=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>100000)fail(400,`${label} is invalid.`);return n;};
  let manual=percent(req.body.manual_change_pct,'Manual change percentage');
  const minimum=percent(req.body.change_min_pct,'Minimum change percentage'),maximum=percent(req.body.change_max_pct,'Maximum change percentage');
  if(mode==='MANUAL'&&manual===null)fail(400,'Enter a manual percentage.');
  if(mode==='RANGE'){
    if(minimum===null||maximum===null||minimum>maximum)fail(400,'Enter a valid percentage range.');
    manual=Math.round((minimum+Math.random()*(maximum-minimum)+Number.EPSILON)*10000)/10000;
  }
  db.prepare(`UPDATE positions SET change_pct_mode=?,manual_change_pct=?,change_min_pct=?,change_max_pct=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(mode,mode==='AUTO'?null:manual,mode==='RANGE'?minimum:null,mode==='RANGE'?maximum:null,old.id);
  res.json(getPosition.get(old.id));
});
router.delete('/positions/:id',(req,res)=>{
  const old=getPosition.get(Number(req.params.id)); if(!old || old.status!=='OPEN') fail(404,'Open position not found.');
  db.transaction(()=>{db.prepare('DELETE FROM orders WHERE position_id=?').run(old.id);db.prepare("DELETE FROM transactions WHERE reference_id=?").run(old.id);db.prepare('DELETE FROM positions WHERE id=?').run(old.id);})();
  res.json({ok:true,id:old.id});
});
router.delete('/positions',(req,res)=>{
  // Clear All Entries removes both open and exited position rows and their linked records.
  const ids=db.prepare('SELECT id FROM positions').all().map(row=>row.id);
  const result=db.transaction(()=>{
    if(ids.length){
      const placeholders=ids.map(()=>'?').join(',');
      db.prepare(`DELETE FROM orders WHERE position_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM transactions WHERE reference_id IN (${placeholders})`).run(...ids);
      db.prepare(`DELETE FROM positions WHERE id IN (${placeholders})`).run(...ids);
    }
    return ids.length;
  })();
  res.json({ok:true,deleted:result});
});
router.post('/positions/:id/exit', (req,res)=>{
  const p=getPosition.get(Number(req.params.id)); if(!p || p.status!=='OPEN') fail(404,'Open position not found.');
  const closed=db.transaction(()=>{ const pnl=calc.calculatePositionPnL(p); db.prepare("UPDATE positions SET status='CLOSED',realized_pnl=?,closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pnl,p.id); createOrder(p,'COMPLETED',pnl); db.prepare("INSERT INTO transactions(type,symbol,amount,description,reference_id) VALUES('EXIT',?,?,?,?)").run(p.symbol,pnl,`Closed simulated ${p.position_type} position`,p.id); return getPosition.get(p.id); })(); res.json(closed);
});
router.post('/positions/exit-all', (req,res)=>{
  const positions=getOpenPositions.all();
  const result=db.transaction(()=>positions.map(p=>{const pnl=calc.calculatePositionPnL(p);db.prepare("UPDATE positions SET status='CLOSED',realized_pnl=?,closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pnl,p.id);createOrder(p,'COMPLETED',pnl);db.prepare("INSERT INTO transactions(type,symbol,amount,description,reference_id) VALUES('EXIT',?,?,?,?)").run(p.symbol,pnl,'Closed by Exit All',p.id);return {...p,status:'CLOSED',realized_pnl:pnl};}))(); res.json({closed:result.length,positions:result});
});
router.get('/orders',(req,res)=>res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC,id DESC').all()));
router.post('/orders',(req,res)=>{
  const symbol=cleanSymbol(req.body.symbol);const transaction_type=String(req.body.transaction_type||'').toUpperCase();if(!['BUY','SELL'].includes(transaction_type))fail(400,'Choose BUY or SELL.');
  const product_type=normalizeProductType(req.body.product_type||'CF');
  const quantity=number(req.body.quantity,'Quantity');if(quantity<=0)fail(400,'Quantity must be greater than zero.');const price=number(req.body.price,'Price');
  const market=db.prepare('SELECT label FROM market_data WHERE symbol=?').get(symbol);
  const p={symbol,company_name:String(req.body.company_name||market?.label||symbol),position_type:transaction_type,product_type,quantity,quantity_mode:normalizeQuantityMode(req.body.quantity_mode),lot_size:number(req.body.lot_size??1,'Lot size'),average_price:price,current_price:price};if(p.lot_size<=0)fail(400,'Lot size must be greater than zero.');
  const out=db.transaction(()=>{const x=db.prepare(`INSERT INTO positions(symbol,company_name,position_type,product_type,quantity,lot_size,quantity_mode,average_price,current_price) VALUES(@symbol,@company_name,@position_type,@product_type,@quantity,@lot_size,@quantity_mode,@average_price,@current_price)`).run(p);p.id=Number(x.lastInsertRowid);createOrder(p);db.prepare("INSERT INTO transactions(type,symbol,amount,description,reference_id) VALUES('TRADE',?,?,?,?)").run(symbol,price*calc.totalQuantity(p),`${transaction_type} market order simulated`,p.id);return getPosition.get(p.id);})();res.status(201).json(out);
});
router.get('/holdings',(req,res)=>{
 const map=new Map();for(const p of getOpenPositions.all()){const k=`${p.symbol}:${p.position_type}`;if(!map.has(k))map.set(k,{symbol:p.symbol,company_name:p.company_name,position_type:p.position_type,quantity:0,lot_size:1,average_price:0,current_price:p.current_price,investment:0,current_value:0,pnl:0});const h=map.get(k),q=calc.totalQuantity(p);h.investment+=calc.calculateInvestedValue(p);h.current_value+=calc.calculatePositionValue(p);h.pnl+=calc.calculatePositionPnL(p);h.quantity+=q;h.current_price=p.current_price;h.average_price=h.quantity?(h.investment/h.quantity):0;}
 res.json([...map.values()]);
});
router.get('/account',(req,res)=>res.json({...account(),...aggregate()}));
router.put('/account',(req,res)=>{const val=number(req.body.trading_balance,'Trading balance');db.prepare('UPDATE account SET trading_balance=?,available_balance=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(val,val);res.json(account());});
router.put('/account/profile',(req,res)=>{
  const client_name=String(req.body.client_name||'').trim().replace(/\s+/g,' '), client_id=String(req.body.client_id||'').trim();
  if(!client_name||client_name.length>60)fail(400,'Enter a client name between 1 and 60 characters.');
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,29}$/.test(client_id))fail(400,'Client ID must be 3–30 letters, numbers, or . _ / - characters.');
  db.prepare('UPDATE account SET client_name=?,client_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(client_name,client_id);
  res.json(account());
});
router.post('/account/funds',(req,res)=>fundChange(req,res,'ADD'));
router.post('/account/withdraw',(req,res)=>fundChange(req,res,'WITHDRAW'));
function fundChange(req,res,type){const amount=number(req.body.amount,'Amount');if(amount<=0)fail(400,'Amount must be greater than zero.');const a=account();if(type==='WITHDRAW'&&amount>a.available_balance)fail(400,'Withdrawal exceeds available balance.');const delta=type==='ADD'?amount:-amount;const balance=calc.roundMoney(a.available_balance+delta);db.transaction(()=>{db.prepare('UPDATE account SET trading_balance=?,available_balance=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(calc.roundMoney(a.trading_balance+delta),balance);db.prepare('INSERT INTO fund_transactions(transaction_type,amount,balance_after) VALUES(?,?,?)').run(type,amount,balance);db.prepare('INSERT INTO transactions(type,amount,description) VALUES(?,?,?)').run(type,amount,`${type==='ADD'?'Added':'Withdrew'} simulated funds`);})();res.status(201).json(account());}
router.get('/watchlist',(req,res)=>res.json(db.prepare(`SELECT w.*,m.price,m.change_percent,m.category FROM watchlists w LEFT JOIN market_data m ON m.symbol=w.symbol ORDER BY w.id DESC`).all()));
router.post('/watchlist',(req,res)=>{const symbol=cleanSymbol(req.body.symbol);const market=db.prepare('SELECT label FROM market_data WHERE symbol=?').get(symbol);const company_name=String(req.body.company_name||market?.label||symbol).trim().slice(0,80);try{const out=db.prepare('INSERT INTO watchlists(symbol,company_name) VALUES(?,?)').run(symbol,company_name);res.status(201).json({id:Number(out.lastInsertRowid),symbol,company_name});}catch(e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')fail(400,'This symbol is already in your watchlist.');throw e;}});
router.delete('/watchlist/:id',(req,res)=>{const r=db.prepare('DELETE FROM watchlists WHERE id=?').run(Number(req.params.id));if(!r.changes)fail(404,'Watchlist item not found.');res.json({ok:true});});
router.get('/markets',(req,res)=>res.json(db.prepare('SELECT * FROM market_data ORDER BY category,symbol').all()));
router.get('/reports/pnl',(req,res)=>{const closed=db.prepare("SELECT * FROM positions WHERE status='CLOSED'").all();res.json({...calc.summarizeRealized(closed,totalCharges()),unrealizedPnL:aggregate().pnl,closedPositions:closed,orders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),funds:db.prepare('SELECT * FROM fund_transactions ORDER BY created_at DESC').all()});});
router.get('/charges',(req,res)=>res.json(db.prepare('SELECT * FROM charges WHERE id=1').get()));
router.put('/charges',(req,res)=>{const keys=['brokerage','exchange_charges','taxes','other_charges'];const values=keys.map(k=>number(req.body[k]??0,k.replace('_',' ')));db.prepare('UPDATE charges SET brokerage=?,exchange_charges=?,taxes=?,other_charges=? WHERE id=1').run(...values);res.json(db.prepare('SELECT * FROM charges WHERE id=1').get());});
router.get('/reports/:kind',(req,res)=>{const kind=req.params.kind;if(!['statement','trades','orders','insights','demat','funds'].includes(kind))fail(404,'Report not found.');res.json({kind,transactions:db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all(),orders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all(),funds:db.prepare('SELECT * FROM fund_transactions ORDER BY created_at DESC').all(),holdings:db.prepare("SELECT * FROM positions WHERE status='OPEN'").all()});});
router.post('/simulate-price',(req,res)=>{const pct=Number(req.body.percent);if(!Number.isFinite(pct)||pct===0||Math.abs(pct)>5)fail(400,'Choose a simulated movement between 0 and 5 percent.');const id=req.body.position_id?Number(req.body.position_id):null;let target=id?getPosition.get(id):null;if(id&&(!target||target.status!=='OPEN'))fail(404,'Open position not found.');const tx=db.transaction(()=>{if(target)db.prepare('UPDATE positions SET current_price=MAX(COALESCE(ltp_min,0),MIN(COALESCE(ltp_max,1e12),ROUND(current_price*(1+?/100.0),2))),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(pct,id);else db.prepare("UPDATE positions SET current_price=MAX(COALESCE(ltp_min,0),MIN(COALESCE(ltp_max,1e12),ROUND(current_price*(1+?/100.0),2))),updated_at=CURRENT_TIMESTAMP WHERE status='OPEN'").run(pct);return id?getPosition.get(id):getOpenPositions.all();});res.json({positions:tx()});});
router.post('/demo-data',(req,res)=>{if(getOpenPositions.all().length)fail(400,'Load demo data only when there are no open positions.');const demo=[['NIFTY 27-MAR-26 24500 CE','NIFTY 27-MAR-26 24500 CE','BUY','INTRADAY',1,25,120.50,135.20],['RELIANCE','Reliance Industries','BUY','DELIVERY / CNC',1,1,2950.00,2955.35]];const tx=db.transaction(()=>{for(const vals of demo){const r=db.prepare('INSERT INTO positions(symbol,company_name,position_type,product_type,quantity,lot_size,average_price,current_price) VALUES(?,?,?,?,?,?,?,?)').run(...vals);const p=getPosition.get(r.lastInsertRowid);createOrder(p);db.prepare("INSERT INTO transactions(type,symbol,amount,description,reference_id) VALUES('TRADE',?,?,?,?)").run(p.symbol,p.average_price*p.quantity*p.lot_size,`Sample ${p.position_type} position · simulated`,p.id);}for(const s of ['RELIANCE','TCS','INFY','HDFCBANK']){const m=db.prepare('SELECT label FROM market_data WHERE symbol=?').get(s);db.prepare('INSERT OR IGNORE INTO watchlists(symbol,company_name) VALUES(?,?)').run(s,m.label);}});tx();res.status(201).json({message:'Reference-style simulated sample positions loaded.',positions:getOpenPositions.all()});});
router.post('/reset',(req,res)=>{const tx=db.transaction(()=>{db.prepare('DELETE FROM orders').run();db.prepare('DELETE FROM transactions').run();db.prepare('DELETE FROM fund_transactions').run();db.prepare('DELETE FROM positions').run();db.prepare('DELETE FROM watchlists').run();db.prepare('UPDATE account SET trading_balance=100000,available_balance=100000,updated_at=CURRENT_TIMESTAMP WHERE id=1').run();});tx();res.json({ok:true});});
function totalCharges(){const c=db.prepare('SELECT * FROM charges WHERE id=1').get();return c.brokerage+c.exchange_charges+c.taxes+c.other_charges;}
module.exports=router;
