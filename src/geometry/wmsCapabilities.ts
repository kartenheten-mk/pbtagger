export interface WmsCapabilityLayer {
  name: string;
  title: string;
  abstract?: string;
}

function directChildElements(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function directChildText(element: Element, localName: string): string {
  return directChildElements(element, localName)[0]?.textContent?.trim() ?? '';
}

function hasParserError(document: Document): boolean {
  return document.getElementsByTagName('parsererror').length > 0;
}

function collectNamedLayers(
  layerElement: Element,
  layers: WmsCapabilityLayer[],
  seenNames: Set<string>
) {
  const name = directChildText(layerElement, 'Name');
  const title = directChildText(layerElement, 'Title');
  const abstract = directChildText(layerElement, 'Abstract');

  if (name && !seenNames.has(name)) {
    seenNames.add(name);
    layers.push({
      name,
      title: title || name,
      ...(abstract ? { abstract } : {}),
    });
  }

  for (const childLayer of directChildElements(layerElement, 'Layer')) {
    collectNamedLayers(childLayer, layers, seenNames);
  }
}

function getRootLayerElements(document: Document): Element[] {
  const root = document.documentElement;
  if (!root) return [];

  const capability = directChildElements(root, 'Capability')[0];
  if (capability) {
    return directChildElements(capability, 'Layer');
  }

  return root.localName === 'Layer' ? [root] : directChildElements(root, 'Layer');
}

export function parseWmsCapabilitiesXml(xml: string): WmsCapabilityLayer[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');

  if (hasParserError(document)) {
    throw new Error('WMS GetCapabilities-svaret kunde inte tolkas som XML.');
  }

  const layers: WmsCapabilityLayer[] = [];
  const seenNames = new Set<string>();

  for (const rootLayer of getRootLayerElements(document)) {
    collectNamedLayers(rootLayer, layers, seenNames);
  }

  return layers;
}

export function buildWmsCapabilitiesUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());

  for (const key of Array.from(parsed.searchParams.keys())) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'service' || normalizedKey === 'request') {
      parsed.searchParams.delete(key);
    }
  }

  parsed.searchParams.set('SERVICE', 'WMS');
  parsed.searchParams.set('REQUEST', 'GetCapabilities');

  return parsed.toString();
}

export async function fetchWmsCapabilities(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<WmsCapabilityLayer[]> {
  const capabilitiesUrl = buildWmsCapabilitiesUrl(url);
  const response = await fetchImpl(capabilitiesUrl, {
    headers: {
      Accept: 'application/xml,text/xml,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`WMS-servern svarade med HTTP ${response.status}.`);
  }

  return parseWmsCapabilitiesXml(await response.text());
}