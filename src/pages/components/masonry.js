const GAP = 12;

// 1px grid rows; each card spans its own height plus the gap.
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
