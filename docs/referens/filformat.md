# Filformat

## `.docx`

Word-dokumentet är källan för text, bilder, tabeller och export. Appen bevarar originalets ZIP-innehåll och skriver till relevanta OOXML-delar vid export.

## `.json`

Detaljplan-JSON används för geometrier. Original-JSON sparas så att den kan exporteras oförändrad eller med motiv.

## `.pbproject`

Projektfilen är en ZIP som innehåller:

| Fil | Innehåll |
| --- | --- |
| `document.docx` | Originaldokumentet. |
| `project.json` | Projektmetadata, taggar, geometrier och aktiv geometri. |
| `config.json` | Appkonfiguration. |
| `geometry_doc.json` | Originalgeometri, om en geometri-JSON har importerats. |

## `config.json`

Konfigurationsfilen innehåller appinställningar som kan flyttas mellan projekt. I nuläget gäller det framför allt kartkonfiguration.

## `omfattningar.xml`

Planbeskrivning v2.0-exporten skriver en custom XML-del i DOCX-filen. Den används för omfattningar, lägen, referenser och metadata enligt appens exportmodell.
