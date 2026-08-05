import "/node_modules/packed-patterns-and-stock-html-element/src/PatternPackBoard.js";

const DEFAULT_BOARD_WIDTH = 1200;
const DEFAULT_BOARD_HEIGHT = 750;
const CANVAS_PADDING = 80;
const STOCK_GAP = 50;

const PatternPackBoard = customElements.get("pattern-pack-board");
const originalConnectedCallback = PatternPackBoard?.prototype.connectedCallback;

if (PatternPackBoard && !PatternPackBoard.prototype._scrollableStockPatchApplied) {
  PatternPackBoard.prototype._scrollableStockPatchApplied = true;
  PatternPackBoard.prototype._handleAddedNode = function handleAddedNode() {};

  PatternPackBoard.prototype.connectedCallback = function connectedCallback() {
    originalConnectedCallback?.call(this);
    installShadowSizing(this);
    installScrollableStockBoard(this.querySelector("svg"));
  };
}

document.querySelectorAll("pattern-pack-board").forEach((board) => {
  installShadowSizing(board);
  installScrollableStockBoard(board.querySelector("svg"));
});

function installShadowSizing(board) {
  if (!board?.shadowRoot || board.shadowRoot.querySelector("[data-scrollable-stock-style]")) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.scrollableStockStyle = "";
  style.textContent = `
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    :host > div {
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }

    ::slotted(.board-scroll) {
      display: block;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }
  `;

  board.shadowRoot.appendChild(style);
}

function installScrollableStockBoard(svg) {
  if (!svg || svg._scrollableStockBoard) {
    return;
  }

  const state = {
    rightmostX: 0,
  };

  svg._scrollableStockBoard = state;

  ensureBoardCanvas(svg);
  state.rightmostX = measureRightmostStock(svg);
  expandBoardToFitCurrentStock(svg);

  const observer = new MutationObserver((records) => {
    let shouldExpand = false;

    for (const record of records) {
      for (const node of record.addedNodes) {
        for (const stockNode of getNewStockRoots(node)) {
          placeStockNode(svg, stockNode, state);
          shouldExpand = true;
        }
      }
    }

    if (shouldExpand) {
      expandBoardToFitCurrentStock(svg);
    }
  });

  observer.observe(svg, {
    childList: true,
    subtree: true,
  });

  state.observer = observer;
}

function ensureBoardCanvas(svg) {
  const viewBox = getViewBox(svg);

  if (!svg.hasAttribute("width")) {
    svg.setAttribute("width", String(viewBox.width));
  }

  if (!svg.hasAttribute("height")) {
    svg.setAttribute("height", String(viewBox.height));
  }

  syncBoardSurface(svg, viewBox.width, viewBox.height);
}

function getViewBox(svg) {
  const values = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number) || [];

  if (values.length >= 4 && values.every(Number.isFinite)) {
    return {
      x: values[0],
      y: values[1],
      width: values[2],
      height: values[3],
    };
  }

  const width = Number.parseFloat(svg.getAttribute("width")) || DEFAULT_BOARD_WIDTH;
  const height = Number.parseFloat(svg.getAttribute("height")) || DEFAULT_BOARD_HEIGHT;

  return { x: 0, y: 0, width, height };
}

function getStockRoots(root) {
  if (!(root instanceof Element)) {
    return [];
  }

  const candidates = [];

  if (isStockNode(root)) {
    candidates.push(root);
  }

  candidates.push(
    ...Array.from(root.querySelectorAll?.('[role="stock"]') || []).filter(isStockNode),
  );

  return candidates.filter((node, index) => {
    if (candidates.indexOf(node) !== index) {
      return false;
    }

    const parentStock = node.parentElement?.closest('[role="stock"]');
    return !parentStock || !root.contains(parentStock);
  });
}

function getNewStockRoots(node) {
  return getStockRoots(node).filter((stockNode) => {
    return stockNode.hasAttribute("data-owner-control")
      && stockNode.getAttribute("data-scrollable-stock-placed") !== "true";
  });
}

function isStockNode(node) {
  return node instanceof SVGGraphicsElement && node.getAttribute("role") === "stock";
}

function measureRightmostStock(svg) {
  return getStockRoots(svg).reduce((max, stockNode) => {
    const box = getElementBounds(stockNode);
    return box ? Math.max(max, box.x + box.width) : max;
  }, 0);
}

function placeStockNode(svg, stockNode, state) {
  const box = getElementBounds(stockNode);
  if (!box) {
    return;
  }

  const targetX = state.rightmostX + STOCK_GAP;
  const dx = targetX - box.x;

  translateElement(stockNode, dx, 0);
  stockNode.setAttribute("data-scrollable-stock-placed", "true");

  const newBox = getElementBounds(stockNode);
  if (!newBox) {
    return;
  }

  state.rightmostX = Math.max(state.rightmostX, newBox.x + newBox.width);
  expandBoardToFitBox(svg, newBox);
}

function getElementBounds(element) {
  try {
    const box = element.getBBox();
    const matrix = element.getCTM();

    if (!matrix) {
      return box;
    }

    const points = [
      new DOMPoint(box.x, box.y),
      new DOMPoint(box.x + box.width, box.y),
      new DOMPoint(box.x + box.width, box.y + box.height),
      new DOMPoint(box.x, box.y + box.height),
    ].map((point) => point.matrixTransform(matrix));

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  } catch (error) {
    console.warn("Could not measure stock bounds", element, error);
    return null;
  }
}

function translateElement(element, dx, dy) {
  const transform = element.getAttribute("transform") || "";
  const translatePattern = /^translate\(\s*([-\d.]+)(?:[ ,]\s*([-\d.]+))?\s*\)\s*/;
  const match = translatePattern.exec(transform);

  if (match) {
    const x = Number.parseFloat(match[1]) + dx;
    const y = Number.parseFloat(match[2] ?? "0") + dy;

    element.setAttribute(
      "transform",
      `translate(${x}, ${y}) ${transform.slice(match[0].length)}`.trim(),
    );
    return;
  }

  element.setAttribute("transform", `translate(${dx}, ${dy}) ${transform}`.trim());
}

function expandBoardToFitCurrentStock(svg) {
  getStockRoots(svg).forEach((stockNode) => {
    const box = getElementBounds(stockNode);

    if (box) {
      expandBoardToFitBox(svg, box);
    }
  });
}

function expandBoardToFitBox(svg, box) {
  const viewBox = getViewBox(svg);
  const requiredWidth = Math.ceil(
    Math.max(viewBox.width, box.x + box.width + CANVAS_PADDING),
  );
  const requiredHeight = Math.ceil(
    Math.max(viewBox.height, box.y + box.height + CANVAS_PADDING),
  );

  if (requiredWidth === viewBox.width && requiredHeight === viewBox.height) {
    return;
  }

  svg.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${requiredWidth} ${requiredHeight}`,
  );
  svg.setAttribute("width", String(requiredWidth));
  svg.setAttribute("height", String(requiredHeight));
  syncBoardSurface(svg, requiredWidth, requiredHeight);
}

function syncBoardSurface(svg, width, height) {
  svg.querySelector(".board-background")?.setAttribute("width", String(width));
  svg.querySelector(".board-background")?.setAttribute("height", String(height));
  svg.querySelector(".board-grid")?.setAttribute("width", String(width));
  svg.querySelector(".board-grid")?.setAttribute("height", String(height));
}
