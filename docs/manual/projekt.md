# Skapa och öppna projekt

Startvyn samlar projektåtgärder och tidigare sparade projekt. Ett projekt består av den inlästa Word-filen, taggar, geometrier, kartinställningar och exportmetadata.

![Startvy med projektgalleri](../assets/screenshots/startvy-projektgalleri.png)

*Startvyn samlar nya projekt, importerade projekt och lokalt sparade projekt.*

## Skapa nytt projekt

1. Klicka på **Skapa projekt**.
2. Välj **Skapa nytt projekt** i menyn.
3. Ange ett projektnamn om du vill. Om fältet lämnas tomt används `.docx`-filens namn.
4. Välj en `.docx`-fil. Den är obligatorisk.
5. Välj en geometri-JSON om du vill läsa in geometrier direkt.
6. Klicka på **Skapa projekt**.

När projektet skapas läser appen dokumentet, bygger dokumentvyn och sparar projektet lokalt i webbläsarens IndexedDB.

![Menyn för att skapa eller importera projekt](../assets/screenshots/startvy-skapa-projekt-meny.png)

*Projektmenyn låter dig välja mellan nytt projekt och import av `.pbproject`.*

## Importera existerande projekt

1. Klicka på **Skapa projekt**.
2. Välj **Importera existerande projekt**.
3. Välj en `.pbproject`-fil.

En `.pbproject` innehåller dokumentet, taggar, geometrier, aktiv geometri och appkonfiguration. Den är avsedd för att flytta eller arkivera ett pågående arbete.

## Öppna sparat projekt

Tidigare projekt visas i **Projektgalleri** på startvyn. Klicka på ett projektkort för att öppna det.

Projektkortet visar projektnamn, uppdateringstid och antal taggar. När du hovrar över kortet visas mer statistik, bland annat antal geometrier.

## Ta bort projekt

Klicka på papperskorgen på ett projektkort och bekräfta borttagningen. Åtgärden tar bort den lokala kopian från webbläsaren.

!!! warning "Exportera innan du rensar"
    Om projektet behöver sparas utanför webbläsaren, exportera först hela projektet som `.pbproject`.
