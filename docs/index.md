# Planbeskrivning Tagger

## Intro

<div class="intro-video-crop">
  <video autoplay muted playsinline controls class="docs-video">
    <source src="assets/videos/intro_pbtagger_v1.mp4" type="video/mp4">
    Din webbläsare kan inte spela upp videon.
  </video>
</div>

Planbeskrivning Tagger är ett webbverktyg för att läsa in planbeskrivningar i `.docx`, märka upp innehåll med taggar och koppla taggarna till geometrier från detaljplanedata. Dokumentationen här är uppdelad i två huvudspår:

- **Användarmanualen** beskriver praktiska arbetsflöden i gränssnittet.
- **Teknisk dokumentation** beskriver implementation, dataflöden och exportformat.

!!! note "Manual med screenshots"
    Användarmanualen innehåller aktuella screenshots för startvy, dokumentvy, sidopanel, kartpanel, Data-meny, Planbeskrivning-kontroll och vanliga felsökningslägen.

## Snabbstart för användare

1. Öppna appen och välj **Skapa projekt**.
2. Läs in en `.docx`-fil och, vid behov, en detaljplan-JSON.
3. Markera text, bild, diagram eller tabell i dokumentet.
4. Välj tema, grupp och eventuell undergrupp i sidopanelen.
5. Länka taggar till geometrier i kartpanelen.
6. Exportera taggat dokument, geometri med motiv eller hela projektet.

## Snabbstart för dokumentationen

Installera dokumentationsberoenden:

```powershell
python -m pip install -r requirements-docs.txt
```

Kör dokumentationen lokalt:

```powershell
mkdocs serve
```

Verifiera dokumentationen:

```powershell
mkdocs build --strict
```

## Viktiga begrepp

| Begrepp | Betydelse |
| --- | --- |
| Projekt | Appens arbetsyta med dokument, taggar, geometrier och inställningar. |
| `.pbproject` | Exporterad projektfil som kan öppnas igen i appen. |
| Tagg | En märkning av text, bild, diagram eller tabell med kategori och eventuell geometri. |
| Geometri | Objekt från detaljplan-JSON eller GML i importerad DOCX. |
| Planbeskrivning v2.0 | Specifik export med `omfattningar.xml` och compliance-kontroll. |
