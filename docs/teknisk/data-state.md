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
| `AppConfig` | Projektkonfiguration, bland annat kartbakgrunder. |

## Persistens i webbläsaren

Projekt sparas i IndexedDB via `src/db/documentDb.ts`. Där sparas dokumentbytes, dokumentmodell, taggar, geometrier och konfiguration för snabb återöppning i samma webbläsare.

## Portabel persistens

`.pbproject` exporteras via `src/project/ProjectManager.ts`. Filen är en ZIP med originaldokument, projektmetadata, config och eventuell geometri-JSON.

## Undo och redo

Storen använder temporal state för ångra/gör om. UI:t erbjuder både knappar och kortkommandon.
