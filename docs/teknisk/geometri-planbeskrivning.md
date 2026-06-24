# Geometri och Planbeskrivning XML

Geometrier kan komma från detaljplan-JSON eller från GML inbäddad i en DOCX. Appen håller isär källorna för att kunna skilja redigerbara länkar från skrivskyddad dokumentkontroll.

## Detaljplan-JSON

Importerad JSON parsas till interna `Geometry`-objekt men original-JSON sparas. Det gör att appen kan exportera originalgeometri eller en variant där motiv skrivs in.

## DOCX GML

När en DOCX innehåller Planbeskrivning XML kan GML-geometrier extraheras och visas i kartpanelen. De används för att kontrollera vad dokumentet redan innehåller.

## Speglade länkar

Appen kan visa speglade länkar mellan JSON-länkar och DOCX GML när identiteter matchar. Syftet är att hjälpa användaren se relationen mellan aktiv arbetsdata och inbäddad dokumentdata.

## Motivexport

Geometri-JSON med motiv bygger på kopplingen mellan taggar och planbestämmelser. Om flera omfattningar eller ofullständiga länkar inte kan representeras i målformatet kan exporten stoppas.
