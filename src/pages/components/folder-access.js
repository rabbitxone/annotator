import { h } from '../../shared/dom.js';

/**
 * Chrome lets a page open a folder and write into the files in it. Firefox has no such thing: the
 * most it offers is reading a folder's files, so the updated ones go out as a download there.
 * Either way the result is a "folder" in the shape shared/burn-files.js works with.
 */
export const canWriteInPlace = typeof globalThis.showDirectoryPicker === 'function';

const missing = (err) => err?.name === 'NotFoundError' || err?.name === 'TypeMismatchError';

async function pickWithHandle() {
  let root;
  try {
    root = await globalThis.showDirectoryPicker({ id: 'annotator-files', mode: 'readwrite' });
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    throw err;
  }
  return {
    name: root.name,
    async find(segments) {
      try {
        let directory = root;
        for (const name of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(name);
        return await directory.getFileHandle(segments.at(-1));
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },
    read: async (handle) => new Uint8Array(await (await handle.getFile()).arrayBuffer()),
    async write(handle, bytes) {
      const writable = await handle.createWritable();
      try {
        await writable.write(bytes);
        await writable.close();
      } catch (err) {
        await writable.abort?.().catch(() => { });
        throw err;
      }
    },
  };
}

function pickWithInput() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', webkitdirectory: true, multiple: true, hidden: true });
    const done = (value) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => done(input.files.length ? Array.from(input.files) : null));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  }).then((files) => {
    if (!files) return null;
    const byPath = new Map();
    for (const file of files) byPath.set(file.webkitRelativePath.split('/').slice(1).join('/').toLowerCase(), file);
    return {
      name: files[0].webkitRelativePath.split('/')[0],
      find: async (segments) => byPath.get(segments.join('/').toLowerCase()) ?? null,
      read: async (file) => new Uint8Array(await file.arrayBuffer()),
    };
  });
}

/** Asks which folder holds the files. Resolves to null when the person cancels. */
export const chooseFolder = () => (canWriteInPlace ? pickWithHandle() : pickWithInput());
