# Karta och geometri

Kartpanelen bygger på OpenLayers och visar detaljplanegeometrier tillsammans med en bakgrundskarta.

## Panelens innehåll

Panelen består av:

- karta
- sök- och filterkontroller
- geometri-lista
- länkningsläge med bekräftelse
- maximerad kartvy
- kartinställningar

## Geometrikällor

Appen skiljer på geometrier från JSON och geometrier från DOCX GML. JSON-geometrier är den redigerbara källan för länkar. DOCX GML används för kontroll och för att visa vad som redan finns inbäddat.

## Överlappande objekt

När flera geometrier ligger under samma kartklick visas en väljare så användaren kan välja rätt objekt.
