const express = require('express');
const path = require('node:path');
const api = require('./routes/api');
require('./database/database');
const app = express();
const PORT = Number(process.env.PORT || 3000);
app.disable('x-powered-by');
app.use(express.json({limit:'100kb'}));
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'https://localhost,http://localhost,capacitor://localhost').split(',').map(value=>value.trim()).filter(Boolean));
app.use((req,res,next)=>{
  const origin=req.get('origin');
  if(origin && allowedOrigins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
  if(req.method==='OPTIONS')return res.sendStatus(origin && !allowedOrigins.has(origin)?403:204);
  next();
});
app.use('/api', api);
app.get('/api/health', (req,res)=>res.json({ok:true,mode:'simulation'}));
app.use(express.static(path.join(__dirname,'..','frontend'),{extensions:['html']}));
app.get('/{*splat}',(req,res,next)=>{if(req.path.startsWith('/api/'))return next();res.sendFile(path.join(__dirname,'..','frontend','index.html'));});
app.use((req,res)=>res.status(404).json({error:'The requested resource was not found.'}));
app.use((err,req,res,next)=>{
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`,err.message);
  if(res.headersSent)return next(err);
  const status=err.status|| (err.type==='entity.parse.failed'?400:500);
  res.status(status).json({error:status===500?'Something went wrong. Please try again.':err.message});
});
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`Trading Simulator running at http://localhost:${PORT} (simulation only)`));
}

module.exports = app;
