const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z"/><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2V21"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  truck: '<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7"/><circle cx="7.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  sparkles: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrowIn: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  arrowOut: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
  trash: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
  package: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z"/><path d="m3.8 7.7 8.2 4.5 8.2-4.5M12 12.2V21"/>',
};

const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.package}</svg>`;
document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icon(node.dataset.icon);
});

const today = new Date();
const isoDay = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
let state = { products: [], suppliers: [], movements: [] };
let currentPage = "dashboard";
let searchTerm = "";
let categoryFilter = "all";
let toastTimer;
let activeToast;
const pageView = document.querySelector("#page-view");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalContent = document.querySelector("#modal-content");

async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    document.querySelector("#connection-status").textContent = "Server nicht erreichbar";
    document.querySelector("#connection-status").classList.add("offline");
    throw new Error("Der StockPilot-Server ist nicht erreichbar. Bitte prüfe die Verbindung und lade die Seite erneut.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Der Server hat eine ungültige Antwort gesendet.");
  }
  if (!response.ok) throw new Error(result.error || "Die Anfrage konnte nicht verarbeitet werden.");
  if (Array.isArray(result.products) && Array.isArray(result.suppliers) && Array.isArray(result.movements)) {
    state = result;
    document.querySelector("#connection-status").textContent = "Datenbank verbunden";
    document.querySelector("#connection-status").classList.remove("offline");
  }
  return result;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const currency = (value) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
const productById = (id) => state.products.find((product) => product.id === id);
const stockStatus = (product) => product.quantity === 0 ? "critical" : product.quantity <= product.min ? "low" : "in-stock";
const stockLabel = (product) => ({ critical: "Nicht vorrätig", low: "Niedriger Bestand", "in-stock": "Auf Lager" })[stockStatus(product)];

function showToast(message, isError = false) {
  const region = document.querySelector("#toast-region");
  activeToast?.remove();
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " toast-error" : ""}`;
  toast.innerHTML = `<span class="toast-mark">${isError ? "!" : "✓"}</span><span>${escapeHtml(message)}</span>`;
  region.append(toast);
  activeToast = toast;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.remove();
    if (activeToast === toast) activeToast = null;
  }, 3200);
}

function showConnectionError(message) {
  pageView.innerHTML = `<section class="panel connection-error"><h2>Keine Verbindung zur Datenbank</h2><p>${escapeHtml(message)}</p><button class="button button-primary" id="retry-connection">Erneut versuchen</button></section>`;
  document.querySelector("#retry-connection").addEventListener("click", async () => {
    pageView.innerHTML = '<div class="loading-state">Verbindung wird hergestellt ...</div>';
    try {
      await apiRequest("/api/state");
      render();
    } catch (error) {
      showConnectionError(error.message);
    }
  });
}

function movementLabel(movement) {
  return `<span class="movement-badge ${movement.type === "out" ? "out" : ""}">${icon(movement.type === "in" ? "arrowIn" : "arrowOut")}${movement.type === "in" ? "Wareneingang" : "Warenausgang"}</span>`;
}

function movementRows(movements, limit = movements.length) {
  const rows = movements.slice(0, limit).map((movement) => {
    const product = productById(movement.productId);
    if (!product) return "";
    return `<tr>
      <td>${formatDate(movement.date)}</td>
      <td><div class="table-product"><span class="product-thumbnail">${escapeHtml(product.emoji)}</span><span>${escapeHtml(product.name)}</span></div></td>
      <td>${movementLabel(movement)}</td>
      <td>${movement.type === "in" ? "+" : "−"}${movement.quantity} Stk.</td>
      <td>${escapeHtml(movement.note || "—")}</td>
    </tr>`;
  }).join("");
  return rows || '<tr><td class="empty-state" colspan="5">Noch keine Warenbewegungen vorhanden.</td></tr>';
}

function renderDashboard() {
  const lowStock = state.products.filter((product) => stockStatus(product) !== "in-stock");
  const value = state.products.reduce((total, product) => total + product.quantity * product.price, 0);
  const movementsToday = state.movements.filter((movement) => movement.date === isoDay(today)).length;
  const categories = [...new Set(state.products.map((product) => product.category))];
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = isoDay(date);
    const totals = state.movements.filter((movement) => movement.date === key).reduce((result, movement) => {
      result[movement.type] += movement.quantity;
      return result;
    }, { in: 0, out: 0 });
    return { label: new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(date).replace(".", ""), ...totals };
  });
  const max = Math.max(10, ...chartData.map((item) => Math.max(item.in, item.out)));
  const chartBars = chartData.map((item, index) => {
    const x = 58 + index * 77;
    const inHeight = Math.max(3, item.in / max * 92);
    const outHeight = Math.max(3, item.out / max * 92);
    return `<rect class="chart-bar-in" x="${x}" y="${112 - inHeight}" width="16" height="${inHeight}"/><rect class="chart-bar-out" x="${x + 20}" y="${112 - outHeight}" width="16" height="${outHeight}"/><text class="chart-label" x="${x + 18}" y="137" text-anchor="middle">${escapeHtml(item.label)}</text>`;
  }).join("");
  const gridLines = [0, 1, 2, 3].map((line) => `<line class="chart-gridline" x1="38" x2="100%" y1="${20 + line * 31}" y2="${20 + line * 31}"/><text class="chart-label" x="0" y="${23 + line * 31}">${Math.round(max * (3 - line) / 3)}</text>`).join("");
  const lowRows = lowStock.slice(0, 4).map((product, index) => `
    <div class="low-stock-item">
      <span class="product-thumbnail tone-${index}">${escapeHtml(product.emoji)}</span>
      <span class="low-stock-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · Min. ${product.min} Stk.</small></span>
      <span class="stock-pill ${product.quantity === 0 ? "critical" : ""}">${product.quantity} übrig</span>
    </div>`).join("");

  pageView.innerHTML = `
    <section class="metrics-grid" aria-label="Lagerübersicht">
      <article class="metric-card"><div class="metric-top"><span>Lagerwert gesamt</span><span class="metric-icon">${icon("package")}</span></div><div class="metric-value">${currency(value)}</div><div class="metric-caption"><span class="positive">↗ Aktuell</span> · zum Einkaufspreis</div></article>
      <article class="metric-card"><div class="metric-top"><span>Artikelvarianten</span><span class="metric-icon blue">${icon("box")}</span></div><div class="metric-value">${state.products.length}</div><div class="metric-caption">Artikel in ${categories.length} Kategorien</div></article>
      <article class="metric-card"><div class="metric-top"><span>Kritischer Bestand</span><span class="metric-icon orange">${icon("activity")}</span></div><div class="metric-value">${lowStock.length}</div><div class="metric-caption"><span class="attention">${lowStock.filter((product) => product.quantity === 0).length} Artikel ausverkauft</span> · prüfen</div></article>
      <article class="metric-card"><div class="metric-top"><span>Bewegungen heute</span><span class="metric-icon purple">${icon("arrowIn")}</span></div><div class="metric-value">${movementsToday}</div><div class="metric-caption">Letzte Lagerbuchungen</div></article>
    </section>
    <div class="dashboard-grid">
      <section class="panel chart-panel">
        <div class="panel-header"><div><h2 class="panel-title">Warenbewegungen</h2><p class="panel-subtitle">Ein- und Ausgänge der letzten 7 Tage</p></div><div class="chart-legend"><span class="legend-item"><i class="legend-dot"></i> Eingang</span><span class="legend-item"><i class="legend-dot incoming"></i> Ausgang</span></div></div>
        <div class="chart-wrap"><svg viewBox="0 0 560 145" preserveAspectRatio="none" role="img" aria-label="Warenbewegungen der letzten sieben Tage">${gridLines}${chartBars}</svg></div>
      </section>
      <section class="panel low-stock-panel">
        <div class="panel-header"><div><h2 class="panel-title">Benötigt Aufmerksamkeit</h2><p class="panel-subtitle">Artikel unter dem Mindestbestand</p></div><button class="text-link" data-page="inventory">Alle ansehen →</button></div>
        <div class="low-stock-list">${lowRows || '<p class="empty-state">Alles bestens! Keine kritischen Bestände.</p>'}</div>
      </section>
    </div>
    <section class="panel activity-panel">
      <div class="panel-header"><div><h2 class="panel-title">Letzte Warenbewegungen</h2><p class="panel-subtitle">Die zuletzt erfassten Lagerbuchungen</p></div><button class="text-link" data-page="movements">Alle Bewegungen →</button></div>
      <div class="inventory-table-wrap"><table class="activity-table"><thead><tr><th>DATUM</th><th>ARTIKEL</th><th>VORGANG</th><th>MENGE</th><th>BESCHREIBUNG</th></tr></thead><tbody>${movementRows([...state.movements].sort((a, b) => b.date.localeCompare(a.date)), 5)}</tbody></table></div>
    </section>`;
}

function productRows(products) {
  return products.map((product) => {
    const status = stockStatus(product);
    const fill = Math.min(100, Math.max(0, product.quantity / Math.max(product.min * 2, 1) * 100));
    return `<tr>
      <td><div class="table-product"><span class="product-thumbnail">${escapeHtml(product.emoji)}</span><span>${escapeHtml(product.name)}<small class="table-code">${escapeHtml(product.sku)}</small></span></div></td>
      <td>${escapeHtml(product.category)}</td><td>${escapeHtml(product.supplier || "—")}</td>
      <td><div class="stock-level"><span>${product.quantity} <span class="table-code">/ ${product.min} Min.</span></span><span class="stock-track"><span class="stock-fill ${status === "in-stock" ? "" : status}" style="display:block;width:${fill}%"></span></span></div></td>
      <td>${currency(product.price)}</td><td><span class="status-label ${status === "in-stock" ? "" : status}">${stockLabel(product)}</span></td>
      <td><div class="row-actions"><button class="row-action" data-action="movement" data-id="${escapeHtml(product.id)}" title="Warenbewegung buchen" aria-label="Warenbewegung für ${escapeHtml(product.name)} buchen">${icon("arrowIn")}</button><button class="row-action" data-action="edit" data-id="${escapeHtml(product.id)}" title="Bearbeiten" aria-label="${escapeHtml(product.name)} bearbeiten">${icon("edit")}</button><button class="row-action" data-action="delete" data-id="${escapeHtml(product.id)}" title="Löschen" aria-label="${escapeHtml(product.name)} löschen">${icon("trash")}</button></div></td>
    </tr>`;
  }).join("") || '<tr><td class="empty-state" colspan="7">Keine passenden Artikel gefunden.</td></tr>';
}

function renderInventory() {
  const query = searchTerm.trim().toLocaleLowerCase("de-DE");
  const products = state.products.filter((product) => {
    const matchesQuery = !query || [product.name, product.sku, product.category, product.supplier].some((value) => value?.toLocaleLowerCase("de-DE").includes(query));
    const matchesCategory = categoryFilter === "all" || (categoryFilter === "low" ? stockStatus(product) !== "in-stock" : product.category === categoryFilter);
    return matchesQuery && matchesCategory;
  });
  const categories = [...new Set(state.products.map((product) => product.category))];
  pageView.innerHTML = `<section class="panel page-panel">
    <div class="table-toolbar"><label class="search-field">${icon("search")}<input id="inventory-search" type="search" placeholder="Artikel, SKU oder Lieferant suchen ..." value="${escapeHtml(searchTerm)}" aria-label="Artikel suchen"></label>
      <select class="select-field" id="category-filter" aria-label="Nach Kategorie filtern"><option value="all">Alle Kategorien</option>${categories.map((category) => `<option value="${escapeHtml(category)}" ${categoryFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}<option value="low" ${categoryFilter === "low" ? "selected" : ""}>Kritischer Bestand</option></select>
      <span class="table-code">${products.length} Artikel angezeigt</span>
    </div>
    <div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>ARTIKEL</th><th>KATEGORIE</th><th>LIEFERANT</th><th>LAGERBESTAND</th><th>STÜCKPREIS</th><th>STATUS</th><th>AKTIONEN</th></tr></thead><tbody>${productRows(products)}</tbody></table></div>
    <div class="footer-note">Der Lagerstatus wird anhand des festgelegten Mindestbestands automatisch aktualisiert.</div>
  </section>`;
  document.querySelector("#inventory-search").addEventListener("input", (event) => {
    searchTerm = event.target.value;
    const cursor = event.target.selectionStart;
    renderInventory();
    const input = document.querySelector("#inventory-search");
    input.focus();
    input.setSelectionRange(cursor, cursor);
  });
  document.querySelector("#category-filter").addEventListener("change", (event) => {
    categoryFilter = event.target.value;
    renderInventory();
  });
}

function renderMovements() {
  pageView.innerHTML = `<section class="panel page-panel"><div class="panel-header"><div><h2 class="panel-title">Alle Warenbewegungen</h2><p class="panel-subtitle">Alle erfassten Wareneingänge und -ausgänge</p></div><button class="button button-secondary button-small" id="movement-add-button">${icon("plus")} Bewegung erfassen</button></div>
    <div class="inventory-table-wrap"><table class="activity-table"><thead><tr><th>DATUM</th><th>ARTIKEL</th><th>VORGANG</th><th>MENGE</th><th>BESCHREIBUNG</th></tr></thead><tbody>${movementRows([...state.movements].sort((a, b) => b.date.localeCompare(a.date)))}</tbody></table></div>
    <div class="footer-note">${state.movements.length} Warenbewegungen erfasst.</div></section>`;
  document.querySelector("#movement-add-button").addEventListener("click", () => openMovementModal());
}

function renderSuppliers() {
  const rows = state.suppliers.map((supplier) => `<tr>
    <td><div class="supplier-contact"><span class="supplier-avatar">${escapeHtml(supplier.name.slice(0, 1))}</span><span><strong>${escapeHtml(supplier.name)}</strong><small class="table-code">${escapeHtml(supplier.contact || "Keine Ansprechperson")}</small></span></div></td>
    <td>${escapeHtml(supplier.email || "—")}</td><td>${escapeHtml(supplier.phone || "—")}</td><td>${supplier.products} Artikel</td>
    <td><div class="row-actions"><button class="row-action" data-action="edit-supplier" data-id="${escapeHtml(supplier.id)}" title="Lieferant bearbeiten" aria-label="${escapeHtml(supplier.name)} bearbeiten">${icon("edit")}</button><button class="row-action" data-action="delete-supplier" data-id="${escapeHtml(supplier.id)}" title="Lieferant löschen" aria-label="${escapeHtml(supplier.name)} löschen">${icon("trash")}</button></div></td></tr>`).join("");
  pageView.innerHTML = `<section class="panel page-panel"><div class="panel-header"><div><h2 class="panel-title">Lieferantenverzeichnis</h2><p class="panel-subtitle">Deine Geschäftspartner im Überblick</p></div><span class="table-code">${state.suppliers.length} Lieferanten</span></div>
    <div class="supplier-toolbar"><span class="table-code">${state.suppliers.length} Lieferanten · ${state.products.filter((product) => product.supplierId).length} zugeordnete Artikel</span><button class="button button-secondary button-small" id="supplier-add-button">${icon("plus")} Lieferant hinzufügen</button></div>
    <div class="inventory-table-wrap"><table class="suppliers-table"><thead><tr><th>LIEFERANT</th><th>E-MAIL</th><th>TELEFON</th><th>ARTIKEL</th><th>AKTIONEN</th></tr></thead><tbody>${rows || '<tr><td class="empty-state" colspan="5">Noch keine Lieferanten vorhanden.</td></tr>'}</tbody></table></div><div class="footer-note">Beim Löschen eines Lieferanten bleiben die Artikel erhalten und werden als „ohne Lieferant“ geführt.</div></section>`;
  document.querySelector("#supplier-add-button").addEventListener("click", () => openSupplierModal());
}

const pageMeta = {
  dashboard: ["Übersicht", "Wichtige Entwicklungen und dein Lagerbestand auf einen Blick."],
  inventory: ["Lagerbestand", "Verwalte Artikel, Bestände und Lieferanten."],
  movements: ["Warenbewegungen", "Behalte alle Wareneingänge und -ausgänge im Blick."],
  suppliers: ["Lieferanten", "Kontaktdaten und Artikel deiner Lieferanten im Überblick."],
};
function render() {
  document.querySelector("#breadcrumb-current").textContent = pageMeta[currentPage][0];
  document.querySelector("#page-title").textContent = pageMeta[currentPage][0];
  document.querySelector("#page-description").textContent = pageMeta[currentPage][1];
  document.querySelector("#add-product-button").hidden = currentPage === "suppliers";
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === currentPage));
  document.querySelector("#nav-product-count").textContent = state.products.length;
  if (currentPage === "dashboard") renderDashboard();
  if (currentPage === "inventory") renderInventory();
  if (currentPage === "movements") renderMovements();
  if (currentPage === "suppliers") renderSuppliers();
}

function openModal(title, content, onSubmit) {
  document.querySelector("#modal-title").textContent = title;
  modalContent.innerHTML = content;
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  modalContent.querySelector("form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    void Promise.resolve()
      .then(() => onSubmit(new FormData(form)))
      .catch((error) => showToast(error.message || "Die Anfrage konnte nicht verarbeitet werden.", true))
      .finally(() => {
        if (!modalBackdrop.hidden) submitButton.disabled = false;
      });
  });
  modalContent.querySelector("input, select")?.focus();
}
function closeModal() {
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
}
function selectOptions(selected = "") {
  const categories = [...new Set([...state.products.map((product) => product.category), "Elektronik", "Verbrauchsmaterial", "Zubehör", "Verpackung", "Lagerausstattung"])];
  return categories.map((category) => `<option value="${escapeHtml(category)}" ${selected === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("");
}
function supplierOptions(selected = "") {
  return `<option value="">Kein Lieferant</option>${state.suppliers.map((supplier) => `<option value="${escapeHtml(supplier.id)}" ${selected === supplier.id ? "selected" : ""}>${escapeHtml(supplier.name)}</option>`).join("")}`;
}

function openProductModal(product = null) {
  const editing = Boolean(product);
  const stockField = editing
    ? `<div class="form-field"><span class="form-label">Aktueller Bestand</span><strong class="form-value">${product.quantity} Stück</strong><span class="form-hint">Bestände ausschließlich über Warenbewegungen ändern.</span></div>`
    : `<div class="form-field"><label for="product-quantity">Anfangsbestand *</label><input id="product-quantity" name="quantity" type="number" min="0" step="1" required value="0"></div>`;
  const content = `<form><div class="form-grid">
    <div class="form-field full"><label for="product-name">Artikelname *</label><input id="product-name" name="name" required maxlength="80" placeholder="z. B. Kabelloser Barcodescanner" value="${escapeHtml(product?.name ?? "")}"></div>
    <div class="form-field"><label for="product-sku">Artikelnummer (SKU) *</label><input id="product-sku" name="sku" required maxlength="24" placeholder="z. B. ELE-001" value="${escapeHtml(product?.sku ?? "")}"></div>
    <div class="form-field"><label for="product-category">Kategorie *</label><select id="product-category" name="category" required>${selectOptions(product?.category)}</select></div>
    ${stockField}
    <div class="form-field"><label for="product-min">Mindestbestand *</label><input id="product-min" name="min" type="number" min="0" step="1" required value="${product?.min ?? 5}"></div>
    <div class="form-field"><label for="product-price">Einkaufspreis pro Stück (€) *</label><input id="product-price" name="price" type="number" min="0" step="0.01" required value="${product?.price ?? ""}"></div>
    <div class="form-field"><label for="product-supplier">Lieferant</label><select id="product-supplier" name="supplierId">${supplierOptions(product?.supplierId)}</select></div>
    <div class="form-field full"><span class="form-hint">Erreicht der Bestand den Mindestbestand, wird der Artikel als kritisch markiert. Jeder Wareneingang und -ausgang wird dauerhaft dokumentiert.</span></div>
  </div><div class="modal-actions"><button type="button" class="button button-secondary" data-cancel>Abbrechen</button><button class="button button-primary" type="submit">${editing ? "Änderungen speichern" : "Artikel hinzufügen"}</button></div></form>`;
  openModal(editing ? "Artikel bearbeiten" : "Neuen Artikel hinzufügen", content, async (form) => {
    const data = {
      name: String(form.get("name")).trim(),
      sku: String(form.get("sku")).trim(),
      category: String(form.get("category")),
      min: Number(form.get("min")),
      price: Number(form.get("price")),
      supplierId: String(form.get("supplierId") || ""),
    };
    if (!editing) data.quantity = Number(form.get("quantity"));
    try {
      await apiRequest(editing ? `/api/products/${encodeURIComponent(product.id)}` : "/api/products", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal();
      render();
      showToast(editing ? "Artikeldaten wurden aktualisiert." : "Artikel wurde erfolgreich hinzugefügt.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openSupplierModal(supplier = null) {
  const editing = Boolean(supplier);
  const content = `<form><div class="form-grid">
    <div class="form-field full"><label for="supplier-name">Lieferantenname *</label><input id="supplier-name" name="name" required maxlength="80" placeholder="z. B. BüroPlus" value="${escapeHtml(supplier?.name ?? "")}"></div>
    <div class="form-field full"><label for="supplier-contact">Ansprechperson</label><input id="supplier-contact" name="contact" maxlength="80" placeholder="Vor- und Nachname" value="${escapeHtml(supplier?.contact ?? "")}"></div>
    <div class="form-field"><label for="supplier-email">E-Mail-Adresse</label><input id="supplier-email" name="email" type="email" maxlength="120" placeholder="kontakt@beispiel.de" value="${escapeHtml(supplier?.email ?? "")}"></div>
    <div class="form-field"><label for="supplier-phone">Telefon</label><input id="supplier-phone" name="phone" type="tel" maxlength="40" placeholder="+49 ..." value="${escapeHtml(supplier?.phone ?? "")}"></div>
  </div><div class="modal-actions"><button type="button" class="button button-secondary" data-cancel>Abbrechen</button><button class="button button-primary" type="submit">${editing ? "Änderungen speichern" : "Lieferant hinzufügen"}</button></div></form>`;
  openModal(editing ? "Lieferant bearbeiten" : "Neuen Lieferanten hinzufügen", content, async (form) => {
    const data = Object.fromEntries(["name", "contact", "email", "phone"].map((key) => [key, String(form.get(key) || "").trim()]));
    try {
      await apiRequest(editing ? `/api/suppliers/${encodeURIComponent(supplier.id)}` : "/api/suppliers", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      closeModal();
      render();
      showToast(editing ? "Lieferantendaten wurden aktualisiert." : "Lieferant wurde erfolgreich hinzugefügt.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openMovementModal(product = null) {
  if (!state.products.length) {
    showToast("Bitte füge zuerst einen Artikel hinzu, um eine Warenbewegung zu erfassen.");
    return;
  }
  const productOptions = state.products.map((item) => `<option value="${escapeHtml(item.id)}" ${product?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${item.quantity} Stk.</option>`).join("");
  const content = `<form><div class="form-grid">
    <div class="form-field full"><label for="movement-product">Artikel *</label><select name="productId" id="movement-product" required>${productOptions}</select></div>
    <div class="form-field"><label for="movement-type">Vorgang *</label><select name="type" id="movement-type"><option value="in">Wareneingang</option><option value="out">Warenausgang</option></select></div>
    <div class="form-field"><label for="movement-quantity">Menge *</label><input id="movement-quantity" name="quantity" type="number" min="1" step="1" required placeholder="Stück"></div>
    <div class="form-field full"><label for="movement-note">Beschreibung</label><input id="movement-note" name="note" maxlength="100" placeholder="z. B. Lieferung vom Lieferanten"></div>
    <div class="form-field full"><span class="form-hint" id="movement-stock-hint"></span></div>
  </div><div class="modal-actions"><button type="button" class="button button-secondary" data-cancel>Abbrechen</button><button class="button button-primary" type="submit">Bewegung speichern</button></div></form>`;
  openModal("Warenbewegung erfassen", content, async (form) => {
    const productId = String(form.get("productId"));
    const type = String(form.get("type"));
    const quantity = Number(form.get("quantity"));
    const target = productById(productId);
    if (!target || !Number.isInteger(quantity) || quantity < 1) {
      showToast("Bitte wähle einen Artikel und gib eine gültige Menge ein.");
      return;
    }
    if (type === "out" && quantity > target.quantity) {
      showToast(`Nicht genügend Bestand. Aktuell verfügbar: ${target.quantity} Stück.`);
      return;
    }
    try {
      await apiRequest("/api/movements", {
        method: "POST",
        body: JSON.stringify({ productId, type, quantity, note: String(form.get("note")).trim() }),
      });
      closeModal();
      render();
      showToast(type === "in" ? "Wareneingang wurde erfasst." : "Warenausgang wurde erfasst.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
  const updateHint = () => {
    const selected = productById(document.querySelector("#movement-product").value);
    const type = document.querySelector("#movement-type").value;
    document.querySelector("#movement-stock-hint").textContent = selected ? `Aktueller Bestand: ${selected.quantity} Stück${type === "out" ? ". Die Ausbuchungsmenge darf den Bestand nicht überschreiten." : "."}` : "";
  };
  document.querySelector("#movement-product").addEventListener("change", updateHint);
  document.querySelector("#movement-type").addEventListener("change", updateHint);
  updateHint();
}

async function deleteProduct(id) {
  const product = productById(id);
  if (!product || !window.confirm(`Möchtest du „${product.name}“ und alle zugehörigen Warenbewegungen wirklich löschen?`)) return;
  try {
    await apiRequest(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    render();
    showToast("Artikel und zugehörige Warenbewegungen wurden gelöscht.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteSupplier(id) {
  const supplier = state.suppliers.find((item) => item.id === id);
  if (!supplier || !window.confirm(`Möchtest du den Lieferanten „${supplier.name}“ löschen? Zugeordnete Artikel bleiben erhalten.`)) return;
  try {
    await apiRequest(`/api/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
    render();
    showToast("Lieferant wurde gelöscht. Die Artikel bleiben erhalten.");
  } catch (error) {
    showToast(error.message, true);
  }
}

function exportCsv() {
  const headers = ["Artikelname", "Artikelnummer", "Kategorie", "Lagerbestand", "Mindestbestand", "Stückpreis (EUR)", "Lieferant", "Status"];
  const rows = state.products.map((product) => [product.name, product.sku, product.category, product.quantity, product.min, product.price, product.supplier, stockLabel(product)]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `stockpilot-lagerbestand-${isoDay(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Lagerbestand wurde als CSV-Datei exportiert.");
}

document.querySelectorAll(".nav-link, .help-link").forEach((button) => {
  button.addEventListener("click", () => {
    currentPage = button.dataset.page;
    document.querySelector("#sidebar").classList.remove("open");
    render();
  });
});
document.querySelector("#page-view").addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    currentPage = pageButton.dataset.page;
    render();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const product = productById(action.dataset.id);
  if (action.dataset.action === "edit" && product) openProductModal(product);
  if (action.dataset.action === "movement" && product) openMovementModal(product);
  if (action.dataset.action === "delete") void deleteProduct(action.dataset.id);
  if (action.dataset.action === "edit-supplier") {
    const supplier = state.suppliers.find((item) => item.id === action.dataset.id);
    if (supplier) openSupplierModal(supplier);
  }
  if (action.dataset.action === "delete-supplier") void deleteSupplier(action.dataset.id);
});
document.querySelector("#add-product-button").addEventListener("click", () => openProductModal());
document.querySelector("#export-button").addEventListener("click", exportCsv);
document.querySelector("#modal-close").addEventListener("click", closeModal);
document.querySelector("#modal-backdrop").addEventListener("click", (event) => {
  if (event.target === modalBackdrop || event.target.closest("[data-cancel]")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});
document.querySelector("#mobile-menu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#reset-demo").addEventListener("click", async () => {
  if (!window.confirm("Möchtest du die Demodaten wirklich zurücksetzen? Dabei werden deine eigenen Änderungen gelöscht.")) return;
  try {
    await apiRequest("/api/demo/reset", { method: "POST" });
    render();
    showToast("Demodaten wurden wiederhergestellt.");
  } catch (error) {
    showToast(error.message, true);
  }
});

const todayText = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" }).format(today);
document.querySelector("#today-label").textContent = todayText;
document.querySelector("#live-date").textContent = `· ${todayText}`;
render();
pageView.innerHTML = '<div class="loading-state">Datenbank wird geladen ...</div>';
apiRequest("/api/state").then(render).catch((error) => showConnectionError(error.message));
