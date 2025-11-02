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

/* ====== HELPERS ====== */
function send(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

async function healthCheck() {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM personajes');
    return { ok: true, db: DB_NAME, table: 'personajes', count: rows[0].n };
  } catch (e) {
    return { ok: false, code: e.code, errno: e.errno, message: e.message };
  }
}

/* ====== SERVER ====== */
const server = http.createServer(async (req, res) => {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
  // normaliza path (quita slashes al final)
  const cleanPath = (urlObj.pathname || '/').replace(/\/+$/, '') || '/';

  try {
    /* ---- GET /health ---- */
    if (req.method === 'GET' && cleanPath === '/health') {
      const h = await healthCheck();
      return send(res, h.ok ? 200 : 500, h);
    }

    /* ---- GET /personajes  y  /personajes/:id ---- */
    if (req.method === 'GET' && (cleanPath === '/personajes' || /^\/personajes\/\d+$/.test(cleanPath))) {
      // id por path o por query
      const pathId = cleanPath.startsWith('/personajes/') ? Number(cleanPath.split('/')[2]) : null;
      const qId = urlObj.searchParams.get('id');
      const id = pathId ?? (qId ? Number(qId) : null);

      const constelacion = urlObj.searchParams.get('constelacion');
      const nombreLike = urlObj.searchParams.get('nombre');

      // sanitiza números para no parametrizar LIMIT/OFFSET
      const limit = (() => {
        const n = Number(urlObj.searchParams.get('limit') || 50);
        if (!Number.isFinite(n)) return 50;
        return Math.min(Math.max(n, 1), 200);
      })();
      const offset = (() => {
        const n = Number(urlObj.searchParams.get('offset') || 0);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n;
      })();

      // Construcción de SQL con parámetros sólo en filtros (no en limit/offset)
      let sql = `
        SELECT id, nombre, edad, altura_cm, constelacion, imagen_url, created_at
        FROM personajes
        WHERE 1=1
      `;
      const params = [];

      if (id && Number.isFinite(id)) {
        sql += ' AND id = ?';
        params.push(id);
      }
      if (constelacion) {
        sql += ' AND constelacion = ?';
        params.push(constelacion);
      }
      if (nombreLike) {
        sql += ' AND LOWER(nombre) LIKE ?';
        params.push(`%${nombreLike.toLowerCase()}%`);
      }

    
      sql += ` ORDER BY id LIMIT ${limit} OFFSET ${offset}`;

      const [rows] = await pool.execute(sql, params);

      if ((id && Number.isFinite(id)) && rows.length === 0) {
        return send(res, 404, { ok: false, error: 'No encontrado' });
      }
      return send(res, 200, { ok: true, count: rows.length, data: rows });
    }

    // Ruta no encontrada
    return send(res, 404, { ok: false, error: 'Ruta no encontrada' });
  } catch (e) {
    console.error('[Consulta] ERROR:', e);
    return send(res, 500, { ok: false, error: 'Error interno', detail: { code: e.code, errno: e.errno, msg: e.message } });
  }
});

/* ====== START ====== */
// ...resto igual...
const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ms-consulta escuchando en http://0.0.0.0:${PORT} (DB=${DB_NAME})`);
});
