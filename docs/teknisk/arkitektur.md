# Arkitektur

Applikationen är ett React/Vite-projekt skrivet i TypeScript. Den centrala modellen är att original-DOCX behålls som ZIP-bytes samtidigt som appen bygger en separat dokumentmodell för visning och taggning.

## Lager

| Lager | Exempel | Ansvar |
| --- | --- | --- |
| UI | `src/components`, `src/editor`, `src/geometry` | React-komponenter, paneler och interaktion. |
| State | `src/store/useDocumentStore.ts` | Dokument, taggar, geometrier, urval, undo/redo och persistens. |
| DOCX | `src/docx` | Import, export, OOXML, custom XML och Planbeskrivning XML. |
| Geometri | `src/geometry` | Detaljplan-JSON, GML, kartvisning och geometri-länkning. |
| Persistens | `src/db`, `src/project` | IndexedDB och `.pbproject`. |

## Runtime-flöde

1. En DOCX läses in som ZIP.
2. `DocxParser` bygger `DocModel` och läser eventuella inbäddade taggar eller Planbeskrivning-data.
3. React-vyn renderar dokumentmodellen i TipTap.
4. Användaren skapar taggar och geometri-länkar i Zustand-storen.
5. Exporter bygger nya XML-delar utan att konvertera hela dokumentet fram och tillbaka.

## Designprincip

Appen undviker att göra DOCX till HTML och tillbaka. Den visuella dokumentvyn är ett arbetsgränssnitt, medan exporten skriver tillbaka metadata i OOXML-strukturen.
