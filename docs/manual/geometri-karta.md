# Geometri och karta

Kartpanelen visar geometrier från importerad detaljplan-JSON eller från Planbeskrivning GML i en importerad DOCX. Panelen används både för kontroll och för att länka taggar till geometrier.

## Importera geometri

Geometri kan importeras när projektet skapas eller senare via **Data** > **Importera geometri (.json)**.

Den importerade JSON-filen sparas som ett geometri-dokument. Appen behåller originalformatet för att kunna exportera samma geometri igen.

## Lägen i kartpanelen

Kartpanelen kan visa:

- JSON-geometrier från importerad detaljplan-JSON.
- GML-geometrier som hittats i en importerad DOCX med Planbeskrivning XML.

När JSON-geometrier finns används de som huvudkälla för redigerbara länkar. GML-lagret fungerar främst som kontroll av det som finns inbäddat i dokumentet.

## Söka och filtrera geometrier

Geometrilistan kan filtreras på:

- geometri- eller objekttyp
- taggad eller otaggad status
- fritext i namn, typ, kategori och bestämmelseformulering

Klick i listan markerar motsvarande objekt på kartan. Klick i kartan markerar motsvarande rad i listan.

## Länka tagg till geometri

1. Gå till **Visa taggar** i sidopanelen.
2. Klicka på länkknappen för en tagg.
3. Kartpanelen går in i länkningsläge.
4. Kryssa i en eller flera geometrier i listan eller klicka på objekt i kartan.
5. Klicka på **Länka** för att spara kopplingarna.

En tagg kan kopplas till flera geometrier. Vid länkning redigeras JSON-kopplingar. GML-kopplingar som importerats från DOCX visas för kontroll men hanteras som skrivskyddade.

## Maximera karta

Kartpanelen kan visas större i ett modal-läge. Det är användbart när geometrier överlappar eller när du vill göra flera länkar med mer kartutrymme.

## Bakgrundskartor

Bakgrundskartor hanteras i kartinställningarna och sparas i appens `config.json`. Standardläget använder inbyggd OpenStreetMap-bakgrund om ingen WMS-bakgrund är vald.
