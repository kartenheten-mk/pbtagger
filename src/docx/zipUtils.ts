import PizZip from 'pizzip';
import { CUSTOM_XML_REL_TYPE, CUSTOM_XML_CONTENT_TYPE, CUSTOM_XML_NS } from './ContentControlBuilder';
import { PLANBESKRIVNING_NS } from './PlanbeskrivningXmlBuilder';

export const DOC_RELS_PATH = 'word/_rels/document.xml.rels';
export const CONTENT_TYPES_PATH = '[Content_Types].xml';

/**
 * Scan all customXml/item*.xml files in the ZIP and return the path of the
 * one that belongs to us (contains our tagging namespace).
 * Returns null if our part doesn't exist yet.
 */
export function findOurCustomXmlPath(zip: PizZip): string | null {
  const candidates = Object.keys(zip.files)
    .filter((name) => /^customXml\/item\d+\.xml$/.test(name))
    .sort(); // process in stable order: item1, item2, item3...

  for (const path of candidates) {
    const file = zip.file(path);
    if (!file) continue;
    try {
      if (file.asText().includes(CUSTOM_XML_NS)) return path;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Return the item number embedded in a customXml path, e.g. "customXml/item3.xml" → 3.
 */
export function itemNumberFromPath(path: string): number {
  const m = path.match(/item(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Find the existing customXml item that holds our tag data, or allocate the
 * next available item number if none exists yet.
 */
export function resolveCustomXmlSlot(zip: PizZip): {
  itemPath: string;
  itemNumber: number;
  propsPath: string;
  relsPath: string;
} {
  const existing = findOurCustomXmlPath(zip);
  if (existing) {
    const num = itemNumberFromPath(existing);
    return {
      itemPath: existing,
      itemNumber: num,
      propsPath: `customXml/itemProps${num}.xml`,
      relsPath: `customXml/_rels/item${num}.xml.rels`,
    };
  }

  // No existing item — pick the next available slot
  const existingNums = Object.keys(zip.files)
    .filter((name) => /^customXml\/item\d+\.xml$/.test(name))
    .map((name) => {
      const m = name.match(/item(\d+)\.xml$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);

  const nextNum =
    existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

  return {
    itemPath: `customXml/item${nextNum}.xml`,
    itemNumber: nextNum,
    propsPath: `customXml/itemProps${nextNum}.xml`,
    relsPath: `customXml/_rels/item${nextNum}.xml.rels`,
  };
}

/**
 * Ensure the customXml/_rels/item{N}.xml.rels file exists for our item.
 */
export function ensureCustomXmlRels(zip: PizZip, relsPath: string, itemNumber: number): void {
  if (zip.file(relsPath)) return; // already present

  const relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${itemNumber}.xml"/>
</Relationships>`;
  zip.file(relsPath, relsContent);
}

/**
 * Ensure word/_rels/document.xml.rels contains a relationship pointing at our
 * customXml item.
 */
export function updateDocumentRels(zip: PizZip, itemPath: string): void {
  const relsFile = zip.file(DOC_RELS_PATH);
  if (!relsFile) return;

  let relsXml = relsFile.asText();

  // Check if a relationship to this item already exists
  if (relsXml.includes(`../${itemPath}`)) return;

  // Also remove any stale relationship that points to a customXml item at a
  // different slot which still has our namespace (shouldn't happen, but be safe).
  const relId = 'rIdPbTagging1';
  if (!relsXml.includes(relId)) {
    const newRel = `<Relationship Id="${relId}" Type="${CUSTOM_XML_REL_TYPE}" Target="../${itemPath}"/>`;
    relsXml = relsXml.replace('</Relationships>', `  ${newRel}\n</Relationships>`);
    zip.file(DOC_RELS_PATH, relsXml);
  }
}

// ─── Planbeskrivning XML slot ─────────────────────────────────────────────────

/** Store-item GUID used for the Planbeskrivning custom XML part (braces omitted) */
export const PLANBESKRIVNING_STORE_ITEM_ID = 'B2C3D4E5-F6A7-8901-BCDE-F12345678901';

/**
 * Scan customXml/item*.xml files and return the path of the one that
 * contains our Planbeskrivning namespace.
 */
export function findPlanbeskrivningXmlPath(zip: PizZip): string | null {
  const candidates = Object.keys(zip.files)
    .filter((name) => /^customXml\/item\d+\.xml$/.test(name))
    .sort();

  for (const path of candidates) {
    const file = zip.file(path);
    if (!file) continue;
    try {
      if (file.asText().includes(PLANBESKRIVNING_NS)) return path;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Resolve the customXml slot for the Planbeskrivning XML, avoiding the slot
 * already claimed by the tag-metadata item (identified by `excludeItemNumber`).
 */
export function resolvePlanbeskrivningSlot(
  zip: PizZip,
  excludeItemNumber: number
): {
  itemPath: string;
  itemNumber: number;
  propsPath: string;
  relsPath: string;
} {
  // Check if there is already an existing Planbeskrivning part
  const existing = findPlanbeskrivningXmlPath(zip);
  if (existing) {
    const num = itemNumberFromPath(existing);
    return {
      itemPath: existing,
      itemNumber: num,
      propsPath: `customXml/itemProps${num}.xml`,
      relsPath: `customXml/_rels/item${num}.xml.rels`,
    };
  }

  // Allocate next available slot, skipping the tag-metadata slot
  const existingNums = Object.keys(zip.files)
    .filter((name) => /^customXml\/item\d+\.xml$/.test(name))
    .map((name) => {
      const m = name.match(/item(\d+)\.xml$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);

  // Start from max+1 and skip the excluded number
  let nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  if (nextNum === excludeItemNumber) nextNum++;

  return {
    itemPath: `customXml/item${nextNum}.xml`,
    itemNumber: nextNum,
    propsPath: `customXml/itemProps${nextNum}.xml`,
    relsPath: `customXml/_rels/item${nextNum}.xml.rels`,
  };
}

/**
 * Build the itemProps XML for the Planbeskrivning custom XML part.
 */
export function buildPlanbeskrivningItemProps(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ds:datastoreItem ds:itemID="{${PLANBESKRIVNING_STORE_ITEM_ID}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">
  <ds:schemaRefs>
    <ds:schemaRef ds:uri="${PLANBESKRIVNING_NS}"/>
  </ds:schemaRefs>
</ds:datastoreItem>`;
}

/**
 * Add a Relationship entry in word/_rels/document.xml.rels for the
 * Planbeskrivning custom XML part, using a dedicated rel ID.
 */
export function updateDocumentRelsForPlanbeskrivning(
  zip: PizZip,
  itemPath: string
): void {
  const relsFile = zip.file(DOC_RELS_PATH);
  if (!relsFile) return;

  let relsXml = relsFile.asText();
  if (relsXml.includes(`../${itemPath}`)) return;

  const relId = 'rIdPbPlanbeskrivning1';
  if (!relsXml.includes(relId)) {
    const newRel = `<Relationship Id="${relId}" Type="${CUSTOM_XML_REL_TYPE}" Target="../${itemPath}"/>`;
    relsXml = relsXml.replace('</Relationships>', `  ${newRel}\n</Relationships>`);
    zip.file(DOC_RELS_PATH, relsXml);
  }
}

// ─── Content_Types helpers ────────────────────────────────────────────────────

/**
 * Ensure [Content_Types].xml has Override entries for our custom XML item
 * and its props file.
 */
export function updateContentTypes(
  zip: PizZip,
  itemPath: string,
  propsPath: string
): void {
  const ctFile = zip.file(CONTENT_TYPES_PATH);
  if (!ctFile) return;

  let ctXml = ctFile.asText();
  let changed = false;

  if (!ctXml.includes(`/${itemPath}`)) {
    const override = `<Override PartName="/${itemPath}" ContentType="${CUSTOM_XML_CONTENT_TYPE}"/>`;
    ctXml = ctXml.replace('</Types>', `  ${override}\n</Types>`);
    changed = true;
  }

  if (!ctXml.includes(`/${propsPath}`)) {
    const propsOverride = `<Override PartName="/${propsPath}" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`;
    ctXml = ctXml.replace('</Types>', `  ${propsOverride}\n</Types>`);
    changed = true;
  }

  if (changed) zip.file(CONTENT_TYPES_PATH, ctXml);
}
