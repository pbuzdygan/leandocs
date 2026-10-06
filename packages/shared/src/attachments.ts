/** Attachments are ordinary files in the document's sibling `.assets` directory. */
export interface AttachmentDto {
  name: string;
  size: number;
  mime: string;
  image: boolean;
  /** Relative Markdown URL, portable together with the document. */
  markdownUrl: string;
  /** Stable application URL, resolved by document id. */
  url: string;
}
export interface AttachmentsResponse {
  items: AttachmentDto[];
}

/** Encode a single path segment, including punctuation reserved by Markdown and RFC 5987. */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
