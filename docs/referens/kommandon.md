# Kommandon

## Appen

Installera beroenden:

```powershell
npm install
```

Starta utvecklingsserver:

```powershell
npm run dev
```

Bygg appen:

```powershell
npm run build
```

Förhandsgranska produktionsbygget:

```powershell
npm run preview
```

## Dokumentationen

Installera dokumentationsberoenden:

```powershell
python -m pip install -r requirements-docs.txt
```

Starta MkDocs lokalt:

```powershell
mkdocs serve
```

Bygg dokumentationen strikt:

```powershell
mkdocs build --strict
```

Den byggda dokumentationen hamnar i `site/`, som inte versioneras.
