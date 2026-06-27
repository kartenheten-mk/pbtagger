# Import och export

Alla import- och exportåtgärder i editorläget finns i toppbarens **Data**-meny.

![Datamenyn med import och export](../assets/screenshots/datameny-export.png)

*Datamenyn samlar import, export, projektfil, konfiguration och exportinställningar.*

## Öppna och stäng Data-menyn

1. Öppna ett projekt.
2. Klicka på **Data** i toppbaren.
3. Välj en åtgärd i menyn.
4. Stäng menyn med krysset, `Escape` eller genom att klicka utanför den.

Efter en lyckad åtgärd visas en grön statusruta uppe till höger. Vid fel visas en röd statusruta med feltext. Felrutan ligger kvar längre så att du hinner läsa eller kopiera meddelandet.

## Importera

| Åtgärd | Resultat |
| --- | --- |
| **Ersätt dokument (.docx)** | Byter dokument i projektet och försöker behålla befintliga taggar och geometri-länkar. |
| **Importera geometri (.json)** | Läser in detaljplan-JSON och visar geometrier i kartpanelen. |
| **Importera config.json** | Ersätter hela projektets appkonfiguration. |

När ett dokument ersätts läser appen även eventuell Planbeskrivning XML/GML från den nya DOCX-filen.

### Ersätt dokument

Använd **Ersätt dokument (.docx)** när Word-filen har justerats men du vill fortsätta i samma projekt.

1. Välj åtgärden i Data-menyn.
2. Välj en ny `.docx`.
3. Bekräfta att du vill ersätta dokumentet.
4. Kontrollera taggmarkeringarna i dokumentvyn.
5. Kontrollera geometri-länkarna i sidopanelen och kartpanelen.

Appen försöker behålla befintliga taggar. Om den nya DOCX-filen innehåller egna inbäddade taggar används dessa i stället. Om den nya DOCX-filen innehåller Planbeskrivning XML återställs metadata och GML-geometrier från den filen.

### Importera geometri

**Importera geometri (.json)** läser in detaljplan-JSON i projektet. Efter import ska du kontrollera att:

- kartpanelen visar rätt detaljplan
- geometriantalet verkar rimligt
- filterchips för geometrityper visas
- Planbeskrivning-metadata har rätt detaljplansreferens om den kan hämtas från geometrin

### Importera config

**Importera config.json** ersätter hela projektets appkonfiguration, framför allt kartinställningar och egna kategorier. Använd det när du vill flytta över allt som ligger i `config.json` från ett annat projekt.

Om du bara vill importera en del av filen kan du göra det nära arbetsflödet:

- I **Tilldela tagg** kan du importera bara egna taggkategorier.
- I **Kartinställningar** kan du importera bara WMS-inställningar.

## Exportera original

| Åtgärd | Resultat |
| --- | --- |
| **Exportera originaldokument (.docx)** | Laddar ner den inlästa Word-filen utan nya taggar. |
| **Exportera originalgeometri (.json)** | Laddar ner geometri-dokumentet i originalformat. |

## Exportera med taggar och motiv

| Åtgärd | Resultat |
| --- | --- |
| **Exportera taggat dokument (.docx)** | Skapar en DOCX med innehållskontroller, bokmärken, taggmetadata och Planbeskrivning v2.0-data. |
| **Exportera geometri med motiv (.json)** | Skapar en kopia av geometri-JSON där länkade motiv skrivs in i planbestämmelser. |

Export av taggad DOCX kan blockeras om Planbeskrivning v2.0-kontrollen hittar fel och inställningen **Blockera vid fel** är aktiv.

### När exportknappar är inaktiva

Vissa åtgärder är inaktiva tills projektet har rätt underlag:

| Knapp | Kräver |
| --- | --- |
| Exportera originaldokument | Ett inläst DOCX-dokument. |
| Exportera originalgeometri | Importerad geometri-JSON. |
| Exportera taggat dokument | Minst en tagg. |
| Exportera geometri med motiv | Importerad geometri-JSON. |

Håll muspekaren över en inaktiv knapp för att se varför den inte kan användas.

### Exportera taggad DOCX

Den taggade DOCX-exporten skriver tillbaka taggar som innehållskontroller och bokmärken. Den inkluderar även Planbeskrivning v2.0-data i `omfattningar.xml`.

Kontrollera före export:

1. Taggarna ligger på rätt innehåll.
2. Geometri-länkarna är klara för de taggar som behöver motiv.
3. Planbeskrivning exportkontroll saknar blockerande fel.
4. Metadata är ifylld under **Exportinställningar** > **Redigera metadata**.

### Exportera geometri med motiv

Denna export skapar en kopia av geometri-JSON där motiv från länkade taggar skrivs in på planbestämmelser. Originalgeometrin i projektet ändras inte.

## Exportera projekt

**Exportera hela projektet (.pbproject)** laddar ner en ZIP-baserad projektfil som innehåller:

- `document.docx`
- `project.json`
- `config.json`
- `geometry_doc.json`, om geometri har importerats

Använd `.pbproject` när du vill arkivera arbetet eller flytta det till en annan webbläsare eller dator.

`.pbproject` är det säkraste formatet för pågående arbete eftersom det innehåller både dokument, taggar, geometri och konfiguration.

## Exportera och importera config

`config.json` innehåller appens projektkonfiguration, framför allt kartinställningar, sparade WMS-bakgrunder och egna taggkategorier. Den kan exporteras separat och importeras i ett annat projekt. Import via Data-menyn ersätter hela konfigurationen; delimport i sidopanelen eller kartinställningarna ersätter bara vald del.

## Exportinställningar

Längst ner i Data-menyn finns **Exportinställningar**. Där kan du:

- se att Planbeskrivning v2.0 inkluderas i taggad DOCX-export
- växla mellan **Blockera vid fel** och **Tillåt med fel**
- öppna metadata-panelen för `omfattningar.xml`

Se [Planbeskrivning v2.0](planbeskrivning-v2.md) för detaljer om statusindikatorn, metadata och compliance.
