import "/node_modules/packed-patterns-and-stock-html-element/src/PatternPackBoard.js";

const DEFAULT_BOARD_WIDTH = 1200;
const DEFAULT_BOARD_HEIGHT = 750;
const CANVAS_PADDING = 80;
const STOCK_GAP = 50;
const PACK_PIECE_LIMIT = 50;
const MAX_ERROR_DETAIL_LENGTH = 220;

const PatternPackBoard = customElements.get("pattern-pack-board");
const originalConnectedCallback = PatternPackBoard?.prototype.connectedCallback;
const PatternPackBoardBase = PatternPackBoard
  ? Object.getPrototypeOf(PatternPackBoard.prototype)
  : null;

if (PatternPackBoard && !PatternPackBoard.prototype._scrollableStockPatchApplied) {
  PatternPackBoard.prototype._scrollableStockPatchApplied = true;
  PatternPackBoard.prototype._handleAddedNode = function handleAddedNode() {};

  PatternPackBoard.prototype.connectedCallback = function connectedCallback() {
    originalConnectedCallback?.call(this);
    installPackFailureMessaging(this);
    installShadowSizing(this);
    installScrollableStockBoard(this.querySelector("svg"));
  };

  PatternPackBoard.prototype.syncNow = async function syncNow() {
    if (!this.endpoint) return null;

    const payload = this.getPayload();
    clearPackFailure(this);

    this.progressEl?.classList.remove("hidden");

    const restoreObserver = Boolean(this._observer);
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw await createPackHttpError(response);
      }

      const data = await response.json();

      if (data.status == "IN_QUEUE") {
        console.log("In Queue... check again later. TODO");
        return response;
      }

      console.log("SVG Packing result:", data);

      const packOutput = this._packOutput(data);
      if (typeof window !== "undefined") {
        window.pack_output = packOutput;
      }

      const svgResults = this._svgResults(data);
      if (svgResults.length === 0) {
        throw new Error("Packaide response did not include an SVG.");
      }

      this._replaceBoardSvg(svgResults);

      PatternPackBoardBase?.connectedCallback?.call(this);

      return response;
    } catch (error) {
      const failure = getPackFailureDetails(this, error, payload);
      renderPackFailure(this, failure);
      this.dispatchEvent(
        new CustomEvent("sync-error", {
          detail: { error, ...failure },
          bubbles: true,
          composed: true,
        }),
      );
      throw error;
    } finally {
      this.progressEl?.classList.add("hidden");
      if (restoreObserver && this.isConnected && !this._observer) {
        this._startObserver();
      }
    }
  };
}

document.querySelectorAll("pattern-pack-board").forEach((board) => {
  installPackFailureMessaging(board);
  installShadowSizing(board);
  installScrollableStockBoard(board.querySelector("svg"));
});

function installPackFailureMessaging(board) {
  if (!board?.shadowRoot) {
    return;
  }

  if (!board.shadowRoot.querySelector("[data-pack-failure-style]")) {
    const style = document.createElement("style");
    style.dataset.packFailureStyle = "";
    style.textContent = `
      .pack-failure {
        border: 1px solid #d97706;
        border-radius: 8px;
        background: #fff7ed;
        color: #4a2c05;
        display: grid;
        gap: 0.45rem;
        line-height: 1.4;
        margin: 0.25rem 0;
        padding: 0.8rem;
      }

      .pack-failure.hidden {
        display: none;
      }

      .pack-failure-header {
        align-items: center;
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
      }

      .pack-failure-title {
        font-weight: 700;
      }

      .pack-failure-body,
      .pack-failure-detail,
      .pack-failure-next {
        margin: 0;
      }

      .pack-failure-detail {
        color: #7c3f08;
        font-size: 0.92rem;
      }

      .pack-failure-dismiss {
        appearance: none;
        border: 1px solid currentColor;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-size: 0.85rem;
        line-height: 1;
        padding: 0.45rem 0.6rem;
      }

      .pack-failure-dismiss:hover {
        background: rgba(217, 119, 6, 0.12);
      }

      @media (prefers-color-scheme: dark) {
        .pack-failure {
          background: #2f2416;
          border-color: #f59e0b;
          color: #fff3d7;
        }

        .pack-failure-detail {
          color: #f7c979;
        }

        .pack-failure-dismiss:hover {
          background: rgba(245, 158, 11, 0.16);
        }
      }
    `;

    board.shadowRoot.appendChild(style);
  }

  if (board.shadowRoot.querySelector("[data-pack-failure]")) {
    return;
  }

  const failureEl = document.createElement("div");
  failureEl.dataset.packFailure = "";
  failureEl.className = "pack-failure hidden";
  failureEl.setAttribute("role", "alert");
  failureEl.setAttribute("aria-live", "polite");
  failureEl.innerHTML = `
    <div class="pack-failure-header">
      <strong class="pack-failure-title"></strong>
      <button class="pack-failure-dismiss" type="button" data-pack-failure-dismiss>Dismiss</button>
    </div>
    <p class="pack-failure-body"></p>
    <p class="pack-failure-detail"></p>
    <p class="pack-failure-next"></p>
  `;

  failureEl
    .querySelector("[data-pack-failure-dismiss]")
    ?.addEventListener("click", () => clearPackFailure(board));

  const slot = board.shadowRoot.querySelector("slot");
  board.shadowRoot.querySelector("div")?.insertBefore(failureEl, slot || null);
}

function clearPackFailure(board) {
  const failureEl = board?.shadowRoot?.querySelector("[data-pack-failure]");
  if (!failureEl) {
    return;
  }

  failureEl.classList.add("hidden");
}

function renderPackFailure(board, failure) {
  installPackFailureMessaging(board);

  const failureEl = board?.shadowRoot?.querySelector("[data-pack-failure]");
  if (!failureEl) {
    return;
  }

  failureEl.querySelector(".pack-failure-title").textContent = failure.title;
  failureEl.querySelector(".pack-failure-body").textContent = failure.body;
  failureEl.querySelector(".pack-failure-next").textContent = failure.nextStep;

  const detailEl = failureEl.querySelector(".pack-failure-detail");
  detailEl.textContent = failure.detail || "";
  detailEl.hidden = !failure.detail;

  failureEl.classList.remove("hidden");
}

async function createPackHttpError(response) {
  const detail = await readPackErrorDetail(response);
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const error = new Error(`Pack request failed with HTTP ${response.status}${statusText}`);

  error.name = "PackRequestError";
  error.status = response.status;
  error.statusText = response.statusText;
  error.responseDetail = detail;

  return error;
}

async function readPackErrorDetail(response) {
  let rawText = "";

  try {
    rawText = await response.text();
  } catch {
    return "";
  }

  if (!rawText.trim()) {
    return "";
  }

  const contentType = response.headers.get("content-type") || "";
  let detail = "";

  if (contentType.includes("json")) {
    try {
      detail = extractJsonErrorDetail(JSON.parse(rawText));
    } catch {
      detail = rawText;
    }
  } else if (contentType.includes("html")) {
    detail = new DOMParser()
      .parseFromString(rawText, "text/html")
      .body.textContent;
  } else {
    detail = rawText;
  }

  return truncateErrorDetail(detail);
}

function extractJsonErrorDetail(data) {
  if (typeof data === "string") {
    return data;
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  for (const key of ["error", "message", "detail", "details", "reason"]) {
    const value = data[key];

    if (typeof value === "string") {
      return value;
    }

    if (value && typeof value === "object") {
      const nested = extractJsonErrorDetail(value);
      if (nested) {
        return nested;
      }
    }
  }

  return JSON.stringify(data);
}

function truncateErrorDetail(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_ERROR_DETAIL_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_ERROR_DETAIL_LENGTH - 1)}...`;
}

function getPackFailureDetails(board, error, payload) {
  const pieceSummary = getPackPieceSummary(board, payload);
  const status = error.status || parseHttpStatus(error.message);
  const detail = getFailureDetailText(status, error.responseDetail);

  if (pieceSummary.garmentCount > PACK_PIECE_LIMIT) {
    return {
      title: "Too many pieces to pack at once",
      body: `This board has ${formatPieceSummary(pieceSummary)}. Packing usually works best with ${PACK_PIECE_LIMIT} or fewer pattern pieces.`,
      detail,
      nextStep:
        "Reduce quantities, remove lower-priority pieces, or split the layout into smaller batches before packing again.",
      pieceSummary,
      status,
    };
  }

  if (status) {
    return {
      title: `Packing failed with HTTP ${status}`,
      body:
        "The board stayed unchanged because the packing endpoint could not finish this request.",
      detail,
      nextStep:
        "Try again in a minute. If it repeats, reduce the number of pieces or remove unusually complex uploaded shapes.",
      pieceSummary,
      status,
    };
  }

  return {
    title: "Packing could not finish",
    body:
      "The board stayed unchanged because the packing request did not return a usable result.",
    detail: error.message ? `Detail: ${error.message}` : "",
    nextStep:
      "Check the connection, then retry with fewer pieces or simpler uploaded shapes.",
    pieceSummary,
    status,
  };
}

function getFailureDetailText(status, responseDetail) {
  const parts = [];

  if (status) {
    parts.push(`HTTP ${status}`);
  }

  if (responseDetail) {
    parts.push(`Endpoint detail: ${responseDetail}`);
  }

  return parts.join(". ");
}

function getPackPieceSummary(board) {
  const garmentCount = countRoleNodes(board, "garment");
  const stockCount = countRoleNodes(board, "stock");

  return {
    garmentCount,
    stockCount,
    totalCount: garmentCount + stockCount,
  };
}

function countRoleNodes(board, role) {
  if (typeof board?._roleNodes === "function") {
    return board._roleNodes(role).length;
  }

  return Array.from(board?.querySelectorAll?.(`[role="${role}"]`) || []).filter(
    (node) => !node.parentElement?.closest(`[role="${role}"]`),
  ).length;
}

function formatPieceSummary(pieceSummary) {
  const patternPieces = pluralize(
    pieceSummary.garmentCount,
    "pattern piece",
    "pattern pieces",
  );

  if (pieceSummary.stockCount === 0) {
    return patternPieces;
  }

  return `${patternPieces} and ${pluralize(
    pieceSummary.stockCount,
    "stock shape",
    "stock shapes",
  )}`;
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseHttpStatus(message) {
  const match = /\b(?:HTTP|status)\s+(\d{3})\b/i.exec(message || "");
  return match ? Number(match[1]) : null;
}

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
