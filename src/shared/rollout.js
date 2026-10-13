// Decides what an update changes for people who already use the extension.
// New installs get the defaults; existing users keep how things worked before and
// are told about new features.

export const WHATS_NEW_VERSION = '2.1';

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

export function rolloutOnInstall({ reason, previousVersion }) {
  if (reason !== 'update' || !previousVersion || compareVersions(previousVersion, WHATS_NEW_VERSION) >= 0) return null;
  return { whatsNew: WHATS_NEW_VERSION };
}
