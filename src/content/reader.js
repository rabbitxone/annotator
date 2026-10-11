// Injected on demand (only when a snapshot is saved), so the full Readability engine
// doesn't weigh on every page load.
import Readability from '@mozilla/readability/Readability.js';

globalThis.__annotatorReadability = Readability;
