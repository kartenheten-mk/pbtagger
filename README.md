# Planbeskrivning Tagger

Planbeskrivning Tagger är en webbapplikation för att läsa in planbeskrivningar i `.docx`, tagga innehåll och koppla taggar till geometrier från detaljplanedata. Appen bevarar originaldokumentet och kan exportera taggat dokument, geometri med motiv och hela projekt som `.pbproject`.

Full användarmanual och teknisk dokumentation finns i MkDocs under [docs](docs/index.md).

## Kom igång med appen

Förutsättningar:

- Node.js 20.19 eller senare
- npm 10 eller senare

Installera beroenden:

```bash
npm install
```

Starta utvecklingsservern:

```bash
npm run dev
```

Bygg appen:

```bash
npm run build
```

Förhandsgranska produktionsbygget:

```bash
npm run preview
```

## Dokumentation

Dokumentationen ligger i samma repo och byggs med MkDocs Material.

Skapa gärna en separat Python-miljö:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Installera dokumentationsberoenden:

```bash
python -m pip install -r requirements-docs.lock.txt
```

Starta dokumentationen lokalt:

```bash
mkdocs serve
```

Öppna sedan:

```text
http://127.0.0.1:8000/
```

Stoppa servern med `Ctrl+C`.

Verifiera dokumentationen:

```bash
mkdocs build --strict
```

Den byggda sidan hamnar i `site/`, som inte versioneras.

`requirements-docs.txt` beskriver toppnivåkraven för dokumentationen medan
`requirements-docs.lock.txt` används för reproducerbara dokumentationsbyggen.

## Release- och licenskontroller

Kontrollera Node-beroenden mot licenspolicyn:

```bash
npm run licenses:node:check
```

Kontrollera Python-beroenden för dokumentationen efter installation av den låsta
docs-miljön:

```bash
python scripts/check-python-licenses.py --check
```

Skapa releaseartefakten efter att appen och tredjepartsnotiserna är uppdaterade:

```bash
npm run release:dist
```

Release-zippen innehåller den byggda appen samt `LICENSE`, `CHANGELOG.md` och
`THIRD_PARTY_NOTICES.md`.

## Projektstruktur

| Sökväg | Innehåll |
| --- | --- |
| `src/` | React-, TypeScript- och applikationskod. |
| `tests/` | Vitest- och komponenttester. |
| `tests/specs/` | Specifikationsunderlag och compliance-noteringar. |
| `docs/` | MkDocs-dokumentation, manual och teknisk referens. |
| `mkdocs.yml` | MkDocs-navigation, tema och plugins. |

## Viktiga funktioner

- Import av `.docx` och detaljplan-JSON.
- Taggning av text, bild, diagram och tabell.
- Länkning mellan taggar och geometrier.
- Lokalt projektgalleri via IndexedDB.
- Export av originalfiler, taggad DOCX, geometri med motiv och `.pbproject`.
- Planbeskrivning v2.0-export med `omfattningar.xml` och compliance-kontroll.

## Licens

MIT
