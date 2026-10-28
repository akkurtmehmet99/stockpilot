import { createServer } from "node:http";
import { createReadStream, mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const maxRequestSize = 1024 * 1024;
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/screenshots/dashboard.png", "screenshots/dashboard.png"],
  ["/screenshots/inventory.png", "screenshots/inventory.png"],
]);
const seedSuppliers = [
  { id: "sup-1", name: "Techno Distribution", contact: "Anna Weber", email: "bestellung@techno-distribution.de", phone: "+49 30 555 01 42" },
  { id: "sup-2", name: "BüroPlus", contact: "Max Schneider", email: "service@bueroplus.de", phone: "+49 40 555 03 18" },
  { id: "sup-3", name: "Paket & Co.", contact: "Lena Fischer", email: "hallo@paketundco.de", phone: "+49 89 555 02 67" },
];
const seedProducts = [
  { id: "prd-1001", name: "Kabelloser Barcodescanner", sku: "ELE-001", category: "Elektronik", quantity: 8, min: 10, price: 12.5, supplierId: "sup-1", emoji: "▥" },
  { id: "prd-1002", name: "Thermoetikettenrolle", sku: "SAR-014", category: "Verbrauchsmaterial", quantity: 42, min: 20, price: 1.85, supplierId: "sup-2", emoji: "▤" },
  { id: "prd-1003", name: "Schutzhülle für MDE-Gerät", sku: "AKS-028", category: "Zubehör", quantity: 4, min: 8, price: 3.2, supplierId: "sup-1", emoji: "▱" },
  { id: "prd-1004", name: "Packband 45 mm", sku: "PAK-009", category: "Verpackung", quantity: 126, min: 30, price: 0.38, supplierId: "sup-3", emoji: "◉" },
  { id: "prd-1005", name: "USB-C-Adapter", sku: "ELE-019", category: "Elektronik", quantity: 0, min: 6, price: 4.9, supplierId: "sup-1", emoji: "⌁" },
  { id: "prd-1006", name: "Druckerpapier A4", sku: "SAR-002", category: "Verbrauchsmaterial", quantity: 68, min: 25, price: 1.65, supplierId: "sup-2", emoji: "▧" },
  { id: "prd-1007", name: "Regaletikettenhalter", sku: "RAF-011", category: "Lagerausstattung", quantity: 13, min: 10, price: 0.72, supplierId: "sup-3", emoji: "▰" },
  { id: "prd-1008", name: "Sicherheitsschere", sku: "DEP-006", category: "Lagerausstattung", quantity: 3, min: 10, price: 0.95, supplierId: "sup-2", emoji: "✂" },
];
const seedMovements = [
  { id: "mov-1", productId: "prd-1002", type: "in", quantity: 20, note: "Wöchentliche Bestellung", daysAgo: 0 },
  { id: "mov-2", productId: "prd-1001", type: "out", quantity: 2, note: "Auftrag #SP-2408", daysAgo: 0 },
  { id: "mov-3", productId: "prd-1004", type: "in", quantity: 50, note: "Lieferung vom Lieferanten", daysAgo: 1 },
  { id: "mov-4", productId: "prd-1006", type: "out", quantity: 12, note: "Interner Verbrauch", daysAgo: 2 },
  { id: "mov-5", productId: "prd-1003", type: "out", quantity: 3, note: "Auftrag #SP-2392", daysAgo: 3 },
  { id: "mov-6", productId: "prd-1008", type: "in", quantity: 10, note: "Lagerauffüllung", daysAgo: 4 },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDate(date);
}

function openDatabase(databasePath) {
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (databasePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      contact TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      sku_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      min_quantity INTEGER NOT NULL CHECK (min_quantity >= 0),
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
      emoji TEXT NOT NULL DEFAULT '▦',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('in', 'out')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      note TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS movements_created_at_idx ON movements(created_at);
    CREATE INDEX IF NOT EXISTS products_supplier_id_idx ON products(supplier_id);
  `);
  const version = database.prepare("PRAGMA user_version").get().user_version;
  if (version > 1) {
    database.close();
    throw new Error(`Nicht unterstützte Datenbankversion: ${version}`);
  }
  database.exec("PRAGMA user_version = 1;");
  seedDatabase(database);
  return database;
}

function withTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function seedDatabase(database) {
  const initialized = database.prepare("SELECT value FROM settings WHERE key = 'initialized'").get();
  if (initialized) return;
  withTransaction(database, () => {
    insertDemoData(database);
    database.prepare("INSERT INTO settings (key, value) VALUES ('initialized', 'true')").run();
  });
}

function insertDemoData(database) {
  const now = new Date().toISOString();
  const insertSupplier = database.prepare(`
    INSERT INTO suppliers (id, name, name_key, contact, email, phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const supplier of seedSuppliers) {
    insertSupplier.run(supplier.id, supplier.name, supplier.name.toLocaleLowerCase("de-DE"), supplier.contact, supplier.email, supplier.phone, now);
  }
  const insertProduct = database.prepare(`
    INSERT INTO products (id, name, sku, sku_key, category, quantity, min_quantity, price_cents, supplier_id, emoji, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const product of seedProducts) {
    insertProduct.run(product.id, product.name, product.sku, product.sku.toLocaleLowerCase("de-DE"), product.category, product.quantity, product.min, Math.round(product.price * 100), product.supplierId, product.emoji, now, now);
  }
  const insertMovement = database.prepare(`
    INSERT INTO movements (id, product_id, type, quantity, note, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const movement of seedMovements) {
    const date = dateDaysAgo(movement.daysAgo);
    insertMovement.run(movement.id, movement.productId, movement.type, movement.quantity, movement.note, date, `${date}T12:00:00.000Z`);
  }
}

function readState(database) {
  const products = database.prepare(`
    SELECT p.id, p.name, p.sku, p.category, p.quantity, p.min_quantity AS min,
      p.price_cents / 100.0 AS price, p.supplier_id AS supplierId,
      COALESCE(s.name, '') AS supplier, p.emoji
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ORDER BY p.name COLLATE NOCASE
  `).all();
  const suppliers = database.prepare(`
    SELECT s.id, s.name, s.contact, s.email, s.phone, COUNT(p.id) AS products
    FROM suppliers s
    LEFT JOIN products p ON p.supplier_id = s.id
    GROUP BY s.id
    ORDER BY s.name COLLATE NOCASE
  `).all();
  const movements = database.prepare(`
    SELECT id, product_id AS productId, type, quantity, note, date
    FROM movements
    ORDER BY created_at DESC, rowid DESC
  `).all();
  return { products, suppliers, movements };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textField(body, key, label, maxLength, { required = true } = {}) {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    if (!required) return "";
    throw new HttpError(400, `${label} ist ein Pflichtfeld.`);
  }
  if (typeof value !== "string") throw new HttpError(400, `${label} muss Text sein.`);
  const normalized = value.trim();
  if (required && !normalized) throw new HttpError(400, `${label} darf nicht leer sein.`);
  if (normalized.length > maxLength) throw new HttpError(400, `${label} darf höchstens ${maxLength} Zeichen lang sein.`);
  return normalized;
}

function integerField(body, key, label, { min = 0, max = 2147483647 } = {}) {
  const value = body[key];
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${label} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  }
  return value;
}

function normalizeSupplier(database, body, supplierId = "") {
  if (!isRecord(body)) throw new HttpError(400, "Die Anfrage enthält ungültige Daten.");
  const supplier = {
    name: textField(body, "name", "Der Lieferantenname", 80),
    contact: textField(body, "contact", "Die Ansprechperson", 80, { required: false }),
    email: textField(body, "email", "Die E-Mail-Adresse", 120, { required: false }),
    phone: textField(body, "phone", "Die Telefonnummer", 40, { required: false }),
  };
  if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
    throw new HttpError(400, "Bitte gib eine gültige E-Mail-Adresse ein.");
  }
  const duplicate = database.prepare("SELECT id FROM suppliers WHERE name_key = ? AND id != ?").get(supplier.name.toLocaleLowerCase("de-DE"), supplierId);
  if (duplicate) throw new HttpError(409, "Ein Lieferant mit diesem Namen ist bereits vorhanden.");
  return supplier;
}

function normalizeProduct(database, body, { creating, productId } = {}) {
  if (!isRecord(body)) throw new HttpError(400, "Die Anfrage enthält ungültige Daten.");
  const name = textField(body, "name", "Der Artikelname", 80);
  const sku = textField(body, "sku", "Die Artikelnummer", 24);
  const skuKey = sku.toLocaleLowerCase("de-DE");
  const duplicate = database.prepare("SELECT id FROM products WHERE sku_key = ? AND id != ?").get(skuKey, productId ?? "");
  if (duplicate) throw new HttpError(409, "Diese Artikelnummer wird bereits verwendet.");
  const category = textField(body, "category", "Die Kategorie", 50);
  const min = integerField(body, "min", "Der Mindestbestand");
  if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0 || body.price > 10000000) {
    throw new HttpError(400, "Der Einkaufspreis muss zwischen 0 und 10.000.000 Euro liegen.");
  }
  const supplierId = textField(body, "supplierId", "Der Lieferant", 80, { required: false }) || null;
  if (supplierId && !database.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId)) {
    throw new HttpError(400, "Der ausgewählte Lieferant ist nicht vorhanden.");
  }
  return {
    name,
    sku,
    skuKey,
    category,
    min,
    priceCents: Math.round(body.price * 100),
    supplierId,
    ...(creating ? { quantity: integerField(body, "quantity", "Der Anfangsbestand") } : {}),
  };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxRequestSize) {
        settled = true;
        request.resume();
        reject(new HttpError(413, "Die Anfrage ist zu groß."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!isRecord(value)) throw new HttpError(400, "Die Anfrage enthält ungültige Daten.");
        settled = true;
        resolve(value);
      } catch (error) {
        settled = true;
        reject(error instanceof HttpError ? error : new HttpError(400, "Die Anfrage enthält kein gültiges JSON."));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function productExists(database, productId) {
  return Boolean(database.prepare("SELECT id FROM products WHERE id = ?").get(productId));
}

function createMovement(database, body) {
  if (!isRecord(body)) throw new HttpError(400, "Die Anfrage enthält ungültige Daten.");
  const { productId, type, quantity, note } = body;
  if (typeof productId !== "string" || !productExists(database, productId)) {
    throw new HttpError(404, "Der ausgewählte Artikel wurde nicht gefunden.");
  }
  if (type !== "in" && type !== "out") throw new HttpError(400, "Bitte wähle Wareneingang oder Warenausgang.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2147483647) {
    throw new HttpError(400, "Die Menge muss eine ganze Zahl größer als null sein.");
  }
  const description = typeof note === "string" ? note.trim() : "";
  if (description.length > 100) throw new HttpError(400, "Die Beschreibung darf höchstens 100 Zeichen lang sein.");
  const update = database.prepare(type === "in"
    ? "UPDATE products SET quantity = quantity + ?, updated_at = ? WHERE id = ? AND quantity <= ?"
    : "UPDATE products SET quantity = quantity - ?, updated_at = ? WHERE id = ? AND quantity >= ?");
  const now = new Date().toISOString();
  const result = update.run(quantity, now, productId, type === "in" ? 2147483647 - quantity : quantity);
  if (result.changes === 0) {
    const product = database.prepare("SELECT quantity FROM products WHERE id = ?").get(productId);
    if (type === "out") throw new HttpError(409, `Nicht genügend Bestand. Aktuell verfügbar: ${product.quantity} Stück.`);
    throw new HttpError(409, "Die neue Menge überschreitet den zulässigen Höchstbestand.");
  }
  const movementId = randomUUID();
  database.prepare(`
    INSERT INTO movements (id, product_id, type, quantity, note, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(movementId, productId, type, quantity, description || (type === "in" ? "Wareneingang" : "Warenausgang"), localDate(), now);
}

async function handleApi(request, response, database, url) {
  const { pathname } = url;
  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { status: "verbunden" });
    return;
  }
  if (pathname === "/api/state" && request.method === "GET") {
    sendJson(response, 200, readState(database));
    return;
  }
  if (pathname === "/api/products" && request.method === "POST") {
    const product = normalizeProduct(database, await readJson(request), { creating: true });
    withTransaction(database, () => {
      const now = new Date().toISOString();
      const id = randomUUID();
      database.prepare(`
        INSERT INTO products (id, name, sku, sku_key, category, quantity, min_quantity, price_cents, supplier_id, emoji, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '▦', ?, ?)
      `).run(id, product.name, product.sku, product.skuKey, product.category, product.quantity, product.min, product.priceCents, product.supplierId, now, now);
      if (product.quantity > 0) {
        database.prepare(`
          INSERT INTO movements (id, product_id, type, quantity, note, date, created_at)
          VALUES (?, ?, 'in', ?, 'Anfangsbestand', ?, ?)
        `).run(randomUUID(), id, product.quantity, localDate(), now);
      }
    });
    sendJson(response, 201, readState(database));
    return;
  }
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    const id = decodeURIComponent(productMatch[1]);
    if (!productExists(database, id)) throw new HttpError(404, "Der Artikel wurde nicht gefunden.");
    if (request.method === "PUT") {
      const product = normalizeProduct(database, await readJson(request), { creating: false, productId: id });
      database.prepare(`
        UPDATE products
        SET name = ?, sku = ?, sku_key = ?, category = ?, min_quantity = ?, price_cents = ?, supplier_id = ?, updated_at = ?
        WHERE id = ?
      `).run(product.name, product.sku, product.skuKey, product.category, product.min, product.priceCents, product.supplierId, new Date().toISOString(), id);
      sendJson(response, 200, readState(database));
      return;
    }
    if (request.method === "DELETE") {
      database.prepare("DELETE FROM products WHERE id = ?").run(id);
      sendJson(response, 200, readState(database));
      return;
    }
  }
  if (pathname === "/api/movements" && request.method === "POST") {
    const body = await readJson(request);
    withTransaction(database, () => createMovement(database, body));
    sendJson(response, 201, readState(database));
    return;
  }
  if (pathname === "/api/suppliers" && request.method === "POST") {
    const supplier = normalizeSupplier(database, await readJson(request));
    database.prepare(`
      INSERT INTO suppliers (id, name, name_key, contact, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), supplier.name, supplier.name.toLocaleLowerCase("de-DE"), supplier.contact, supplier.email, supplier.phone, new Date().toISOString());
    sendJson(response, 201, readState(database));
    return;
  }
  const supplierMatch = pathname.match(/^\/api\/suppliers\/([^/]+)$/);
  if (supplierMatch) {
    const id = decodeURIComponent(supplierMatch[1]);
    const existing = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(id);
    if (!existing) throw new HttpError(404, "Der Lieferant wurde nicht gefunden.");
    if (request.method === "PUT") {
      const supplier = normalizeSupplier(database, await readJson(request), id);
      database.prepare(`
        UPDATE suppliers SET name = ?, name_key = ?, contact = ?, email = ?, phone = ? WHERE id = ?
      `).run(supplier.name, supplier.name.toLocaleLowerCase("de-DE"), supplier.contact, supplier.email, supplier.phone, id);
      sendJson(response, 200, readState(database));
      return;
    }
    if (request.method === "DELETE") {
      database.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
      sendJson(response, 200, readState(database));
      return;
    }
  }
  if (pathname === "/api/demo/reset" && request.method === "POST") {
    withTransaction(database, () => {
      database.exec("DELETE FROM movements; DELETE FROM products; DELETE FROM suppliers;");
      insertDemoData(database);
    });
    sendJson(response, 200, readState(database));
    return;
  }
  throw new HttpError(404, "Die angeforderte Adresse wurde nicht gefunden.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "Die angeforderte Adresse ist ungültig.");
  }
  const relativePath = publicFiles.get(decodedPath);
  if (!relativePath) throw new HttpError(404, "Die angeforderte Datei wurde nicht gefunden.");
  const filePath = path.join(root, relativePath);
  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw new HttpError(404, "Die angeforderte Datei wurde nicht gefunden.");
    throw error;
  }
  if (!fileInfo.isFile()) throw new HttpError(404, "Die angeforderte Datei wurde nicht gefunden.");
  const contentType = mimeTypes[path.extname(filePath)] ?? "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileInfo.size,
    "Cache-Control": "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function createStockPilotServer({ databasePath = process.env.DATABASE_PATH ?? path.join(root, "data", "stockpilot.sqlite") } = {}) {
  const database = openDatabase(databasePath);
  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, database, url);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Diese Aktion ist nicht erlaubt.");
      await serveStatic(request, response, url.pathname);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error("Bei der Verarbeitung der Anfrage ist ein Fehler aufgetreten.", error);
      sendJson(response, 500, { error: "Ein interner Fehler ist aufgetreten. Bitte versuche es erneut." });
    }
  });
  server.on("close", () => database.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT muss eine gültige Portnummer sein.");
  const server = createStockPilotServer();
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`StockPilot läuft unter http://${host}:${address.port}`);
    console.log(`SQLite-Datenbank: ${path.resolve(process.env.DATABASE_PATH ?? path.join(root, "data", "stockpilot.sqlite"))}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
