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

Exempel med en sparad WMS-bakgrund:

```json
{
  "version": 1,
  "map": {
    "activeBackgroundMapId": "kommun-wms",
    "backgroundMaps": [
      {
        "id": "kommun-wms",
        "type": "wms",
        "name": "Kommunens baskarta",
        "url": "https://example.se/wms",
        "layers": ["baskarta", "fastighetsgranser"]
      }
    ]
  }
}
```

| Fält | Beskrivning |
| --- | --- |
| `version` | Konfigurationsversion. Nuvarande version är `1`. |
| `map.activeBackgroundMapId` | `id` för vald WMS-bakgrund, eller `null` för OpenStreetMap. |
| `map.backgroundMaps` | Lista med sparade WMS-bakgrunder. |
| `id` | Stabilt internt id för bakgrundskartan. |
| `type` | Ska vara `wms`. |
| `name` | Namnet som visas i kartinställningarna. |
| `url` | WMS-adress som börjar med `http://` eller `https://`. |
| `layers` | Ett eller flera WMS-lagernamn. Det översta lagret i listan ritas överst i kartan. |

Det rekommenderade sättet att ändra kartkonfigurationen är via **Kartinställningar** i appen. Om `config.json` redigeras manuellt måste varje WMS-karta ha namn, adress och minst ett lager.

## `omfattningar.xml`

Planbeskrivning v2.0-exporten skriver en custom XML-del i DOCX-filen. Den används för omfattningar, lägen, referenser och metadata enligt appens exportmodell.
