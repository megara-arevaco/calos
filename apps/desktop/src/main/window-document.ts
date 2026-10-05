import { pathToFileURL } from "node:url";

export function windowDocument(
  isPackaged: boolean,
  rendererFile: string,
  developmentUrl?: string,
) {
  const url = !isPackaged ? developmentUrl : undefined;
  return { developmentUrl: url, trustedUrl: url ?? pathToFileURL(rendererFile).href };
}
