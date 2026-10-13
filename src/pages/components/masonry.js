const GAP = 12;

/**
 * Cards of different heights pack under each other instead of leaving holes beside a long
 * one. The grid gets 1px rows and each card spans as many as it is tall (plus the gap), so
 * the order and the columns stay CSS grid's; the spans follow every change of a card's size.
 */
export function masonry(grid) {
  grid.classList.add('masonry');
  const fit = (el, height) => {
    el.style.gridRowEnd = `span ${Math.max(1, Math.ceil(height + GAP))}`;
  };
  // Applied on the next frame, so a span change never feeds back into the same round of resizes
  const sizes = new ResizeObserver((entries) => {
    const heights = entries.map((entry) => [entry.target, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height]);
    requestAnimationFrame(() => heights.forEach(([el, height]) => fit(el, height)));
  });
  // New cards get their span straight away, before anything is painted
  const watch = (node) => {
    if (node.nodeType !== 1) return;
    fit(node, node.getBoundingClientRect().height);
    sizes.observe(node);
  };
  [...grid.children].forEach(watch);
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(watch);
      record.removedNodes.forEach((node) => node.nodeType === 1 && sizes.unobserve(node));
    }
  }).observe(grid, { childList: true });
  return grid;
}
