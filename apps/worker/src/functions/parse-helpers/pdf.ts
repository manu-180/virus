import pdfParse from 'pdf-parse';

/**
 * Extract plain text from a PDF blob.
 *
 * pdf-parse expects a Buffer, so we materialize the blob fully in memory.
 * That's fine for project-info / patterns docs which are at most a few MB;
 * if we ever stream giant PDFs through this, swap for a streaming parser.
 *
 * Returns `text` (newline-separated extracted text) and `pageCount`.
 */
export async function extractFromPdf(blob: Blob): Promise<{ text: string; pageCount: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  try {
    const result = await pdfParse(buffer);
    return { text: result.text ?? '', pageCount: result.numpages ?? 0 };
  } catch (err) {
    throw new Error(`pdf_extract_failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
