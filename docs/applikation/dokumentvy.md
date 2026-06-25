# Dokumentvy

Dokumentvyn renderar DOCX-innehållet som en skrivskyddad TipTap/ProseMirror-vy. Den ska låta användaren markera innehåll utan att riskera att ändra originaldokumentet.

## Innehåll som visas

Vyn hanterar:

- stycken och rubriker
- tabeller
- bilder
- diagramplatshållare
- innehållsförtecknings- och rubriklayout
- taggmarkeringar och objektbadges

![Dokumentvy med taggmarkeringar](../assets/screenshots/dokumentvy-taggmarkeringar.png)

*Dokumentvyn visar taggmarkeringar direkt i det importerade DOCX-innehållet.*

## Markeringar

När användaren markerar text beräknar appen positionen i dokumentmodellen. Vid klick på bild, diagram eller tabell skapas en objektmarkering som kan taggas.

## Sök

Dokumentvyn innehåller en sökfunktion som markerar träffar och låter användaren navigera mellan dem utan att flytta hela applikationslayouten.
