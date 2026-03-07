import PizZip from 'pizzip';
import { CUSTOM_XML_REL_TYPE, CUSTOM_XML_CONTENT_TYPE } from './ContentControlBuilder';

export const CUSTOM_XML_RELS_PATH = 'customXml/_rels/item1.xml.rels';
export const DOC_RELS_PATH = 'word/_rels/document.xml.rels';
export const CONTENT_TYPES_PATH = '[Content_Types].xml';

export function ensureCustomXmlRels(zip: PizZip): void {
  const relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
  if (!zip.file(CUSTOM_XML_RELS_PATH)) {
    zip.file(CUSTOM_XML_RELS_PATH, relsContent);
  }
}

export function updateDocumentRels(zip: PizZip): void {
  const relsFile = zip.file(DOC_RELS_PATH);
  if (!relsFile) return;

  let relsXml = relsFile.asText();

  // Check if relationship already exists
  if (relsXml.includes('../customXml/item1.xml')) return;

  // Generate a new relationship ID
  const relId = 'rIdPbTagging1';

  const newRel = `<Relationship Id="${relId}" Type="${CUSTOM_XML_REL_TYPE}" Target="../customXml/item1.xml"/>`;

  // Insert before </Relationships>
  relsXml = relsXml.replace('</Relationships>', `  ${newRel}\n</Relationships>`);
  zip.file(DOC_RELS_PATH, relsXml);
}

export function updateContentTypes(zip: PizZip): void {
  const ctFile = zip.file(CONTENT_TYPES_PATH);
  if (!ctFile) return;

  let ctXml = ctFile.asText();

  // Add Override for item1.xml if not present
  if (!ctXml.includes('/customXml/item1.xml')) {
    const override = `<Override PartName="/customXml/item1.xml" ContentType="${CUSTOM_XML_CONTENT_TYPE}"/>`;
    ctXml = ctXml.replace('</Types>', `  ${override}\n</Types>`);
  }

  // Add Override for itemProps1.xml if not present
  if (!ctXml.includes('/customXml/itemProps1.xml')) {
    const propsOverride = `<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`;
    ctXml = ctXml.replace('</Types>', `  ${propsOverride}\n</Types>`);
  }

  zip.file(CONTENT_TYPES_PATH, ctXml);
}
