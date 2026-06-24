# Teststrategi

Projektet använder Vitest och React Testing Library för en kombination av rena enhetstester och komponenttester.

## Testområden

| Område | Exempel |
| --- | --- |
| DOCX | Parser, exporter, XML-builder, importproblem och bokmärken. |
| Geometri | Detaljplan-parser, GML-gruppering, kartläge och motivexport. |
| UI | Startvy, responsiv layout, sidopanel, datameny och dokumentvy. |
| Projekt | `.pbproject` export/import och config-hantering. |
| Config | Normalisering och validering av appkonfiguration. |

## Rekommenderade kontroller

Kör hela appens build:

```powershell
npm run build
```

Kör relevanta tester vid ändringar:

```powershell
npm exec vitest run
```

Verifiera dokumentationen:

```powershell
mkdocs build --strict
```

## När testytan bör växa

Lägg till eller bredda tester när ändringar påverkar exportformat, dataimport, state-persistens, geometri-länkning eller användarflöden som binder ihop flera paneler.
