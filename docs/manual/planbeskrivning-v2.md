# Planbeskrivning v2.0

Appen kan bädda in Planbeskrivning v2.0-data i den taggade DOCX-exporten. Exporten skapar eller uppdaterar en custom XML-del med `omfattningar.xml`.

## Statusindikator

Toppbaren visar en statusindikator för Planbeskrivning-exporten. Den hjälper dig att se om taggar och kopplingar uppfyller de krav som appen kontrollerar.

![Planbeskrivning exportkontroll](../assets/screenshots/planbeskrivning-exportkontroll.png)

*Exportkontrollen visar blockerande fel, varningar och informationsposter. Knappen **Visa tagg** markerar berörd tagg i dokumentet.*

Statusindikatorn kan visa:

| Status | Betydelse |
| --- | --- |
| Grön | Inga blockerande fel hittades. |
| Blå | Inga fel eller varningar, men det finns informationsposter. |
| Gul | Varningar finns. Export kan vara möjlig men bör granskas. |
| Röd | Möjliga exportfel finns. Export kan blockeras om kontrollen är aktiv. |

Klicka på indikatorn för att öppna listan. Om en rad har **Visa tagg** kan du gå direkt till berörd tagg i sidopanelen och dokumentet.

## Exportinställningar

I **Data** > **Exportinställningar** finns:

- **Planbeskrivning v2.0**: visar att `omfattningar.xml` alltid inkluderas vid taggad DOCX-export.
- **Blockera vid fel / Tillåt med fel**: styr om export ska stoppas när compliance-fel finns.
- **Redigera metadata**: öppnar inställningar för Planbeskrivning-metadata.

Rekommenderat läge är **Blockera vid fel** när du tar fram en leveransfil. Använd **Tillåt med fel** bara när du behöver en mellanexport för granskning och vet vilka fel som återstår.

## Metadata

Metadata-panelen innehåller:

![Metadata för Planbeskrivning v2.0](../assets/screenshots/planbeskrivning-metadata.png)

*Metadata-panelen styr värdena som skrivs till Planbeskrivning v2.0-exporten.*

| Fält | Beskrivning |
| --- | --- |
| Objektidentitet | UUID för planbeskrivningsobjektet. |
| Objektversion | Versionstal, normalt med start på `1`. |
| Version giltig från | Datum och tid för versionens giltighet. |
| Detaljplansreferens | UUID till detaljplanen, ofta autoifyllt från geometriimporten. |
| Arkividentitet, kommun | Kommunens diarienummer eller arkivreferens. |
| Programvara | Skrivskyddad information om appen. |

### Redigera metadata

1. Öppna **Data**.
2. Gå till **Exportinställningar**.
3. Klicka på **Redigera metadata**.
4. Kontrollera objektidentitet och detaljplansreferens.
5. Fyll i arkividentitet om kommunen använder den.
6. Klicka på **Spara**.

Använd **Nytt UUID** om planbeskrivningen ska få en ny objektidentitet. Använd **Återställ standardvärden** om du vill börja om med nya standardvärden baserade på projektet.

!!! warning "Kontrollera UUID-format"
    Fälten för objektidentitet och detaljplansreferens måste vara giltiga UUID om de är ifyllda. Panelen visar fel direkt vid spara om formatet inte stämmer.

## Geometri från DOCX

När en DOCX redan innehåller Planbeskrivning XML kan appen läsa ut GML-geometrier. De visas i kartpanelen som dokumentkontroll och kan speglas mot taggar, men direkta länkar redigeras i JSON-läget.

GML från DOCX används främst för att kontrollera vad som redan finns inbäddat i dokumentet. Om du ska ändra länkar och exportera geometri med motiv behöver du importera detaljplan-JSON.

## Compliance-läge

Med **Blockera vid fel** stoppas export om appens validering hittar fel. Med **Tillåt med fel** kan exporten genomföras även när fel finns, men resultatet bör kontrolleras extra noggrant.

## Kontroll före leverans

Gör gärna denna kontroll innan du exporterar taggad DOCX:

1. Öppna statusindikatorn i toppbaren.
2. Åtgärda alla röda fel.
3. Läs igenom varningar och informationsposter.
4. Klicka **Visa tagg** för varje rad som behöver granskas.
5. Kontrollera metadata i Data-menyn.
6. Exportera taggad DOCX.
7. Öppna den exporterade filen i Word och kontrollera att dokumentet går att öppna utan reparationsvarning.
