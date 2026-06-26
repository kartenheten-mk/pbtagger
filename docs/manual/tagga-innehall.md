# Tagga innehåll

Taggning görs från dokumentvyn och sidopanelen. Dokumentet är skrivskyddat i appen; du markerar innehåll men redigerar inte själva texten.

## Tagga text

1. Markera text i dokumentet.
2. Sidopanelen växlar till **Tilldela tagg**.
3. Välj **Tema**.
4. Välj **Grupp**.
5. Välj eventuell **Undergrupp**.
6. Lägg till en notering om det behövs.
7. Klicka på **Tilldela tagg**.

Om markeringen sträcker sig över flera stycken skapas en sammanhängande tagg som behåller start- och slutposition i dokumentmodellen.

![Dokumentvy med taggmarkeringar](../assets/screenshots/dokumentvy-taggmarkeringar.png)

*Taggat innehåll markeras direkt i den skrivskyddade dokumentvyn.*

## Tagga bild, diagram eller tabell

Klicka på en bild, ett diagram eller en tabell i dokumentet. Sidopanelen visar objektet som markerat innehåll och du tilldelar kategori på samma sätt som för text.

Objekttaggar visas med en badge i dokumentvyn. Badgen kan användas för att välja taggen, länka geometri eller ta bort taggen.

## Söka kategori

I **Tilldela tagg** kan du söka efter kategori. Sökningen matchar tema, grupp, undergrupp och den sammansatta kategoritexten.

## Lägga till egen grupp eller undergrupp

I **Tilldela tagg** kan du klicka på plusknappen längst ner i sidopanelen för att skapa en egen kategori i projektet.

1. Välj om du vill skapa **Grupp** eller **Undergrupp**.
2. Välj befintligt **Tema**.
3. Välj **Grupp** om du skapar en undergrupp.
4. Skriv namn och kontrollera det föreslagna ID:t.
5. Klicka på **Spara**.

Den nya gruppen eller undergruppen väljs direkt och går att använda i taggning och sökning. Egna kategorier sparas i projektets `config.json` och följer med vid export/import av projekt eller konfiguration.

## Visa och filtrera taggar

Fliken **Visa taggar** listar alla taggar i dokumentordning. Du kan filtrera på tema och klicka på en tagg för att:

- markera den i dokumentet
- se kopplade geometrier
- starta geometri-länkning
- ta bort taggen

![Sidopanelen Visa taggar](../assets/screenshots/sidopanel-visa-taggar.png)

*Sidopanelen visar taggar, temafilter och geometriåtgärder i dokumentordning.*

## Dölja och visa taggmarkeringar

Ögonknappen i toppbaren växlar om alla taggmarkeringar visas i dokumentet. Om markeringarna är dolda visas fortfarande den valda taggen.

## Ångra och gör om

Toppbaren innehåller knappar för ångra och gör om. Kortkommandon stöds också:

- `Ctrl+Z` för ångra
- `Ctrl+Y` eller `Ctrl+Shift+Z` för gör om
