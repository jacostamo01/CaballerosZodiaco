'use strict';
const http = require('http');
const { URL } = require('url');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || tramway.proxy.rlwy.net;         // ej: containers-us-west-xxx.railway.app
const DB_PORT = Number(process.env.DB_PORT || 44218); // 3306 (o el que te dé Railway)
const DB_USER = process.env.DB_USER || root;         // usuario Railway
const DB_PASS = process.env.DB_PASS || fIssUDcOHlhBFWdAZRiapLUZILysMxMI;         // password Railway
const DB_NAME = process.env.DB_NAME  || railway;         // p.ej. caballeros_zodiaco
const DB_SSL  = (process.env.DB_SSL || 'false').toLowerCase() === 'true';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: DB_SSL ? { rejectUnauthorized: true } : undefined
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone = '-05:00'");  // America/Bogota (sin DST)
});

function send(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}
function isValidUrl(u){ return typeof u==='string' && (u.startsWith('http://')||u.startsWith('https://')); }
function readBody(req){
  return new Promise((resolve,reject)=>{
    let data=''; req.on('data',c=>data+=c);
    req.on('end',()=>{ try{ resolve(data?JSON.parse(data):{}); } catch{ reject(new Error('JSON inválido')); } });
    req.on('error',reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }); return res.end();
  }
  const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
  const cleanPath = (urlObj.pathname || '/').replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'POST' && cleanPath === '/personajes') {
      const body = await readBody(req);
      const nombre = (body.nombre||'').trim();
      const constelacion = (body.constelacion||'').trim();
      const imagen_url = (body.imagen_url||'').trim();
      const edad = body.edad ?? null;
      const altura_cm = body.altura_cm ?? null;

      if (!nombre) return send(res,400,{ok:false,error:'nombre es obligatorio'});
      if (!constelacion) return send(res,400,{ok:false,error:'constelacion es obligatoria'});
      if (!imagen_url) return send(res,400,{ok:false,error:'imagen_url es obligatoria'});
      if (!isValidUrl(imagen_url)) return send(res,400,{ok:false,error:'imagen_url debe iniciar con http(s)://'});

      if (edad!==null && (!Number.isFinite(Number(edad)) || edad<10 || edad>100))
        return send(res,400,{ok:false,error:'edad fuera de rango [10,100]'});
      if (altura_cm!==null && (!Number.isFinite(Number(altura_cm)) || altura_cm<120 || altura_cm>230))
        return send(res,400,{ok:false,error:'altura_cm fuera de rango [120,230]'});

      const sql = `INSERT INTO personajes (nombre, edad, altura_cm, constelacion, imagen_url) VALUES (?,?,?,?,?)`;
      try {
        const [r] = await pool.execute(sql, [
          nombre, edad!==null?Number(edad):null,
          altura_cm!==null?Number(altura_cm):null,
          constelacion, imagen_url
        ]);
        return send(res,201,{ok:true,id:r.insertId,message:'Personaje creado'});
      } catch (e) {
        if (e && e.code==='ER_DUP_ENTRY') return send(res,409,{ok:false,error:'Nombre duplicado'});
        console.error(e); return send(res,500,{ok:false,error:'Error al insertar'});
      }
    }
    send(res,404,{ok:false,error:'Ruta no encontrada'});
  } catch (e) {
    console.error(e); send(res,500,{ok:false,error:'Error interno'});
  }
});


const PORT = Number(process.env.PORT || 5000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ms-insercion escuchando en http://0.0.0.0:${PORT} (DB=${DB_NAME})`);
});
