# LibreChat – demos-europe Fork

Eigener Fork von [LibreChat](https://github.com/danny-avila/LibreChat) mit integriertem
MCP-Approval-System.

**Image**: `ghcr.io/demos-europe/librechat:latest`

---

## Eigene Änderungen gegenüber Upstream

| Datei | Änderung |
|---|---|
| `api/server/index.js` | +2 Zeilen: approval-Router registrieren |
| `api/server/routes/approval.js` | Neu: REST-Endpunkt `/api/approval` |
| `api/server/services/ApprovalService.js` | Neu: Approval-Logik (pending/resolve) |
| `client/src/routes/Root.tsx` | `ApprovalProvider` wraps `SetConvoProvider` |
| `client/src/App.jsx` | Minimale Anpassung (kein Provider hier!) |
| `client/src/components/Approval/` | Neu: Modal + Provider + index |

---

## Neues Image bauen

Ein Push auf `main` triggert automatisch den GitHub Actions Workflow
(`.github/workflows/docker-build.yml`) und baut `Dockerfile.with-docker-cli`.

**Was der Build macht:**
1. Base: `ghcr.io/danny-avila/librechat-dev:latest` (upstream, pre-built)
2. Approval-Dateien per `COPY` ins Image
3. Frontend-Bundle neu bauen (`npm install && npm run build` in `/app/client`)
4. Tags: `latest` + `sha-<7-Zeichen-SHA>`

```bash
# Upstream-Updates einspielen:
git fetch upstream
git merge upstream/main
git push   # → CI baut neues Image
```

**Lokal testen** (ohne Push):
```bash
docker build -f Dockerfile.with-docker-cli -t librechat-test .
```

**TypeScript-Check vor Push** (30 Sek, fängt unsere Fehler):
```bash
cd client && npx tsc --noEmit 2>&1 | grep "Approval\|Root.tsx\|App.jsx"
```
*(Die vielen upstream-Fehler in `e2e/` etc. können ignoriert werden — pre-existing)*

---

## Deployment

```bash
# Image aktualisieren:
docker compose pull api && docker compose up -d api
```

Rollback auf vorherigen SHA:
```bash
# Laufenden SHA prüfen:
docker inspect LibreChat --format '{{.Config.Image}}'

# In docker-compose.override.yml pinnen:
# image: ghcr.io/demos-europe/librechat:sha-abc1234
docker compose up -d api
```

---

## Kritische Stellen — hier passieren Fehler

### 1. `index.js` — NUR 2 Zeilen hinzufügen

Bei jedem Upstream-Merge muss `index.js` auf Basis der **aktuellen upstream-Version**
bleiben. Niemals eine alte Version verwenden — die Routes-Struktur ändert sich zwischen
Major-Versionen drastisch.

Nur diese zwei Zeilen gehören rein:
```javascript
const approvalRouter = require('./routes/approval');  // nach anderen requires
app.use('/api/approval', approvalRouter);             // nach app.use('/api/mcp', ...)
```

### 2. `ApprovalProvider` — gehört in `Root.tsx`, NICHT `App.jsx`

In `App.jsx` ist `AuthProvider` noch nicht verfügbar → `useAuthContext()` crasht.
`Root.tsx` rendert nur bei `isAuthenticated` und hat den Auth-Context bereits.

```tsx
// Root.tsx
<ApprovalProvider>
  <SetConvoProvider>
    ...
  </SetConvoProvider>
</ApprovalProvider>
```

### 3. Frontend-Bundle — wird im Dockerfile neu gebaut

Das Base-Image enthält einen pre-built Vite-Bundle — einfaches `COPY` von `.tsx/.jsx`
hat **keine Wirkung** ohne Rebuild. Der Build läuft im Dockerfile (Pflicht).

**Prüfen ob's geklappt hat**: Browser lädt `index.<HASH>.js` — wenn der Hash nach dem
Deploy gleich bleibt, wurde das Bundle nicht neu gebaut.

### 4. `npm install` im Dockerfile ist Pflicht

Das Base-Image hat `client/node_modules/` ohne dev-dependencies.
Ohne `npm install` schlägt `npm run build` fehl.

---

## Einmalig: lokale Workspace-Packages aufsetzen

Nötig für TypeScript-Checks lokal (einmalig pro Clone):
```bash
npm install
npm run build:data-provider
npm run build:client-package
```
