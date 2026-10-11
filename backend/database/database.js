const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const accountColumns = new Set(db.prepare('PRAGMA table_info(account)').all().map(column => column.name));
for (const [name, type] of [['client_name', "TEXT NOT NULL DEFAULT 'R.K. Sharma'"], ['client_id', "TEXT NOT NULL DEFAULT 'SIM56797811'"]]) {
  if (!accountColumns.has(name)) db.exec(`ALTER TABLE account ADD COLUMN ${name} ${type}`);
}
const positionColumns = new Set(db.prepare('PRAGMA table_info(positions)').all().map(column => column.name));
const positionMigrations = [
  ['ltp_min', 'REAL'], ['ltp_max', 'REAL'], ['pnl_mode', "TEXT NOT NULL DEFAULT 'AUTO'"],
  ['manual_pnl_pct', 'REAL'], ['pnl_min_pct', 'REAL'], ['pnl_max_pct', 'REAL'],
  ['quantity_mode', "TEXT NOT NULL DEFAULT 'LOTS'"], ['change_pct_mode', "TEXT NOT NULL DEFAULT 'AUTO'"],
  ['manual_change_pct', 'REAL'], ['change_min_pct', 'REAL'], ['change_max_pct', 'REAL']
];
for (const [name, type] of positionMigrations) {
  if (!positionColumns.has(name)) db.exec(`ALTER TABLE positions ADD COLUMN ${name} ${type}`);
}
const accountSeed = db.prepare('INSERT OR IGNORE INTO account(id, user_id, trading_balance, available_balance) VALUES(1, ?, ?, ?)').run('demo-user', 100000, 100000);
db.prepare('INSERT OR IGNORE INTO charges(id, brokerage, exchange_charges, taxes, other_charges) VALUES(1, 0, 0, 0, 0)').run();
const markets = [
  ['NIFTY 50','NIFTY 50',23481.75,1.94,'Indices'], ['BANKEX','BANKEX',60550.51,2.21,'Indices'],
  ['GOLD','Gold',71925,0.58,'Commodities'], ['SILVER','Silver',86420,-0.24,'Commodities'],
  ['RELIANCE','Reliance Industries',2975,0.85,'Stocks'], ['TCS','Tata Consultancy Services',3450,0.88,'Stocks'],
  ['MIDCAPNIFTY','NIFTY Midcap Select',12786.30,0.42,'F&O'], ['VOLTAS','Voltas',0.05,-0.12,'Stocks'],
  ['INFY','Infosys',1548.25,0.31,'Stocks'], ['HDFCBANK','HDFC Bank',1725.60,-0.18,'Stocks'],
  ['ICICIBANK','ICICI Bank',1257.40,0.66,'Stocks'], ['TATAMOTORS','Tata Motors',978.15,1.12,'Stocks']
];
const marketInsert = db.prepare('INSERT OR IGNORE INTO market_data(symbol,label,price,change_percent,category,simulated) VALUES(?,?,?,?,?,1)');
const seedMarkets = db.transaction(() => markets.forEach(row => marketInsert.run(...row)));
seedMarkets();
if (accountSeed.changes > 0 && db.prepare('SELECT COUNT(*) AS n FROM positions').get().n === 0) {
  const samples = [
    ['NIFTY 27-MAR-26 24500 CE','NIFTY 27-MAR-26 24500 CE','BUY','INTRADAY',1,25,120.50,135.20],
    ['RELIANCE','Reliance Industries','BUY','DELIVERY / CNC',1,1,2950.00,2955.35]
  ];
  const seedSamples = db.transaction(() => samples.forEach(row => {
    const [symbol,company_name,position_type,product_type,quantity,lot_size,average_price,current_price] = row;
    const position = db.prepare(`INSERT INTO positions(symbol,company_name,position_type,product_type,quantity,lot_size,average_price,current_price)
      VALUES(?,?,?,?,?,?,?,?)`).run(...row);
    db.prepare(`INSERT INTO orders(position_id,symbol,order_type,transaction_type,product_type,quantity,price,status)
      VALUES(?,?,'MARKET',?,?,?,?,'COMPLETED')`).run(position.lastInsertRowid,symbol,position_type,product_type,quantity*lot_size,average_price);
    db.prepare(`INSERT INTO transactions(type,symbol,amount,description,reference_id)
      VALUES('TRADE',?,?,?,?)`).run(symbol,average_price*quantity*lot_size,`Sample ${position_type} position · simulated`,position.lastInsertRowid);
  }));
  seedSamples();
}
module.exports = db;
