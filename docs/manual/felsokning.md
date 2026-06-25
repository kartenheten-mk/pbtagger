# Felsökning

## Dokumentet går inte att läsa in

Kontrollera att filen är en giltig `.docx` och inte en äldre `.doc`-fil. Om dokumentet kommer från Word, testa att öppna och spara om det som `.docx`.

## Geometri-JSON går inte att importera

Kontrollera att filen är giltig JSON och följer det detaljplan-format som appens parser stödjer. Om projektet skapades ändå kan du importera geometri senare via **Data**.

## Taggar syns inte i dokumentet

Kontrollera ögonknappen i toppbaren. När taggar är dolda visas bara den valda taggen.

## Export av taggad DOCX blockeras

Öppna Planbeskrivning-statusen och kontrollera vilka fel som finns. Om du behöver skapa en fil trots fel kan du ändra exportinställningen från **Blockera vid fel** till **Tillåt med fel**.

## Länkade GML-geometrier går inte att avlänka

GML från importerad DOCX visas som skrivskyddad kontroll. Redigera geometri-länkar i JSON-läget genom att importera eller använda detaljplan-JSON.

## Sparade projekt saknas

Projektgalleriet bygger på webbläsarens IndexedDB. Projekt kan saknas om du använder en annan webbläsare, annan profil, inkognitoläge eller om webbläsardata har rensats. Exportera `.pbproject` för långsiktig lagring.

![Startvy utan sparade projekt](../assets/screenshots/startvy-tom.png)

*Om projektgalleriet är tomt kan du skapa ett nytt projekt eller importera en sparad `.pbproject`.*

## Kartbakgrund visas inte

Kontrollera att eventuell WMS-konfiguration har rätt URL och lager. Exportera `config.json` innan du byter miljö om bakgrundskartor behöver följa med.
