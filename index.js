// Vercel entry point. Vercel's writable filesystem is limited to /tmp.
if (process.env.VERCEL && !process.env.DB_PATH) {
  process.env.DB_PATH = '/tmp/trading-simulator.sqlite';
}
module.exports = require('./backend/server');
