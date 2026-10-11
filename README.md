# Trading Simulator — Mobile Prototype

A phone-first simulated trading app prototype based on the supplied reference video. The interface is built as a **Capacitor Android shell** with a lightweight HTML/CSS/JavaScript UI, Express API, and SQLite data store.

> **DEMO ONLY — NOT A BROKER APP.** Quotes, positions, orders, balances, profile details, P&L, and charges are simulated. There is no broker connection, live market feed, real-money order, or real fund transfer.

## Reference-matched screens and interactions

- Orders → Positions landing screen with BANKEX/NIFTY quote tiles, position rows, a pinned running total, and the five bottom tabs: Home, Watchlist, Portfolio, Orders, Account.
- Editable position name, one-tap Lots/Qty switch, quantity, contract lot size, average price, BUY/SELL side, and product type. Option rows style the NIFTY ticker separately from the date/strike details; switching unit modes preserves exposure.
- Stock Entry opens with an editable RELIANCE demo; Option Entry opens with an editable NIFTY 27-MAR-26 24500 CE demo. The product list is Intraday, Delivery, and CF.
- **Set LTP** sheet for the current simulated price and optional min/max range. When simulated market movement is enabled, ticks are clamped to the saved range.
- Tap the LTP change badge (for example, `(+0.18%)`) to set an exact **MANUAL %**, an editable **RANGE (%)** minimum/maximum, or restore automatic calculation. Range-mode values are displayed without an underline.
- **P&L Calculation** sheet with automatic, manual percentage, and sampled range modes. Manual/range settings persist and are used for row, total, portfolio, and exit calculations.
- Swipe a position row left to expose **Delete Entry**. Exit-at-market, Secure Exit, Exit All, filters, search, overflow actions, and Clear All Entries are functional.
- Account screen follows the supplied reference: editable trading balance, Withdraw/Add Funds, Pledge Holdings and MTF cards, editable R.K. Sharma demo profile/client ID, and the reference-style Reports and Statement list.
- Account, watchlist, portfolio, order history, simulated fund movements, charges, and CSV statement download are connected to persisted data.
- A fresh install seeds two clearly simulated reference-style positions for a ready-to-view prototype. Clearing/resetting them does **not** automatically add them back; choose the sample loader in Account if needed.

## Phone previews

The project includes 390 × 844 phone previews and a focused bottom-tab strip:

![Bottom tab icons](previews/nav-icons-390.png)

![Positions screen](previews/positions-390.png)

![Stock entry form](previews/add-stock-form-390.png)

![Option entry form](previews/add-option-form-390.png)

![Editable price-change percentage](previews/change-percent-390.png)

![Full option name and one-tap quantity mode](previews/option-full-name-row-390.png)

![Account balance screen](previews/account-top-390.png)

![Account reports screen](previews/account-reports-390.png)

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm run dev       # development server with file watch
# or
npm start         # regular server
```

Open <http://localhost:3000>. The server listens on port 3000 by default. SQLite is created at `backend/database.sqlite`; it can be relocated with `DB_PATH=/path/to/database.sqlite`. Use `PORT=3000` to select another port.

The server runs on `0.0.0.0` for local-network/preview use. The web preview is also phone-width friendly, but the deliverable’s intended installable form is the generated Capacitor Android project. The browser preview itself does not install an Android package.

## Android project

The generated Android Studio project is in `android/` (application ID `com.example.tradingsimulator`). It is synced to the frontend and Capacitor plugins. Android Studio and Android SDK are required to compile or sign an APK.

```bash
npm install
# In frontend/js/config.js, replace '/api' with an HTTPS backend API URL reachable by the phone:
# window.API_BASE_URL = 'https://your-host.example/api';
npx cap sync android
npx cap open android
```

In Android Studio, allow Gradle sync, then select **Build → Build Bundle(s) / APK(s) → Build APK(s)**. A phone cannot use its own `localhost` to reach a backend running on a separate development computer. Configure the backend’s `CORS_ORIGINS` if your Capacitor origin requires it. This app uses the Node/SQLite API for persistence, so a packaged Android app requires that API to be reachable; the generated Android shell is not a standalone embedded Node server.

**This sandbox does not have an Android SDK installed, so an APK was not compiled here.** The Android Studio project and Capacitor configuration are provided for building in an SDK-equipped environment.

## Data model and P&L

Tables include `account`, `positions`, `orders`, `watchlists`, `transactions`, `fund_transactions`, `charges`, and `market_data`. Startup performs idempotent SQLite column migrations for editable account profile details, LTP ranges, manual/range P&L settings, quantity mode, and manual/range displayed-price-change percentage without deleting saved data.

In **LOTS** mode, total quantity is `lots × lot_size`; in **QUANTITY** mode, the entered quantity is used directly. Switching a saved row between modes preserves its current exposure, and later edits use the selected mode. Automatic BUY P&L is `(LTP − average) × total quantity`; SELL reverses that direction. Manual/range P&L uses the saved percentage against invested amount and applies the same BUY/SELL direction. The displayed-price-change percentage beside LTP has separate AUTO, MANUAL, and RANGE settings and does not change P&L. Currency results are rounded to two decimals.

## API overview

All endpoints are JSON under `/api`.

| Methods and endpoint | Purpose |
|---|---|
| `GET /health`, `GET /state` | Health and full app snapshot |
| `GET, POST /positions`, `PUT, DELETE /positions/:id` | List, create, edit, or delete an open row |
| `PUT /positions/:id/settings` | Save LTP bounds/current price and manual/range P&L settings |
| `PUT /positions/:id/change-percent` | Set the displayed LTP percentage manually, sample from a range, or restore AUTO |
| `DELETE /positions` | Clear open rows without resetting account/watchlist |
| `POST /positions/:id/exit`, `POST /positions/exit-all` | Simulated exits and realized P&L |
| `GET, POST /orders`, `GET /positions/closed`, `GET /holdings` | Order and holdings data |
| `GET, PUT /account`, `PUT /account/profile`, `POST /account/funds`, `POST /account/withdraw` | Editable demo balance/profile and simulated fund changes |
| `GET, POST /watchlist`, `DELETE /watchlist/:id` | Watchlist management |
| `GET /markets`, `POST /simulate-price` | Simulated catalog and price movement |
| `GET /reports/pnl`, `GET /reports/:kind`, `GET, PUT /charges` | Reports and demo fee settings |
| `POST /demo-data`, `POST /reset` | Load sample data or confirm-reset the demo account |

## Project structure

```text
trading-simulator/
├── android/                       # Capacitor Android Studio project
├── backend/
│   ├── database/{database.js,schema.sql}
│   ├── routes/api.js
│   ├── services/calculations.js
│   └── server.js
├── frontend/
│   ├── index.html
│   ├── css/main.css
│   └── js/{config.js,calculations.js,api.js,app.js}
├── previews/                      # 390 × 844 mobile screen captures
├── test/calculations.test.js
├── capacitor.config.json
├── package.json
└── README.md
```

## Verification

Run `npm test` for calculation unit tests. The API and browser flows were exercised against isolated temporary SQLite databases, including migration of old saved positions, both quantity modes, CF, sample entry forms, manual/range P&L, editable LTP bounds, and holdings/orders quantities. Responsive layouts were checked at phone widths.


## Deploy to Vercel

This repository includes `vercel.json` and a root `index.js` entry point. Import the project into Vercel (or run `npx vercel` from this folder) and deploy with the default settings. The Express app serves the frontend and `/api/*` endpoints from the same deployment.

**Important database limitation:** this project uses `better-sqlite3`. Vercel's function filesystem is temporary, so the SQLite file is stored under `/tmp` on Vercel. It is suitable for a demo/simulator deployment, but changes may reset when the function instance is recycled and may not be shared consistently across instances. Do not use this deployment for real user accounts, real trading, or durable data. Persistent production data requires a hosted database (for example, Turso/libSQL or PostgreSQL) and a database adapter designed for it.

The application is a trading **simulator** only. Prices, orders, positions, and account balances are not connected to a broker or live market feed.
