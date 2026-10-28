# StockPilot

StockPilot ist eine deutschsprachige Lagerverwaltungs-App für kleine Unternehmen. Die Anwendung verbindet ein responsives Dashboard mit einer Node.js-Anwendung und einer dauerhaft gespeicherten SQLite-Datenbank.

## Funktionen

- Dashboard mit Lagerwert, kritischen Beständen, heutigen Buchungen und einer Bewegungsübersicht
- Artikel, Kategorien, Mindestbestände und Lieferanten verwalten
- Artikel nach Name, Artikelnummer, Kategorie oder Lieferant suchen und filtern
- Wareneingänge und -ausgänge mit Beschreibung buchen; negative Bestände werden serverseitig verhindert
- Anfangsbestände und alle späteren Bestandsänderungen nachvollziehbar protokollieren
- Lieferanten anlegen, bearbeiten und löschen; zugeordnete Artikel bleiben beim Löschen erhalten
- Lagerbestand als CSV-Datei exportieren
- SQLite-Transaktionen, Fremdschlüssel, eindeutige Artikelnummern und automatische Demodaten beim ersten Start
- Responsive Oberfläche mit Verbindungsstatus und verständlichen Fehlermeldungen

## Voraussetzungen

- Node.js 22.13 oder neuer (empfohlen: Node.js 24 LTS)
- Für den Containerbetrieb: Docker mit Docker Compose

SQLite ist in Node.js enthalten; für den Start werden keine zusätzlichen Pakete benötigt.

## Lokal starten

```bash
npm start
```

Öffne anschließend [http://localhost:3000](http://localhost:3000). Beim ersten Start werden Beispieldaten angelegt. Alle Änderungen werden standardmäßig unter `data/stockpilot.sqlite` gespeichert und bleiben nach einem Neustart erhalten.

Die Adresse, der Port und der Speicherort lassen sich über Umgebungsvariablen ändern:

```bash
HOST=127.0.0.1 PORT=3000 DATABASE_PATH=./data/stockpilot.sqlite npm start
```

Die Anwendung bindet sich standardmäßig nur an `127.0.0.1`. Für den Betrieb im Container wird sie an `0.0.0.0` gebunden.

## Mit Docker starten

```bash
docker compose up --build
```

Die Anwendung ist danach unter [http://localhost:3000](http://localhost:3000) erreichbar. Docker Compose legt ein persistentes Volume für die SQLite-Datenbank an. Zum Stoppen:

```bash
docker compose down
```

Das Datenbank-Volume bleibt dabei erhalten. `docker compose down --volumes` löscht es und damit auch die gespeicherten Daten.

## Tests

```bash
npm test
```

Die Tests starten die Anwendung mit temporären Datenbanken und prüfen unter anderem Artikelverwaltung, Lieferanten, Transaktionen, Validierungen und dauerhafte Speicherung. GitHub Actions führt sie bei Pushes auf `main` und bei Pull Requests aus.

## Datenbank und Datenschutz

Alle Daten werden in der konfigurierten SQLite-Datenbank gespeichert; StockPilot sendet sie nicht an externe APIs. Die Oberfläche und die Datenbank sind für eine einzelne Installation gedacht und enthalten keine Anmeldung oder Benutzerverwaltung. Stelle die Anwendung nicht ungeschützt ins öffentliche Internet. Für einen öffentlichen Betrieb müssen Authentifizierung, HTTPS und ein passendes Berechtigungskonzept ergänzt werden.

Die SQLite-Datei sollte regelmäßig gesichert werden. Stoppe vor dem Kopieren der Datenbank den Server, damit auch SQLite-WAL-Dateien konsistent behandelt werden.

## Veröffentlichung

GitHub Pages kann keine Node.js-Anwendung oder SQLite-Datenbank ausführen. Der bisherige statische Pages-Workflow wurde deshalb durch automatisierte Tests ersetzt. Für einen dauerhaft erreichbaren Betrieb muss der Server samt persistentem Speicher auf einem Node.js- oder Docker-Host laufen.

## Screenshots

### Dashboard

![StockPilot-Dashboard](./screenshots/dashboard.png)

### Lagerbestand

![StockPilot-Lagerbestand](./screenshots/inventory.png)

## Lizenz

Dieses Projekt dient als Portfolio- und Lernprojekt.
