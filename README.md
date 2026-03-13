## Layers of Memory – README (für Prüfer:innen)

Dieses Dokument erklärt **Schritt für Schritt**, wie Sie das Projekt lokal installieren, eine eigene API-Konfiguration hinterlegen und die Ausstellung anschließend starten können.

Das Projekt ist unter folgendem Repository zu finden:  
`https://github.com/zumrak/LayersOfMemory`

---

### 1. Ziel des Projekts (kurz)

- **Idee**: Aus gesprochene Erinnerungen werden Bilder generiert und auf mehrere Vorhänge projiziert.  
- **Technik**:
  - Frontend: SvelteKit (Svelte 5), TypeScript, Tailwind CSS v4
  - Lokaler Sprachdienst: Whisper (Python, FastAPI)
  - Bildgenerierung: OpenRouter (externer Bild‑API‑Dienst)
- **Wichtig**: Unsere eigenen API‑Schlüssel werden **nicht** im Repository mitgeliefert. Sie müssen **eigene API‑Zugänge** anlegen und in einer `.env`‑Datei eintragen (siehe unten).

---

### 2. Voraussetzungen auf dem Rechner

Bitte stellen Sie sicher, dass Folgendes installiert ist:

- **Git** (zum Klonen des Repositories)
- **Node.js** (empfohlen LTS-Version, z. B. ≥ 20.x)
- **pnpm** als Paketmanager  
  - Installation (falls noch nicht vorhanden):  
    ```bash
    npm install -g pnpm
    ```
- **Python 3.10+** (für den lokalen Whisper‑Dienst)
- Internetzugang (für die Bild‑API über OpenRouter oder einen anderen Anbieter Ihrer Wahl)

---

### 3. Repository klonen

1. Öffnen Sie ein Terminal / eine PowerShell.
2. Wählen Sie einen Ordner, in den Sie das Projekt legen möchten, z. B. `C:\Projekte`.
3. Führen Sie folgenden Befehl aus:

```bash
git clone https://github.com/zumrak/LayersOfMemory
cd LayersOfMemory
```

Alle weiteren Schritte gehen davon aus, dass Sie sich **im Ordner `LayersOfMemory`** befinden.

---

### 4. Aufbauanleitung (Raum & Technik)

#### Raum und Aufbau

1. Beamer auf ein Podest stellen.
2. Laptop verdeckt unter dem Podest platzieren (Lüftung freihalten).
3. Fünf Vorhänge parallel hintereinander von der Decke aufhängen.
4. Abstand Beamer zum ersten Vorhang: ca. 1–2 m.
5. Abstand zwischen den Vorhängen: ca. 35 cm.
6. Mikrofon seitlich neben dem Podest platzieren.
7. Maus neben dem Beamer bereitlegen.

#### Verkabelung

- Laptop und Beamer mit Strom versorgen.
- HDMI-Kabel vom Laptop zum Beamer anschließen.
- Mikrofon per USB/USB-C mit dem Laptop verbinden.
- Maus per USB anschließen.

---

### 5. Abhängigkeiten installieren (Frontend)

Im Projektordner:

```bash
pnpm install
```

Dieser Befehl liest die `package.json` und `pnpm-lock.yaml` ein und installiert alle benötigten JavaScript/TypeScript‑Abhängigkeiten.

---

### 6. Eigene API‑Konfiguration / `.env` anlegen

Wir liefern **keine** produktiven API‑Schlüssel mit.  
Damit die Bildgenerierung funktioniert, müssen Sie eigene Zugangsdaten anlegen und in einer `.env`‑Datei eintragen.

1. Im Projektordner gibt es eine Beispieldatei: `.env.example`.
2. Erstellen Sie daraus Ihre persönliche Umgebungsdatei:

```bash
cp .env.example .env
```

   Unter Windows PowerShell alternativ:

```powershell
Copy-Item .env.example .env
```

3. Öffnen Sie die neue Datei `.env` in einem Editor.
4. Tragen Sie Ihre eigenen Werte ein:

- **Pflicht** (für Bild‑API, z. B. OpenRouter):
  - `OPENROUTER_API_KEY`  
    - Hier kommt Ihr persönlicher API‑Schlüssel hinein, den Sie z. B. bei `openrouter.ai` erzeugen.
- **Optional / Feineinstellungen** (nur bei Bedarf ändern):
  - `OPENROUTER_IMAGE_MODEL`
  - `OPENROUTER_IMAGE_FALLBACK_MODEL`
  - weitere Optionen für Retries / Delays etc.
- **Whisper‑Dienst**:
  - `WHISPER_BASE_URL` – Standard ist `http://127.0.0.1:8000`.  
    Wenn Sie den Whisper‑Server auf einem anderen Rechner oder Port starten, müssen Sie den Wert hier anpassen.

> Hinweis: Die `.env`‑Datei wird **nicht** ins Git‑Repository eingecheckt. Sie bleibt lokal auf Ihrem Rechner und enthält Ihre privaten Schlüssel.

---

### 7. Lokalen Whisper‑Dienst starten (Spracherkennung)

Für die Transkription der gesprochenen Erinnerungen nutzt das Projekt einen **lokalen Whisper‑Server** (Python, FastAPI/Uvicorn).

1. Navigieren Sie in den Ordner für den Dienst (ausgehend vom Projektstamm `LayersOfMemory`):

```bash
cd services/whisper
```

2. Erstellen Sie (falls noch nicht vorhanden) eine Python‑Virtual‑Environment (optional, aber empfohlen):

```bash
python -m venv .venv
```

3. Aktivieren Sie das virtuelle Environment:

- PowerShell:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```
- CMD:
  ```cmd
  .venv\Scripts\activate.bat
  ```

4. Installieren Sie die Python‑Abhängigkeiten (abhängig von der vorhandenen `requirements.txt` oder Dokumentation im Ordner):

```bash
pip install -r requirements.txt
```

5. Starten Sie den Whisper‑Server (genauer Befehl siehe ggf. im `services/whisper`‑Ordner, z. B.):

```bash
python main.py
```

oder

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

6. Lassen Sie dieses Terminal **offen**, damit der Dienst weiterläuft.

> Wichtig: Die URL/Port des Whisper‑Servers muss zu `WHISPER_BASE_URL` in Ihrer `.env` passen (Standard: `http://127.0.0.1:8000`).

---

### 8. Web‑Anwendung starten (Frontend / SvelteKit)

Öffnen Sie ein **neues** Terminal oder Tab (Whisper‑Server weiterlaufen lassen!) und gehen Sie zurück in den Projektstamm:

```bash
cd path\zu\LayersOfMemory
```

Starten Sie den Dev‑Server:

```bash
pnpm run dev
```

Die Ausgabe zeigt Ihnen die URL an, z. B.:

```text
  Local:   http://localhost:5173/
```

Öffnen Sie diese URL im Browser (z. B. Microsoft Edge oder Chrome).

---

### 9. Anwendung im Ausstellungsmodus benutzen

1. Öffnen Sie im Browser die Dev‑URL, z. B. `http://localhost:5173`.
2. Ziehen Sie das Browserfenster auf den Beamer‑Bildschirm oder aktivieren Sie Bildschirm duplizieren.
3. Drücken Sie `F11`, um in den **Vollbildmodus** zu wechseln.
4. Klicken Sie **einmal** auf den Button „Aufnahme starten“ und erlauben Sie den Mikrofonzugriff.
5. Sprechen Sie eine Erinnerung und nennen Sie ein Jahr oder Jahrzehnt (z. B. „1980er“).
6. Nach der Aufnahme wird im Hintergrund:
   - die Sprache von Whisper transkribiert,
   - das Jahrzehnt erkannt,
   - ein Bildprompt erzeugt und
   - über die Bild‑API (OpenRouter o. Ä.) ein Bild generiert.
7. Das Bild erscheint auf der Projektionsfläche; nach einer Weile kehrt die Anwendung automatisch in den Ausgangszustand zurück.

---

### 10. Server und Ausstellung stoppen

1. **Browser schließen** oder `F11` drücken, um den Vollbildmodus zu verlassen.
2. Im Terminal mit dem Dev‑Server:
   - `Ctrl + C` drücken, um `pnpm run dev` zu beenden.
3. Im Terminal mit dem Whisper‑Server:
   - ebenfalls `Ctrl + C` drücken, um den Dienst zu beenden.
4. Beamer / Rechner wie gewohnt ausschalten.

---

### 11. Typische Fehler und Lösungen (kurz)

- **Kein Bild wird generiert**
  - Prüfen, ob der Whisper‑Server läuft.
  - Prüfen, ob `OPENROUTER_API_KEY` in `.env` korrekt gesetzt ist und ob Internetzugang besteht.
- **Aufnahme startet nicht**
  - Im Browser prüfen, ob Mikrofonzugriff erlaubt ist.
  - Seite neu laden (`F5`) und einmal auf den Aufnahme‑Button klicken.
- **Fehler beim Start von `pnpm run dev`**
  - Sicherstellen, dass `pnpm install` vorher erfolgreich durchgelaufen ist.
  - Node.js‑Version prüfen (LTS, keine sehr alte Version).

---

### 12. Projektstruktur (Überblick)

- `src/` – SvelteKit‑Anwendung (UI, Logik, Routen)
- `static/gallery/` – Hier werden generierte PNG‑Bilder abgelegt
- `services/whisper/` – Python‑Dienst für lokale Spracherkennung (Whisper)
- `docs/` – Ausstellungs‑Dokumentation und Anleitungen
- `.env.example` – Vorlage für Ihre eigene `.env` mit API‑Konfiguration

---

### 13. Wichtiger Hinweis zu API‑Schlüsseln

- Im Repository sind **keine** gültigen Schlüssel für externe Dienste enthalten.
- Prüfer:innen / Installierende müssen:
  - sich selbst bei einem passenden Anbieter registrieren (z. B. OpenRouter),
  - einen API‑Schlüssel erstellen und
  - diesen in `.env` unter `OPENROUTER_API_KEY` eintragen.

Ab diesem Zeitpunkt funktioniert das Projekt mit Ihrer eigenen API‑Konfiguration und kann für weitere Prüfungen oder Ausstellungen wiederverwendet werden.

