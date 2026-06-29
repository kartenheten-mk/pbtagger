# Datameny

Datamenyn i toppbaren samlar filoperationer och exportinställningar.

![Datamenyn med import och export](../assets/screenshots/datameny-export.png)

*Datamenyn samlar import, export, projektfil, konfiguration och exportinställningar. Bilden visar exportgruppen med tagg-ZIP.*

## Import

Importsektionen hanterar ersättning av dokument, import av geometri-JSON och import av `config.json`.

## Export

Exportsektionen är uppdelad i:

- originalfiler
- filer med taggar och motiv, inklusive tagg-ZIP för vidare databearbetning
- hela projektet

**Exportera taggar (.zip)** skapar en ZIP-fil med `tags.json`, en ren `geometries.geojson` och en `images/`-mapp för taggade bilder när bilddata finns. Det gör att taggdata, geometri och bildfiler kan hanteras tillsammans utan separata exporter. Geometrifilen innehåller feature-id, geometri och tomma `properties`; kopplingen till taggarna finns i `tags.json` via `geometryIds`.

## Konfiguration

Konfigurationssektionen exporterar och importerar `config.json`. Filen används för projektinställningar som bakgrundskartor.

## Exportinställningar

Exportinställningarna styr Planbeskrivning v2.0-export och metadata för `omfattningar.xml`.

![Metadata för Planbeskrivning v2.0-export](../assets/screenshots/planbeskrivning-metadata.png)

*Exportinställningarna innehåller metadata som används vid Planbeskrivning v2.0-export.*
