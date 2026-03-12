import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { getGeometryDoc } from '../geometry/geometryDb';
import { parseDocx } from '../docx/DocxParser';
import type { Tag, Geometry, GeometryDoc, DocModel } from '../types';

/**
 * The structure of the project metadata saved in project.json inside the .pbproject file
 */
export interface ProjectMetadata {
    version: number;
    fileName: string;
    tags: Tag[];
    geometries: Geometry[];
    activeGeometryDocId: string | null;
}

export interface ImportedProject {
    fileName: string;
    zipBuffer: ArrayBuffer;
    docModel: DocModel;
    tags: Tag[];
    geometries: Geometry[];
    activeGeometryDocId: string | null;
    geometryDoc: GeometryDoc | null;
}

export async function exportProject(
    fileName: string,
    zipBuffer: ArrayBuffer,
    tags: Tag[],
    geometries: Geometry[],
    activeGeometryDocId: string | null
): Promise<void> {
    const zip = new PizZip();

    // 1. Add the original .docx file binary
    zip.file('document.docx', zipBuffer);

    // 2. Add the project metadata (tags, geometries, active docs)
    const metadata: ProjectMetadata = {
        version: 1,
        fileName,
        tags,
        geometries,
        activeGeometryDocId,
    };
    zip.file('project.json', JSON.stringify(metadata, null, 2));

    // 3. Add the raw geometry document JSON if we have one active
    if (activeGeometryDocId) {
        const geoDoc = await getGeometryDoc(activeGeometryDocId);
        if (geoDoc) {
            zip.file('geometry_doc.json', JSON.stringify(geoDoc, null, 2));
        }
    }

    // 4. Generate the final zip file and trigger download
    const content = zip.generate({ type: 'blob' });
    const exportFileName = fileName.replace(/\.docx$/i, '') + '.pbproject';
    saveAs(content, exportFileName);
}

export async function importProject(file: File): Promise<ImportedProject> {
    const buffer = await file.arrayBuffer();
    const zip = new PizZip(buffer);

    // 1. Extract metadata
    const projectJsonFile = zip.file('project.json');
    if (!projectJsonFile) {
        throw new Error('Invalid project file: missing project.json');
    }
    const metadata: ProjectMetadata = JSON.parse(projectJsonFile.asText());

    if (metadata.version !== 1) {
        throw new Error(`Unsupported project version: ${metadata.version}`);
    }

    // 2. Extract .docx
    const docxFile = zip.file('document.docx');
    if (!docxFile) {
        throw new Error('Invalid project file: missing document.docx');
    }
    const docxBuffer = docxFile.asArrayBuffer();

    // 3. Parse the .docx to build the DocModel
    const { docModel } = await parseDocx(docxBuffer);

    // 4. Extract geometry doc if it exists
    let geometryDoc: GeometryDoc | null = null;
    const geoDocFile = zip.file('geometry_doc.json');
    if (geoDocFile) {
        geometryDoc = JSON.parse(geoDocFile.asText()) as GeometryDoc;
    }

    return {
        fileName: metadata.fileName,
        zipBuffer: docxBuffer,
        docModel,
        tags: metadata.tags,
        geometries: metadata.geometries,
        activeGeometryDocId: metadata.activeGeometryDocId,
        geometryDoc,
    };
}
