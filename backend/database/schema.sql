PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL DEFAULT 'demo-user',
  trading_balance REAL NOT NULL DEFAULT 100000, available_balance REAL NOT NULL DEFAULT 100000,
  client_name TEXT NOT NULL DEFAULT 'R.K. Sharma', client_id TEXT NOT NULL DEFAULT 'SIM56797811',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, company_name TEXT NOT NULL,
  position_type TEXT NOT NULL CHECK(position_type IN ('BUY','SELL')),
  product_type TEXT NOT NULL CHECK(product_type IN ('INTRADAY','DELIVERY / CNC','MTF','NORMAL')),
  quantity REAL NOT NULL CHECK(quantity > 0), lot_size REAL NOT NULL DEFAULT 1 CHECK(lot_size > 0),
  quantity_mode TEXT NOT NULL DEFAULT 'LOTS' CHECK(quantity_mode IN ('LOTS','QUANTITY')),
  average_price REAL NOT NULL CHECK(average_price >= 0), current_price REAL NOT NULL CHECK(current_price >= 0),
  ltp_min REAL, ltp_max REAL, pnl_mode TEXT NOT NULL DEFAULT 'AUTO',
  manual_pnl_pct REAL, pnl_min_pct REAL, pnl_max_pct REAL,
  change_pct_mode TEXT NOT NULL DEFAULT 'AUTO', manual_change_pct REAL, change_min_pct REAL, change_max_pct REAL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  realized_pnl REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, position_id INTEGER, symbol TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'MARKET', transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BUY','SELL')),
  product_type TEXT NOT NULL DEFAULT 'NORMAL', quantity REAL NOT NULL CHECK(quantity > 0),
  price REAL NOT NULL CHECK(price >= 0), status TEXT NOT NULL DEFAULT 'COMPLETED',
  realized_pnl REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(position_id) REFERENCES positions(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL UNIQUE, company_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, symbol TEXT, amount REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL, reference_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS fund_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_type TEXT NOT NULL CHECK(transaction_type IN ('ADD','WITHDRAW')),
  amount REAL NOT NULL CHECK(amount > 0), balance_after REAL NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY CHECK(id = 1), brokerage REAL NOT NULL DEFAULT 0,
  exchange_charges REAL NOT NULL DEFAULT 0, taxes REAL NOT NULL DEFAULT 0, other_charges REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS market_data (
  symbol TEXT PRIMARY KEY, label TEXT NOT NULL, price REAL NOT NULL, change_percent REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'Stocks', simulated INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_funds_created ON fund_transactions(created_at DESC);
