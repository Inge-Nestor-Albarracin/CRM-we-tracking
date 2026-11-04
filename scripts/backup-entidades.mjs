// Respaldo completo de todas las entidades de la app Base44 a archivos JSON locales.
//
// Uso (desde la carpeta wtapp, en PowerShell):
//   $env:B44_TOKEN = "<token de sesión de un admin>"
//   node scripts/backup-entidades.mjs
//
// Cómo obtener el token: abre https://crm.wetracking.co con tu cuenta admin,
// F12 → Application/Aplicación → Local Storage → copia el valor de "base44_access_token".
// El token es personal: no lo compartas ni lo pegues en ningún archivo.
//
// Salida: backup/AAAA-MM-DDTHH-MM/<Entidad>.json  (la carpeta backup/ está en .gitignore:
// contiene datos de clientes y NUNCA debe subirse a GitHub).
//
// Solo LEE datos. No modifica ni borra nada en Base44.

import { createClient } from '@base44/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ID = process.env.B44_APP_ID || '6a43f4eff47c0d92cfe2b575';
const SERVER_URL = process.env.B44_SERVER_URL || 'https://base44.app';
const TOKEN = process.env.B44_TOKEN;
const PAGE = 500;

if (!TOKEN) {
  console.error('Falta la variable B44_TOKEN (token de sesión de un admin). Ver instrucciones al inicio del archivo.');
  process.exit(1);
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirEntidades = path.join(raiz, 'base44', 'entities');
const entidades = fs.readdirSync(dirEntidades)
  .filter((f) => f.endsWith('.jsonc'))
  .map((f) => f.replace(/\.jsonc$/, ''))
  .sort();

const sello = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
const dirSalida = path.join(raiz, 'backup', sello);
fs.mkdirSync(dirSalida, { recursive: true });

const b44 = createClient({ serverUrl: SERVER_URL, appId: APP_ID, token: TOKEN, requiresAuth: false });

async function listarTodo(nombre) {
  const ent = b44.entities[nombre];
  const todos = [];
  for (let skip = 0; ; skip += PAGE) {
    const pagina = await ent.list('created_date', PAGE, skip);
    if (!Array.isArray(pagina)) throw new Error(`Respuesta inesperada: ${JSON.stringify(pagina).slice(0, 200)}`);
    todos.push(...pagina);
    if (pagina.length < PAGE) return todos;
  }
}

const resumen = [];
let errores = 0;
for (const nombre of entidades) {
  try {
    const registros = await listarTodo(nombre);
    fs.writeFileSync(path.join(dirSalida, `${nombre}.json`), JSON.stringify(registros, null, 2));
    resumen.push({ entidad: nombre, registros: registros.length });
    console.log(`✔ ${nombre.padEnd(24)} ${registros.length}`);
  } catch (e) {
    errores++;
    const msg = e?.response?.status ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data).slice(0, 150)}` : String(e?.message || e);
    resumen.push({ entidad: nombre, error: msg });
    console.error(`✘ ${nombre.padEnd(24)} ${msg}`);
  }
}

fs.writeFileSync(path.join(dirSalida, '_resumen.json'), JSON.stringify({ fecha: new Date().toISOString(), appId: APP_ID, resumen }, null, 2));
console.log(`\nRespaldo en: ${dirSalida}`);
if (errores) {
  console.error(`${errores} entidad(es) con error. Revisa _resumen.json antes de continuar.`);
  process.exit(2);
}
