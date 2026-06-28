# Filformat

## `.docx`

Word-dokumentet är källan för text, bilder, tabeller och export. Appen bevarar originalets ZIP-innehåll och skriver till relevanta OOXML-delar vid export.

## `.json`

Detaljplan-JSON används för geometrier. Original-JSON sparas så att den kan exporteras oförändrad eller med motiv.

Appen kan också exportera taggar som en platt JSON-fil för vidare bearbetning i script eller databaser. Den exporten har `schemaVersion` `1` och innehåller taggdata, kategorier och länkad geometri som ren GeoJSON Geometry.

Exempel på en förkortad tagg-JSON-export:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-27T12:00:00.000Z",
  "sourceDocument": {
    "fileName": "Planbeskrivning.docx",
    "activeGeometryDocId": "plan-1"
  },
  "summary": {
    "tagCount": 1,
    "linkedGeometryCount": 1,
    "categories": [
      {
        "categoryId": "detaljplanens-syfte--syfte",
        "level": "grupp",
        "temaId": "detaljplanens-syfte",
        "temaName": "Detaljplanens syfte",
        "gruppId": "syfte",
        "gruppName": "Syfte",
        "undergruppId": null,
        "undergruppName": null,
        "custom": false,
        "tagCount": 1
      }
    ],
    "unknownCategoryIds": []
  },
  "tags": [
    {
      "uuid": "tag-1",
      "targetType": "text",
      "text": "Markerad text",
      "note": null,
      "createdAt": "2026-06-27T12:00:00.000Z",
      "paragraphIndex": 0,
      "startOffset": 10,
      "endParagraphIndex": 0,
      "endOffset": 24,
      "runId": null,
      "tableId": null,
      "categoryId": "detaljplanens-syfte--syfte",
      "categoryLevel": "grupp",
      "temaId": "detaljplanens-syfte",
      "temaName": "Detaljplanens syfte",
      "gruppId": "syfte",
      "gruppName": "Syfte",
      "undergruppId": null,
      "undergruppName": null,
      "customCategory": false,
      "geometryIds": ["geo-1"],
      "missingGeometryIds": [],
      "geometries": [
        {
          "type": "Point",
          "coordinates": [18.1, 59.3]
        }
      ]
    }
  ]
}
```

`geometries` innehåller bara GeoJSON Geometry-objekt. Råa properties från importerad detaljplan-JSON exporteras inte i tagg-JSON-filen.

## `.pbproject`

Projektfilen är en ZIP som innehåller:

| Fil | Innehåll |
| --- | --- |
| `document.docx` | Originaldokumentet. |
| `project.json` | Projektmetadata, taggar, geometrier och aktiv geometri. |
| `config.json` | Appkonfiguration. |
| `geometry_doc.json` | Originalgeometri, om en geometri-JSON har importerats. |

`project.json` och `config.json` har olika ansvar i projektfilen. `project.json` beskriver det aktuella arbetet: filnamn, taggar, geometrier och vilken geometri som är aktiv. `config.json` beskriver inställningarna runt arbetet: kartbakgrunder, vald WMS-karta och egna taggningskategorier.

Nyare `.pbproject`-filer innehåller `config.json`. Äldre projektfiler kan sakna den; då öppnas projektet med appens standardkonfiguration.

## `config.json`

Konfigurationsfilen innehåller appinställningar som kan flyttas mellan projekt. Den innehåller kartkonfiguration och egna taggningskategorier.

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
  },
  "categories": {
    "customGroups": [
      {
        "temaId": "beskrivning-av-detaljplanen",
        "id": "min-grupp",
        "name": "Min grupp",
        "undergrupper": [
          {
            "id": "min-undergrupp",
            "name": "Min undergrupp"
          }
        ]
      }
    ],
    "customUndergroups": [
      {
        "temaId": "genomforandefragor",
        "gruppId": "tekniska-fragor",
        "id": "drift",
        "name": "Drift"
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
| `categories.customGroups` | Egna grupper under befintliga teman. |
| `categories.customGroups[].temaId` | ID för temat som gruppen hör till. |
| `categories.customGroups[].id` | Stabilt grupp-ID. |
| `categories.customGroups[].name` | Gruppnamn som visas i appen. |
| `categories.customGroups[].undergrupper` | Egna undergrupper under den egna gruppen. |
| `categories.customUndergroups` | Egna undergrupper under befintliga eller importerade grupper. |
| `categories.customUndergroups[].temaId` | ID för temat som undergruppen hör till. |
| `categories.customUndergroups[].gruppId` | ID för gruppen som undergruppen hör till. |
| `categories.customUndergroups[].id` | Stabilt undergrupps-ID. |
| `categories.customUndergroups[].name` | Undergruppsnamn som visas i appen. |

Det rekommenderade sättet att ändra kartkonfiguration och egna kategorier är via appens gränssnitt. Om `config.json` redigeras manuellt måste varje WMS-karta ha namn, adress och minst ett lager. Egna kategorier måste ha `temaId`, `id` och `name`; undergrupper utanför `customGroups` måste även ha `gruppId`.

## `omfattningar.xml`

Planbeskrivning v2.0-exporten skriver en custom XML-del i DOCX-filen. Den används för omfattningar, lägen, referenser och metadata enligt appens exportmodell.
