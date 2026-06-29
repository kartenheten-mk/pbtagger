# Media och screenshots

Dokumentationen är förberedd för screenshots, GIF och MP4. Lägg media under `docs/assets/` med stabila filnamn så att filer kan bytas utan att ändra manualtexten.

## Rekommenderad struktur

```text
docs/assets/
├── screenshots/
├── gifs/
└── videos/
```

## Screenshots

Använd `.png` eller `.webp` för screenshots.

```markdown
![Startvy med projektgalleri](../assets/screenshots/startvy-projektgalleri.png)
```

### Aktuella manualbilder

| Fil | Används för |
| --- | --- |
| `startvy-projektgalleri.png` | Startvy med dokumentationslänk och lokala projekt. |
| `startvy-skapa-projekt-meny.png` | Meny för nytt projekt eller import av `.pbproject`. |
| `skapa-projekt-dialog.png` | Dialogen för nytt projekt. |
| `editor-oversikt.png` | Hela editorläget. |
| `sidopanel-visa-taggar.png` | Tagglista, filter, rensa alla taggar och geometriåtgärder. |
| `dokumentvy-taggmarkeringar.png` | Dokumentvy med taggmarkeringar. |
| `dokumentvy-sokning.png` | Sökning i dokumentet. |
| `egen-kategori-dialog-grupp.png` | Dialogen för egen grupp. |
| `egen-kategori-dialog-undergrupp.png` | Dialogen för egen undergrupp. |
| `karta-geometri.png` | Kartpanel med geometrier och filter. |
| `geometri-lankning.png` | Länkningsläge mellan tagg och geometri. |
| `kartinstallningar-wms.png` | Kartinställningar och WMS-formulär. |
| `datameny-export.png` | Data-menyn med import, export och tagg-ZIP. |
| `datameny-export-tagg-json.png` | Data-menyn med knappen för tagg-ZIP-export. |
| `planbeskrivning-exportkontroll.png` | Statuspopover för Planbeskrivning-export. |
| `planbeskrivning-metadata.png` | Metadata-panel för `omfattningar.xml`. |
| `startvy-tom.png` | Startvy när inga lokala projekt finns. |

## GIF

GIF fungerar med vanlig Markdown-bildsyntax.

```markdown
![Tagga text](../assets/gifs/tagga-text.gif)
```

## MP4

Markdown har inget standardiserat videoelement, men MkDocs tillåter HTML i Markdown. Använd:

```html
<video controls muted playsinline class="docs-video">
  <source src="../assets/videos/lanka-geometri.mp4" type="video/mp4">
  Din webbläsare kan inte spela upp videon.
</video>
```

## Namnkonvention

Använd korta namn som beskriver arbetsflödet:

- `skapa-projekt.png`
- `tagga-text.gif`
- `lanka-geometri.mp4`
- `exportera-projekt.png`

Undvik datum eller versionsnummer i filnamnet om media ska kunna ersättas över tid.
