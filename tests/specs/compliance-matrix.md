# Planbeskrivning v2.0 Compliance Matrix

This matrix maps normative requirements from:

- `tests/specs/Dataproduktspecifikation Planbeskrivning_v2.0.md`

to implementation and tests in this repository.

## Rules

| Requirement | Spec reference | Implementation | Test coverage | Status |
| --- | --- | --- | --- | --- |
| PLANB-001: Minst ett av geometri/objektreferens/planbestammelsereferens/planomrade ska finnas | Line 388 | `src/docx/PlanbeskrivningXmlBuilder.ts` (`buildLage`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-002: Motiv till reglering ska peka på planbestämmelse | Line 339 (concept), line 586 (example XML) | `src/docx/PlanbeskrivningXmlBuilder.ts` (`buildLage`, `validatePlanbeskrivning`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-003: identitet ska vara unik | Line 339 | `src/docx/PlanbeskrivningXmlBuilder.ts` (case-insensitive uniqueness in builder + validator) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-004: tema/grupp/undergrupp ska följa BFS 2020:8 | Line 369 | `src/docx/PlanbeskrivningXmlBuilder.ts` (`validatePlanbeskrivning`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-005: identitet format/regex | Line 339 | `src/docx/PlanbeskrivningXmlBuilder.ts` | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-006: direkt geometri prioriteras över indirekt | Line 390 | `src/docx/PlanbeskrivningXmlBuilder.ts` (`buildLage`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-007: objektreferens ska vara beständig identifierare | Line 392 | `src/docx/PlanbeskrivningXmlBuilder.ts` (`validatePlanbeskrivning`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |
| PLANB-008: exakt en indirekt referenstyp (objekt/planbest/planomrade) | Line 401 | `src/docx/PlanbeskrivningXmlBuilder.ts` (`buildLage`) | `tests/docx/PlanbeskrivningXmlBuilder.test.ts` | Implemented |

## Technical exchange requirements

| Requirement | Spec reference | Implementation | Status |
| --- | --- | --- | --- |
| Exchange in OOXML using `customXML` + bookmarks | Lines 504, 516-523 | `src/docx/DocxExporter.ts`, `src/docx/domUtils.ts` | Implemented |
| Geometri i GML 3.2.1 | Lines 24, 524 | `src/docx/PlanbeskrivningXmlBuilder.ts` | Implemented |
| Schema validation against planbeskrivning-2.0.xsd | Line 274 | XSD files vendored in `tests/specs/xsd/` | In progress |
| Compliant export should include Planbeskrivning XML | Annex F (`omfattningar.xml`) | `src/components/DataMenu.tsx` now always exports with Planbeskrivning options | Implemented |

## Notes

- Compliance export is now blocked when validator errors exist.
- Remaining work: wire the vendored XSD files into automated validation (tests and/or export-time gate).
