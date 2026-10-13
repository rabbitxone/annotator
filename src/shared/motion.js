export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Runs `done` once the element's running animations end, or after `fallback` ms at the latest. */
export function afterAnimations(el, done, fallback = 300) {
  let called = false;
  const finish = () => {
    if (called) return;
    called = true;
    done();
  };
  const running = reducedMotion() ? [] : (el.getAnimations?.({ subtree: true }) ?? []);
  if (running.length === 0) return finish();
  Promise.all(running.map((a) => a.finished)).then(finish, finish);
  setTimeout(finish, fallback);
}

/** Folds the element away (fade and collapse), then removes it. */
export function collapseOut(el, then) {
  const finish = () => {
    el.remove();
    then?.();
  };
  if (reducedMotion() || !el.isConnected || !el.animate) return finish();
  const { height } = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  el.style.overflow = 'hidden';
  el.style.pointerEvents = 'none';
  el.animate(
    [
      { height: `${height}px`, opacity: 1, transform: 'none', marginBottom: style.marginBottom },
      { height: `${height}px`, opacity: 0, transform: 'scale(0.98)', offset: 0.45 },
      { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px', marginBottom: '0px', marginTop: '0px', transform: 'scale(0.98)' },
    ],
    { duration: 260, easing: 'ease-in-out', fill: 'forwards' },
  ).finished.then(finish, finish);
}

/** Plays a short entrance on an element already in the page. */
export function enter(el, keyframes = [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], duration = 180) {
  if (reducedMotion() || !el?.animate) return;
  el.animate(keyframes, { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}
