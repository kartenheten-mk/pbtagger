# DOCX och exportformat

DOCX hanteras som en ZIP-fil med OOXML-delar. Appen läser `word/document.xml`, bygger en intern modell och sparar originalbytes för export.

## Import

Importen gör tre saker:

1. Öppnar DOCX som ZIP med PizZip.
2. Parser XML med `@xmldom/xmldom`.
3. Bygger en `DocModel` för renderingen.

Importen kan också läsa befintliga taggmetadata och Planbeskrivning XML från custom XML-delar.

## Taggad DOCX-export

Vid export skapas en ny DOCX där taggade segment skrivs som OOXML-innehållskontroller och metadata skrivs till custom XML.

Exporten ska bevara övriga DOCX-delar, till exempel bilder, styles, headers, footers och themes.

## Bokmärken och innehållskontroller

Taggar kan representeras med:

- innehållskontroller (`w:sdt`)
- taggmetadata i custom XML
- bokmärken för stabila referenser

## Planbeskrivning XML

Den taggade DOCX-exporten inkluderar Planbeskrivning v2.0-data som `omfattningar.xml`. Exporten kan blockeras av validatorn om compliance-läget kräver det.
