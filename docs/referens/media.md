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
