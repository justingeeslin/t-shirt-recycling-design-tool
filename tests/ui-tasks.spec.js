const fs = require("fs");
const path = require("path");

const { expect, test } = require("@playwright/test");

const previewURL = "https://phpstack-1496460-6260926.cloudwaysapps.com/";
const configuredBaseURL = process.env.BASE_URL || process.env.PREVIEW_URL || "";
const hostedPreviewOrigin = new URL(previewURL).origin;
const targetsHostedPreview =
  configuredBaseURL !== "" && new URL(configuredBaseURL).origin === hostedPreviewOrigin;

async function openApp(page) {
  await page.goto("/index.html");
  await page.waitForFunction(() => {
    return (
      customElements.get("uploadable-palette") &&
      customElements.get("pattern-pack-board")
    );
  });
}

function paletteControl(page, controlId, paletteId = "pattern-palette") {
  return page.locator(
    `uploadable-palette#${paletteId} piece-quantity-control#${controlId}`,
  );
}

async function setQuantity(page, controlId, value, paletteId = "pattern-palette") {
  const input = paletteControl(page, controlId, paletteId).locator("input.qty");

  await input.fill(String(value));
  await expect(input).toHaveValue(String(value));
}

function repoAsset(...segments) {
  const assetPath = path.resolve(__dirname, "..", ...segments);

  if (!fs.existsSync(assetPath)) {
    throw new Error(`Missing test asset: ${assetPath}`);
  }

  return assetPath;
}

function firstTestImage() {
  const imageDir = path.resolve(__dirname, "..", "test-images");

  if (!fs.existsSync(imageDir)) {
    return null;
  }

  const image = fs
    .readdirSync(imageDir)
    .find((fileName) => /\.(jpe?g|png|webp)$/i.test(fileName));

  if (!image) {
    return null;
  }

  return path.join(imageDir, image);
}

test("renders the latest uploadable palette and packboard shell", async ({ page }) => {
  await openApp(page);

  await expect(page.locator("uploadable-palette#pattern-palette")).toBeVisible();
  await expect(page.locator("uploadable-palette#stock-palette")).toBeVisible();
  await expect(page.locator("pattern-pack-board svg#board")).toBeVisible();
  await expect(
    page.locator("uploadable-palette#pattern-palette piece-quantity-control"),
  ).toHaveCount(3);
  await expect(
    page.locator("uploadable-palette#stock-palette piece-quantity-control"),
  ).toHaveCount(1);
  await expect(
    page.locator("uploadable-palette#stock-palette piece-quantity-control#stock-shirt-control"),
  ).toHaveCount(1);
  await expect(page.locator('svg#board > [role="stock"]')).toHaveCount(0);
  await expect(
    page.locator("uploadable-palette#pattern-palette #svgPieceUpload"),
  ).toHaveAttribute("accept", /image\/\*/);
  await expect(
    page.locator("uploadable-palette#stock-palette #svgPieceUpload"),
  ).toHaveAttribute("accept", /image\/\*/);
  await expect(page.locator("uploadable-palette#stock-palette h1")).toHaveText(
    "Garment Stock",
  );
  await expect(page.locator("#download-board-svg")).toHaveText("Download SVG");
  await expect(page.locator("pattern-pack-board button#syncBtn")).toHaveText(
    /Pack Garment Pattern Pieces/,
  );
});

test("adds and removes default pattern pieces through quantity controls", async ({
  page,
}) => {
  await openApp(page);

  await setQuantity(page, "triangle-control", 2);
  await expect(
    page.locator(
      '#board [data-owner-control="triangle-control"][data-piece-kind="triangle"]',
    ),
  ).toHaveCount(2);

  await setQuantity(page, "triangle-control", 1);
  await expect(
    page.locator(
      '#board [data-owner-control="triangle-control"][data-piece-kind="triangle"]',
    ),
  ).toHaveCount(1);
});

test("adds and removes the default t-shirt stock through its quantity control", async ({
  page,
}) => {
  await openApp(page);

  await setQuantity(page, "stock-shirt-control", 1, "stock-palette");
  await expect(
    page.locator(
      '#board [data-owner-control="stock-shirt-control"][data-piece-kind="stock-shirt"][role="stock"]',
    ),
  ).toHaveCount(1);

  await setQuantity(page, "stock-shirt-control", 0, "stock-palette");
  await expect(
    page.locator(
      '#board [data-owner-control="stock-shirt-control"][data-piece-kind="stock-shirt"][role="stock"]',
    ),
  ).toHaveCount(0);
});

test("uploads an SVG pattern and places one instance on the board", async ({
  page,
}) => {
  await openApp(page);

  await page
    .locator("uploadable-palette#pattern-palette #svgPieceUpload")
    .setInputFiles(repoAsset("tests", "fixtures", "left-sleeve.svg"));

  const uploadedControl = page.locator(
    'uploadable-palette#pattern-palette piece-quantity-control[id^="uploaded-left-sleeve-"]',
  );

  await expect(uploadedControl).toHaveCount(1);

  const pieceKind = await uploadedControl.first().getAttribute("piece-kind");

  await uploadedControl.first().locator("input.qty").fill("1");
  await expect(
    page.locator(`#board [data-piece-kind="${pieceKind}"][role="garment"]`),
  ).toHaveCount(1);
});

test("uploads an SVG stock shape and places one stock instance on the board", async ({
  page,
}) => {
  await openApp(page);

  await page
    .locator("uploadable-palette#stock-palette #svgPieceUpload")
    .setInputFiles(repoAsset("tests", "fixtures", "left-sleeve.svg"));

  const uploadedControl = page.locator(
    'uploadable-palette#stock-palette piece-quantity-control[id^="stock-uploaded-left-sleeve-"]',
  );

  await expect(uploadedControl).toHaveCount(1);

  const pieceKind = await uploadedControl.first().getAttribute("piece-kind");

  await uploadedControl.first().locator("input.qty").fill("1");
  await expect(
    page.locator(`#board [data-piece-kind="${pieceKind}"][role="stock"]`),
  ).toHaveCount(1);
  await expect(
    page.locator(`#board [data-piece-kind="${pieceKind}"][role="garment"]`),
  ).toHaveCount(0);
});

test("expands and scrolls the packboard for many large stock pieces", async ({
  page,
}) => {
  await openApp(page);

  await page.evaluate(() => {
    const largeStockSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <rect x="0" y="0" width="640" height="360" fill="none" stroke="black" />
      </svg>
    `;

    document
      .getElementById("stock-palette")
      .addSvgControl(largeStockSvg, "large-stock.svg");
  });

  const uploadedControl = page.locator(
    'uploadable-palette#stock-palette piece-quantity-control[id^="stock-uploaded-large-stock-"]',
  );

  await expect(uploadedControl).toHaveCount(1);

  const pieceKind = await uploadedControl.first().getAttribute("piece-kind");

  await uploadedControl.first().locator("input.qty").fill("4");
  await expect(
    page.locator(`#board [data-piece-kind="${pieceKind}"][role="stock"]`),
  ).toHaveCount(4);

  await expect
    .poll(() =>
      page.evaluate(() => Number(document.getElementById("board").getAttribute("width"))),
    )
    .toBeGreaterThan(1200);

  const metrics = await page.locator(".board-scroll").evaluate((scrollEl) => {
    const svg = scrollEl.querySelector("svg#board");
    const viewBoxValues = svg.getAttribute("viewBox").trim().split(/\s+/).map(Number);
    const grid = svg.querySelector(".board-grid");
    const background = svg.querySelector(".board-background");

    scrollEl.scrollLeft = scrollEl.scrollWidth;

    return {
      backgroundWidth: Number(background.getAttribute("width")),
      clientWidth: scrollEl.clientWidth,
      gridWidth: Number(grid.getAttribute("width")),
      scrollLeft: scrollEl.scrollLeft,
      scrollWidth: scrollEl.scrollWidth,
      svgWidth: Number(svg.getAttribute("width")),
      viewBoxWidth: viewBoxValues[2],
    };
  });

  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.scrollLeft).toBeGreaterThan(0);
  expect(metrics.viewBoxWidth).toBe(metrics.svgWidth);
  expect(metrics.gridWidth).toBe(metrics.svgWidth);
  expect(metrics.backgroundWidth).toBe(metrics.svgWidth);
});

test("shows a helpful pack failure message for too many pieces", async ({
  page,
}) => {
  await openApp(page);

  await page.route("**/pack-error", async (route) => {
    await route.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The pack request has too many pieces.",
      }),
    });
  });

  await page
    .locator("pattern-pack-board")
    .evaluate((board) => board.setAttribute("endpoint", "/pack-error"));
  await setQuantity(page, "triangle-control", 51);

  await expect(
    page.locator(
      '#board [data-owner-control="triangle-control"][data-piece-kind="triangle"]',
    ),
  ).toHaveCount(51);

  await page.locator("pattern-pack-board button#syncBtn").click();

  const failure = page.locator("pattern-pack-board .pack-failure");
  await expect(failure).toBeVisible();
  await expect(failure).toContainText("Too many pieces");
  await expect(failure).toContainText("51 pattern pieces");
  await expect(failure).toContainText("50 or fewer");
  await expect(failure).toContainText("split the layout into smaller batches");
  await expect(failure).toContainText("HTTP 413");
  await expect(failure).toContainText("The pack request has too many pieces.");
});

test("downloads the current packboard SVG", async ({ page }) => {
  await openApp(page);
  await setQuantity(page, "rect-control", 1);
  await expect(page.locator("#board .board-grid")).toHaveCount(1);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download-board-svg").click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^packboard-\d{4}-\d{2}-\d{2}T.*Z\.svg$/,
  );

  const downloadPath = await download.path();
  const svgText = fs.readFileSync(downloadPath, "utf8");

  expect(svgText).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(svgText).toContain('id="board"');
  expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svgText).toContain('data-piece-kind="rectangle"');
  expect(svgText).toContain('role="garment"');
  expect(svgText).toContain('stroke="#000000"');
  expect(svgText).not.toContain('class="board-background"');
  expect(svgText).not.toContain('class="board-grid"');
  expect(svgText).not.toContain('id="minor-grid"');
  expect(svgText).not.toContain('id="major-grid"');
  expect(svgText).not.toContain("grid-minor");
  expect(svgText).not.toContain("grid-major");
  expect(svgText).not.toContain("url(#major-grid)");
  expect(svgText).not.toContain("rgb(0, 119, 204)");
  expect(svgText).not.toContain("rgb(27, 31, 36)");
  expect(svgText).not.toContain("touch-action");
  expect(svgText).not.toContain("var(");
});

test("hosted: converts a photo upload into a reusable stock control", async ({
  page,
}) => {
  test.skip(
    !targetsHostedPreview,
    "The photo conversion flow requires the hosted PHP upload and measure endpoints.",
  );
  const imageFixture = firstTestImage();

  test.skip(
    !imageFixture,
    "The hosted photo conversion flow needs a local image fixture in test-images/.",
  );

  await openApp(page);

  const controls = page.locator(
    "uploadable-palette#stock-palette piece-quantity-control",
  );
  const initialControlCount = await controls.count();

  await page
    .locator("uploadable-palette#stock-palette #svgPieceUpload")
    .setInputFiles(imageFixture);

  await expect(controls).toHaveCount(initialControlCount + 1, {
    timeout: 60 * 1000,
  });

  const uploadedControl = controls.nth(initialControlCount);
  const pieceKind = await uploadedControl.getAttribute("piece-kind");

  await uploadedControl.locator("input.qty").fill("1");
  await expect(
    page.locator(`#board [data-piece-kind="${pieceKind}"][role="stock"]`),
  ).toHaveCount(1);
});

test("hosted: sends a pack request and renders the packed board response", async ({
  page,
}) => {
  test.skip(
    !targetsHostedPreview,
    "Packing reaches the hosted pack service and is only expected to pass from the preview.",
  );

  await openApp(page);
  await setQuantity(page, "rect-control", 1);

  const packResponse = page.waitForResponse(
    (response) =>
      response.url().includes("secure-refuge-29958-07dfc33a91ee.herokuapp.com") &&
      response.request().method() === "POST",
    { timeout: 120 * 1000 },
  );

  await page.locator("pattern-pack-board button#syncBtn").click();

  expect((await packResponse).ok()).toBe(true);
  await expect
    .poll(
      () => page.evaluate(() => Boolean(window.pack_output?.garment_marker)),
      { timeout: 120 * 1000 },
    )
    .toBe(true);
  await expect(page.locator("pattern-pack-board svg#board")).toBeVisible();
});
