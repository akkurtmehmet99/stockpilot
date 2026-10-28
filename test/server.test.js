import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createStockPilotServer } from "../server.js";

let server;
let directory;
let baseUrl;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "stockpilot-test-"));
  server = createStockPilotServer({ databasePath: path.join(directory, "stockpilot.sqlite") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

async function request(url, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test("liefert Beispieldaten und stellt die Oberfläche mit Sicherheitsheadern bereit", async () => {
  const state = await request("/api/state");
  assert.equal(state.status, 200);
  assert.equal(state.data.products.length, 8);
  assert.equal(state.data.suppliers.length, 3);
  assert.equal(state.data.movements.length, 6);

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");

  const source = await fetch(`${baseUrl}/server.js`);
  assert.equal(source.status, 404);
  const database = await fetch(`${baseUrl}/data/stockpilot.sqlite`);
  assert.equal(database.status, 404);
});

test("legt Artikel mit Anfangsbestand an und protokolliert jede Bestandsänderung", async () => {
  const created = await request("/api/products", {
    method: "POST",
    body: { name: "Neuer Artikel", sku: "NEW-001", category: "Zubehör", quantity: 7, min: 2, price: 4.25, supplierId: "" },
  });
  assert.equal(created.status, 201);
  const product = created.data.products.find((item) => item.sku === "NEW-001");
  assert.equal(product.quantity, 7);
  assert.equal(created.data.movements[0].note, "Anfangsbestand");

  const edited = await request(`/api/products/${product.id}`, {
    method: "PUT",
    body: { name: "Aktualisierter Artikel", sku: "NEW-001", category: "Zubehör", min: 3, price: 5, supplierId: "" },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.products.find((item) => item.id === product.id).quantity, 7);

  const received = await request("/api/movements", {
    method: "POST",
    body: { productId: product.id, type: "in", quantity: 3, note: "Nachbestellung" },
  });
  assert.equal(received.status, 201);
  assert.equal(received.data.products.find((item) => item.id === product.id).quantity, 10);
  assert.equal(received.data.movements[0].note, "Nachbestellung");
});

test("verhindert doppelte Artikelnummern und Ausbuchungen über den verfügbaren Bestand", async () => {
  const duplicate = await request("/api/products", {
    method: "POST",
    body: { name: "Doppelter Artikel", sku: "ele-001", category: "Elektronik", quantity: 1, min: 1, price: 1, supplierId: "" },
  });
  assert.equal(duplicate.status, 409);

  const rejected = await request("/api/movements", {
    method: "POST",
    body: { productId: "prd-1001", type: "out", quantity: 9, note: "Zu große Menge" },
  });
  assert.equal(rejected.status, 409);
  assert.match(rejected.data.error, /Nicht genügend Bestand/);
  const state = await request("/api/state");
  assert.equal(state.data.products.find((item) => item.id === "prd-1001").quantity, 8);
});

test("verwaltet Lieferanten und löst Artikelzuordnungen beim Löschen sicher auf", async () => {
  const updated = await request("/api/suppliers/sup-1", {
    method: "PUT",
    body: { name: "Techno Distribution", contact: "Neue Ansprechperson", email: "kontakt@techno.de", phone: "" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.suppliers.find((item) => item.id === "sup-1").contact, "Neue Ansprechperson");

  const deleted = await request("/api/suppliers/sup-1", { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.products.find((item) => item.id === "prd-1001").supplierId, null);
});

test("löscht zugehörige Warenbewegungen und weist ungültige Eingaben zurück", async () => {
  const deleted = await request("/api/products/prd-1002", { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.products.some((item) => item.id === "prd-1002"), false);
  assert.equal(deleted.data.movements.some((item) => item.productId === "prd-1002"), false);

  const invalid = await request("/api/movements", {
    method: "POST",
    body: { productId: "prd-1001", type: "out", quantity: -2, note: "" },
  });
  assert.equal(invalid.status, 400);
});

test("weist übergroße Anfragen mit einer verständlichen Fehlermeldung zurück", async () => {
  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(1024 * 1024 + 1),
  });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /zu groß/);
});

test("stellt die Demodaten zurück und erhält die Datenbank nach einem Neustart", async () => {
  await request("/api/products", {
    method: "POST",
    body: { name: "Temporärer Artikel", sku: "TMP-001", category: "Zubehör", quantity: 0, min: 0, price: 0, supplierId: "" },
  });
  const reset = await request("/api/demo/reset", { method: "POST", body: {} });
  assert.equal(reset.data.products.length, 8);
  assert.equal(reset.data.suppliers.length, 3);

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = createStockPilotServer({ databasePath: path.join(directory, "stockpilot.sqlite") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const persisted = await request("/api/state");
  assert.equal(persisted.data.products.length, 8);
  assert.equal(persisted.data.products.find((item) => item.id === "prd-1001").quantity, 8);
});
