# Data och state

Appens state finns huvudsakligen i Zustand-storen. Storen samlar dokument, taggar, geometrier, aktiv geometri, Planbeskrivning-metadata och appkonfiguration.

## Viktiga datatyper

| Typ | Beskrivning |
| --- | --- |
| `DocModel` | Intern modell av stycken, tabeller och körningar från DOCX. |
| `Tag` | Kategori, måltyp, dokumentposition, geometri-länkar och notering. |
| `Geometry` | Intern representation av punkt, linje eller polygon. |
| `GeometryDoc` | Original-JSON och metadata för importerad detaljplan. |
| `PlanbeskrivningConfig` | Metadata för `omfattningar.xml`. |
| `AppConfig` | Projektkonfiguration, bland annat kartbakgrunder och egna kategorier. |

## Kategorier

Den officiella kategorihierarkin ligger i `src/data/categories.json`. Egna grupper och undergrupper sparas separat i `AppConfig.categories` och slås ihop med den officiella hierarkin vid körning.

Sammanslagningen ger ett aktuellt `Tema[]` och ett utplattat `Category[]` som används av sidopanel, dokumentvy, sökning och Planbeskrivning-export. Det gör att egna kategorier beter sig som vanliga kategorier i appen utan att den inbyggda `categories.json` ändras.

## Persistens i webbläsaren

Projekt sparas i IndexedDB via `src/db/documentDb.ts`. Där sparas dokumentbytes, dokumentmodell, taggar, geometrier och konfiguration för snabb återöppning i samma webbläsare.

## Portabel persistens

`.pbproject` exporteras via `src/project/ProjectManager.ts`. Filen är en ZIP med originaldokument, projektmetadata, config och eventuell geometri-JSON.

`config.json` innehåller `AppConfig`, inklusive egna kategorier. Vid import normaliseras konfigurationen så äldre projekt utan `categories` får tomma egna kategorilistor.

## Exportvalidering

Planbeskrivning-validering och DOCX-export använder den sammanslagna kategorilistan från aktuell app-state. Det betyder att taggar med egna kategorier kan valideras och skrivas till `omfattningar.xml` när kategorierna finns i projektets `config.json`.

## Undo och redo

Storen använder temporal state för ångra/gör om. UI:t erbjuder både knappar och kortkommandon.
