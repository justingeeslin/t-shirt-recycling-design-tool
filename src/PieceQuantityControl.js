// src/PieceQuantityControl.js
const SVG_NS = "http://www.w3.org/2000/svg";

export class PieceQuantityControl extends HTMLElement {
  static get observedAttributes() {
	return ["board", "piece-kind", "label", "value"];
  }

  constructor() {
	super();
	this.attachShadow({ mode: "open" });
	this._localCounter = 0;

	this.shadowRoot.innerHTML = `
	  <style>
		:host {
		  display: block;
		  font-family: sans-serif;
		}

		.control {
		  display: inline-flex;
		  align-items: center;
		  gap: 10px;
		}

		.label {
		  min-width: 0;
		}

		input[type="number"] {
		  width: 80px;
		  padding: 6px;
		  box-sizing: border-box;
		}

		::slotted([slot="shape"]) {
		  display: none;
		}
	  </style>

	  <div class="control">
		<slot name="preview"></slot>
		<span class="label"></span>
		<input class="qty" type="number" min="0" step="1" value="0">
	  </div>

	  <slot name="shape"></slot>
	`;
  }

  connectedCallback() {
	this._render();
	this.qtyInput.addEventListener("input", this._onInput);
  }

  disconnectedCallback() {
	this.qtyInput.removeEventListener("input", this._onInput);
  }

  attributeChangedCallback() {
	this._render();
  }

  get qtyInput() {
	return this.shadowRoot.querySelector(".qty");
  }

  get labelEl() {
	return this.shadowRoot.querySelector(".label");
  }
  
  get board() {
	  return document.getElementById(this.boardId)
  }

  get boardId() {
	return this.getAttribute("board");
  }

  get boardElement() {
	return this.boardId ? document.getElementById(this.boardId) : null;
  }

  get pieceKind() {
	return this.getAttribute("piece-kind") || "unknown";
  }

  get label() {
	return this.getAttribute("label") || this.pieceKind;
  }

  get value() {
	return Math.max(0, Number.parseInt(this.getAttribute("value") || "0", 10) || 0);
  }

  set value(v) {
	this.setAttribute("value", String(Math.max(0, Number.parseInt(v, 10) || 0)));
  }

  get ownerId() {
	return this.id || this.getAttribute("name") || this.pieceKind;
  }

  get shapeTemplate() {
	return this.querySelector('template[slot="shape"]');
  }

  _onInput = () => {
	const desired = Math.max(0, Number.parseInt(this.qtyInput.value || "0", 10) || 0);
	this.value = desired;
	this._reconcileQuantity(desired);
  };

  _render() {
	this.labelEl.textContent = this.label;
	this.qtyInput.value = String(this.value);
  }

  _reconcileQuantity(desiredCount) {
	  console.log("Heres the board..", this.board)
  	const boardSvgElement = this.board.querySelector('svg')
	const currentNodes = this._getOwnedNodes(boardSvgElement);
	const currentCount = currentNodes.length;
	const delta = desiredCount - currentCount;

	if (delta > 0) {
	  for (let i = 0; i < delta; i += 1) {
		const node = this._createOwnedNode(currentCount + i);
		boardSvgElement.appendChild(node);
	  }
	} else if (delta < 0) {
	  currentNodes.slice(delta).forEach((node) => node.remove());
	}
  }

  _getOwnedNodes(board) {
	return Array.from(this.board.querySelectorAll((
	  `[data-owner-control="${CSS.escape(this.ownerId)}"][data-piece-kind="${CSS.escape(this.pieceKind)}"]`
	)));
  }

_createOwnedNode(index) {
	const template = this.shapeTemplate;
	if (!template) {
	  throw new Error(`Missing <template slot="shape"> in ${this.tagName.toLowerCase()}`);
	}
  
	const fragment = template.content.cloneNode(true);
  
	// Find the first SVG root in the template.
	const svgRoot = Array.from(fragment.children).find(
	  (node) => node instanceof SVGSVGElement
	);
  
	if (!svgRoot) {
	  throw new Error(
		'Shape template must contain an <svg> root inside <template slot="shape">'
	  );
	}
  
	// Prefer the first child inside the svg, usually a <g>.
	const root = Array.from(svgRoot.children).find(
	  (node) => node instanceof SVGElement
	);
  
	if (!root) {
	  throw new Error(
		"Shape template SVG must contain one root SVG child element, usually a <g>"
	  );
	}
  
	root.setAttribute("data-role", "garment");
	root.setAttribute("data-owner-control", this.ownerId);
	root.setAttribute("data-piece-kind", this.pieceKind);
	root.setAttribute("data-instance-id", `${this.ownerId}-${this._localCounter++}`);
  
	this._positionNode(root, index);
  
	return root;
  }

  _positionNode(node, index) {
	const colCount = 6;
	const cellW = 120;
	const cellH = 120;
	const startX = 80;
	const startY = 80;

	const col = index % colCount;
	const row = Math.floor(index / colCount);

	const x = startX + col * cellW;
	const y = startY + row * cellH;

	const existingTransform = node.getAttribute("transform") || "";
	const translate = `translate(${x}, ${y})`;

	node.setAttribute(
	  "transform",
	  existingTransform ? `${translate} ${existingTransform}` : translate
	);
  }
}

if (!customElements.get("piece-quantity-control")) {
  customElements.define("piece-quantity-control", PieceQuantityControl);
}