// src/PatternPackBoard.js

import DraggableSvgBoard from "../node_modules/draggable-svg-html-element/src/DraggableSvgBoard.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export class PatternPackBoard extends DraggableSvgBoard {
  static get observedAttributes() {
	return [];
  }

  constructor() {
	super();

	this._observer = null;
	this._syncTimer = null;
	this._isConnected = false;
	
	this.endpoint = "https://secure-refuge-29958-07dfc33a91ee.herokuapp.com/proxy/"
	
	
	this.shadowRoot.innerHTML = `
	  <style>
		.hidden {
		  display: none;
		}
	
		progress {
		  width: 100%;
		  margin: 0.5rem 0;
		}
	  </style>
	
	  <div>
		<button id="syncBtn" type="button">Pack Garment Pattern Pieces</button>
		<progress class="loading hidden"></progress>
		<div class="content"></div>
		<p class="status"></p>
		<slot></slot>
	  </div>
	`;
	
	this.progressEl = this.shadowRoot.querySelector("progress");
	console.log("Progress bar element", this.progressEl)
	
	const syncBtn = this.shadowRoot.getElementById("syncBtn");
	
	syncBtn.addEventListener("click", async () => {
		try {
			const response = await this.syncNow();
			console.log("Sync complete", response);
		} catch (err) {
			console.error("Sync failed", err);
		}
	});
  }

  connectedCallback() {
  	super.connectedCallback?.();
	  
	if (this._isConnected) return;
	this._isConnected = true;
	this._observer = new MutationObserver((records) => {
	  if (this._shouldSync(records)) {
		this._scheduleSync();
	  }
	});

	// this._observer.observe(this, {
	//   childList: true,
	//   subtree: true,
	//   attributes: true,
	//   attributeFilter: [
	// 	"d",
	// 	"points",
	// 	"transform",
	// 	"x",
	// 	"y",
	// 	"width",
	// 	"height",
	// 	"cx",
	// 	"cy",
	// 	"r",
	// 	"role",
	// 	"data-owner-control",
	// 	"data-piece-kind",
	// 	"data-instance-id"
	//   ]
	// });

	this._scheduleSync();
  }

  disconnectedCallback() {
	this._isConnected = false;

	if (this._observer) {
	  this._observer.disconnect();
	  this._observer = null;
	}

	if (this._syncTimer) {
	  clearTimeout(this._syncTimer);
	  this._syncTimer = null;
	}
	
	super.disconnectedCallback?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
	if (name === "endpoint" && oldValue !== newValue && this.isConnected) {
	  this._scheduleSync();
	}
  }

  get board() {
	return this.shadowRoot.querySelector("draggable-svg-board");
  }

  getPayload() {
	const garmentSvgs = this._serializeAsStandaloneSvg(Array.from(
		this.querySelectorAll('[role="garment"]'))
	)
	
	const stockSvgs = this._serializeAsStandaloneSvg(Array.from(
		this.querySelectorAll('[role="stock"]')
	))
	
	console.log("Garment SVGS", garmentSvgs)
	// console.log("Stock SVGS", stockSvgs[0])
	
	var payload = {
		"id":"packboard",
		"input": {}
	}

	if (stockSvgs[0] !== null) {
		payload.input.stock = stockSvgs
	}
	
	if (garmentSvgs[0] !== null) {
		payload.input.parts = garmentSvgs
	}
	
	console.log("Payload:", payload)
		
	return payload
	
  }

  async syncNow() {
	if (!this.endpoint) return null;

	this.progressEl.classList.remove("hidden");

	const response = await fetch(this.endpoint, {
	  method: "POST",
	  headers: { 
		  "Content-Type": "application/json",
	  },
	  body: JSON.stringify(this.getPayload())
	});

	if (!response.ok) {
	  throw new Error(`Sync failed with status ${response.status}`);
	}
	
	this.progressEl.classList.add("hidden");
	
	// Apply the bins and the parts
	// Parse JSON body
	const data = await response.json();
	
	if (data.status == "IN_QUEUE") {
		console.log('In Queue... check again later. TODO')
	}
	
	console.log("SVG Packing result:", data);
	
	// Debug
	window.pack_output = data.output
	
	const svgResult = data.output.garment_marker;
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgResult, "image/svg+xml");
	const svgElement = doc.documentElement;
	
	const garment_pieces = svgElement.querySelectorAll("path, polygon");
	
	garment_pieces.forEach(el => {
	  el.dataset.draggable = "true";
	  el.setAttribute("pointer-events", "all");
	});

	// And the draggable wrapper to the packboard
	this.querySelector("svg").replaceWith(svgElement);
	
	super.connectedCallback?.();

	return response;
  }

  _shouldSync(records) {
	return records.some((record) =>
	  record.type === "childList" || record.type === "attributes"
	);
  }

  _scheduleSync() {
	return -1;
	if (!this.endpoint) return;

	if (this._syncTimer) {
	  clearTimeout(this._syncTimer);
	}

	this._syncTimer = setTimeout(() => {
	  this._syncTimer = null;
	  this.syncNow().catch((error) => {
		this.dispatchEvent(
		  new CustomEvent("sync-error", {
			detail: { error },
			bubbles: true,
			composed: true
		  })
		);
	  });
	}, 150);
  }

  _serializeAsStandaloneSvg(sourceNodes) {
	const svg = document.createElementNS(SVG_NS, "svg");
	
	const standard_width = 1000
	const standard_height = 800
	svg.setAttribute("width", standard_width);
	svg.setAttribute("height", standard_height);
	
	svg.setAttribute("xmlns", SVG_NS);
	svg.setAttribute(
	  "viewBox",
	  this.getAttribute("viewBox") || `0 0 ${standard_width} ${standard_height}`
	);
	
	for (var sourceNode of sourceNodes) {
		svg.appendChild(sourceNode.cloneNode(true));
	}
		
	return new XMLSerializer().serializeToString(svg);
  }
}

if (!customElements.get("pattern-pack-board")) {
  customElements.define("pattern-pack-board", PatternPackBoard);
}