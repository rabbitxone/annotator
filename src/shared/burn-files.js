import { burnBytes } from './burn.js';
import { filePathOf, isFileUrl } from './url.js';

/**
 * Where a page could be inside a folder the person picked. Browsers only say the folder's name,
 * not where it is on disk, so a page matches when its path has that folder in it, and the rest
 * of the path then leads to the file. Returns the paths below the folder, shortest folder name match
 * first (the longest path), e.g. "papers" in C:/work/papers/set1/a.html gives [["set1", "a.html"]].
 */
export function pathsBelow(url, folderName) {
  const segments = filePathOf(url).split('/').filter(Boolean);
  const wanted = folderName.toLowerCase();
  const out = [];
  segments.forEach((segment, i) => {
    if (i < segments.length - 1 && segment.toLowerCase() === wanted) out.push(segments.slice(i + 1));
  });
  return out;
}

/**
 * Writes the notes of each local-file page into its file inside `folder`.
 *   folder  { name, find(segments) → entry | null, read(entry) → bytes, write?(entry, bytes), locate?(page) }
 *           Without `write`, the updated files are returned in `outputs` instead. `locate` can
 *           name a page's file directly, as { entry, segments }, instead of searching by folder name.
 *   pages   [{ url, note?, annotations }], the complete pages: the file always gets all of a page's notes
 * Never throws for one bad file: it ends up in `failed` and the rest carry on.
 */
export async function burnPages(folder, pages, { categories, style }) {
  const result = { updated: [], unchanged: 0, notFound: [], skipped: [], failed: [], unplaced: 0, outputs: [] };
  for (const page of pages) {
    if (!isFileUrl(page.url)) continue;
    const label = filePathOf(page.url);
    try {
      let found = (await folder.locate?.(page)) ?? null;
      for (const segments of found ? [] : pathsBelow(page.url, folder.name)) {
        const entry = await folder.find(segments);
        if (entry) {
          found = { entry, segments };
          break;
        }
      }
      if (!found) {
        result.notFound.push(label);
        continue;
      }
      const burned = burnBytes(await folder.read(found.entry), page, { categories, style });
      if (burned.skipped) {
        result.skipped.push({ path: label, reason: burned.skipped });
        continue;
      }
      result.unplaced += burned.unplaced ?? 0;
      if (!burned.changed) {
        result.unchanged++;
        continue;
      }
      if (folder.write) await folder.write(found.entry, burned.bytes);
      else result.outputs.push({ path: [folder.name, ...found.segments].join('/'), bytes: burned.bytes });
      result.updated.push(label);
    } catch (err) {
      console.error('Annotator: could not write into', label, err);
      result.failed.push(label);
    }
  }
  return result;
}
