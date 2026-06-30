const STORAGE_KEY = "blockFacadePainter.projects.v2";
const LEGACY_STORAGE_KEY = "blockFacadePainter.projects.v1";
const THEME_KEY = "blockFacadePainter.theme.v1";
const DB_NAME = "blockFacadePainterDB";
const DB_STORE = "projects";
const DEFAULT_TILE_SIZE = 24;
const MIN_TILE_SIZE = 2;
const MAX_TILE_SIZE = 96;
const ZOOM_STEP = 4;
const EMPTY_TILE_LIGHT = "#f1f0eb";
const EMPTY_TILE_DARK = "#3d3b36";
const SKY_COLOR = "#8DBBFF";
const MAX_SIZE = 100;
const MAX_HISTORY = 60;
const MAX_LAYERS = 6;

const textureManifest = window.BLOCK_TEXTURES || { categories: [], items: [] };
const textureItems = textureManifest.items || [];
const paletteItems = textureItems.filter((item) => !item.hidden);
const textureCategoryOrder = textureManifest.categories || [];

const views = {
  gallery: document.getElementById("galleryView"),
  create: document.getElementById("createView"),
  editor: document.getElementById("editorView"),
};

const galleryEl = document.getElementById("projectGallery");
const emptyGalleryEl = document.getElementById("emptyGallery");
const newProjectBtn = document.getElementById("newProjectBtn");
const cancelCreateBtn = document.getElementById("cancelCreateBtn");
const projectForm = document.getElementById("projectForm");
const projectNameInput = document.getElementById("projectName");
const projectWidthInput = document.getElementById("projectWidth");
const projectHeightInput = document.getElementById("projectHeight");
const skyEnabledInput = document.getElementById("skyEnabled");
const terrainModeInput = document.getElementById("terrainMode");

const canvas = document.getElementById("facadeCanvas");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true }) || canvas.getContext("2d");
const canvasViewport = canvas.parentElement;
ctx.imageSmoothingEnabled = false;

const editorProjectName = document.getElementById("editorProjectName");
const editorProjectSize = document.getElementById("editorProjectSize");
const textureSearch = document.getElementById("textureSearch");
const categorySelect = document.getElementById("categorySelect");
const texturePalette = document.getElementById("texturePalette");
const selectedTextureName = document.getElementById("selectedTextureName");
const brushBtn = document.getElementById("brushBtn");
const eraserBtn = document.getElementById("eraserBtn");
const eyedropperBtn = document.getElementById("eyedropperBtn");
const gridBtn = document.getElementById("gridBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomValue = document.getElementById("zoomValue");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const backToGalleryBtn = document.getElementById("backToGalleryBtn");
const backToGalleryTop = document.getElementById("backToGalleryTop");
const statusMessage = document.getElementById("statusMessage");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const darkModeToggle = document.getElementById("darkModeToggle");
const authStatus = document.getElementById("authStatus");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const layerList = document.getElementById("layerList");
const addLayerBtn = document.getElementById("addLayerBtn");
const depthShadingToggle = document.getElementById("depthShadingToggle");

let projects = [];
let firebaseReady = false;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let currentProject = null;
let currentTool = "brush";
let showGrid = true;
let isDrawing = false;
let tileSize = DEFAULT_TILE_SIZE;
let undoStack = [];
let redoStack = [];
let drawingSnapshot = null;
let drawingChanged = false;
let selectedTexture = findDefaultTexture();
let currentCategory = selectedTexture?.category || "Wszystkie";
let autoFitMode = true;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStart = null;
let queuedPanPoint = null;
let panMoveQueued = false;
let lastTransformTarget = null;
let draggingLayerId = null;
let expandedPaletteGroups = new Set();
let pipettePreviousTool = "brush";

const blackBlockTexture = createBlackTexture();
const textureById = buildTextureMap();
const connectStateByGroup = buildConnectStateMap();
const imageCache = new Map();
const renderedTextureCache = new Map();
const previewSrcCache = new Map();
const cellRenderCache = new Map();
const CELL_RENDER_CACHE_LIMIT = 900;
let renderQueued = false;
let pendingRenderReason = "";
let pendingFullRender = false;
let dirtyCellRect = null;
let lastRenderMs = 0;

function clearCellRenderCache() {
  cellRenderCache.clear();
}

function rememberCellRender(key, canvas) {
  if (cellRenderCache.size >= CELL_RENDER_CACHE_LIMIT) {
    const firstKey = cellRenderCache.keys().next().value;
    if (firstKey) cellRenderCache.delete(firstKey);
  }
  cellRenderCache.set(key, canvas);
  return canvas;
}

const TINT_COLORS = {
  grass: "#92BC58",
  foliage: "#77AB2F",
  birch: "#80A755",
  spruce: "#619961",
  dryFoliage: "#A37546",
  water: "#44AFF5",
  paleFoliage: "#878D76",
};

const DEFAULT_FOLIAGE_IDS = new Set([
  "oak_leaves", "jungle_leaves", "acacia_leaves", "dark_oak_leaves", "mangrove_leaves",
  "azalea_leaves", "flowering_azalea_leaves", "azalea_plant", "flowering_azalea_side",
  "potted_azalea_bush_plant", "potted_azalea_bush_side", "potted_flowering_azalea_bush_plant",
  "vine", "bush", "firefly_bush", "mangrove_propagule",
  "cave_vines", "cave_vines_lit", "cave_vines_plant", "cave_vines_plant_lit",
  "bamboo_large_leaves", "bamboo_small_leaves"
]);

const BIRCH_FOLIAGE_IDS = new Set(["birch_leaves"]);
const SPRUCE_FOLIAGE_IDS = new Set(["spruce_leaves"]);
const PALE_FOLIAGE_IDS = new Set(["pale_oak_leaves"]);
const GRASS_TINT_IDS = new Set(["short_grass", "fern", "sugar_cane", "seagrass", "kelp", "kelp_plant", "grass_block_side_overlay"]);
const DRY_FOLIAGE_IDS = new Set(["leaf_litter"]);
const WATER_TINT_IDS = new Set(["water_overlay"]);

function randomId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function createBlackTexture() {
  const texture = document.createElement("canvas");
  texture.width = 16;
  texture.height = 16;
  const textureCtx = texture.getContext("2d");
  textureCtx.fillStyle = "#000000";
  textureCtx.fillRect(0, 0, 16, 16);
  return texture;
}

function isDarkTheme() {
  return document.body.classList.contains("dark");
}

function getDefaultBackgroundColor() {
  return isDarkTheme() ? EMPTY_TILE_DARK : EMPTY_TILE_LIGHT;
}

function findDefaultTexture() {
  return (
    paletteItems.find((item) => item.id === "cobblestone") ||
    paletteItems.find((item) => item.category === "Kamień podstawowy") ||
    paletteItems[0] ||
    { id: "black_test", label: "Black test block", category: "Test", type: "block", src: "" }
  );
}

function buildTextureMap() {
  const map = new Map();

  textureItems.forEach((item) => {
    if (item.type === "door" && item.parts) {
      map.set(item.parts.top.id, { id: item.parts.top.id, label: `${item.label} top`, src: item.parts.top.src });
      map.set(item.parts.bottom.id, { id: item.parts.bottom.id, label: `${item.label} bottom`, src: item.parts.bottom.src });
    } else {
      map.set(item.id, {
        id: item.id,
        label: item.label,
        src: item.src,
        transform: item.transform || null,
        generatedShape: item.generatedShape || null,
        baseId: item.baseId || item.id,
        connectKind: item.connectKind || null,
        connectBaseId: item.connectBaseId || null,
        connectState: item.connectState || null,
        connectGroup: item.connectGroup || null,
      });
    }
  });

  return map;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function getTintSpec(textureId) {
  if (textureId === "grass_block_side") {
    return { mode: "grass-side-composite", color: TINT_COLORS.grass };
  }
  if (GRASS_TINT_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.grass };
  if (DEFAULT_FOLIAGE_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.foliage };
  if (BIRCH_FOLIAGE_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.birch };
  if (SPRUCE_FOLIAGE_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.spruce };
  if (PALE_FOLIAGE_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.paleFoliage };
  if (DRY_FOLIAGE_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.dryFoliage };
  if (WATER_TINT_IDS.has(textureId)) return { mode: "selective-tint", color: TINT_COLORS.water };
  return null;
}

function scheduleTextureRefresh() {
  clearCellRenderCache();
  if (currentProject) drawCanvas();
  if (!views.editor.classList.contains("hidden")) renderPalette();
}

function invalidateRenderedTexture(textureId) {
  clearCellRenderCache();
  renderedTextureCache.delete(textureId);
  previewSrcCache.delete(textureId);
  if (textureId === "grass_block_side_overlay") {
    renderedTextureCache.delete("grass_block_side");
    previewSrcCache.delete("grass_block_side");
  }
}

function getBaseTextureImage(textureId) {
  if (!textureId || textureId === 1 || textureId === "black_test") return blackBlockTexture;
  if (imageCache.has(textureId)) return imageCache.get(textureId);

  const textureInfo = textureById.get(textureId);
  if (!textureInfo || !textureInfo.src) return blackBlockTexture;

  const image = new Image();
  image.src = textureInfo.src;
  image.onload = () => {
    invalidateRenderedTexture(textureId);
    scheduleTextureRefresh();
  };
  imageCache.set(textureId, image);
  return image;
}

function createEmptyTextureCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  return canvas;
}

function createSelectiveTintedCanvas(baseImage, colorHex, saturationThreshold = 0.18) {
  if (!(baseImage instanceof HTMLImageElement || baseImage instanceof HTMLCanvasElement)) return null;
  if (baseImage instanceof HTMLImageElement && (!baseImage.complete || baseImage.naturalWidth === 0)) return null;

  const canvas = createEmptyTextureCanvas();
  const canvasCtx = canvas.getContext("2d");
  canvasCtx.imageSmoothingEnabled = false;
  canvasCtx.drawImage(baseImage, 0, 0, 16, 16);

  const imageData = canvasCtx.getImageData(0, 0, 16, 16);
  const data = imageData.data;
  const tint = hexToRgb(colorHex);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation > saturationThreshold) continue;

    const lightness = (r + g + b) / 3 / 255;
    data[i] = Math.round(tint.r * lightness);
    data[i + 1] = Math.round(tint.g * lightness);
    data[i + 2] = Math.round(tint.b * lightness);
  }

  canvasCtx.putImageData(imageData, 0, 0);
  return canvas;
}

function createGrassSideCanvas() {
  const base = getBaseTextureImage("grass_block_side");
  if (base instanceof HTMLImageElement && (!base.complete || base.naturalWidth === 0)) return null;

  const canvas = createEmptyTextureCanvas();
  const canvasCtx = canvas.getContext("2d");
  canvasCtx.imageSmoothingEnabled = false;
  canvasCtx.drawImage(base, 0, 0, 16, 16);

  const overlayInfo = textureById.get("grass_block_side_overlay");
  if (overlayInfo?.src) {
    const overlayBase = getBaseTextureImage("grass_block_side_overlay");
    if (!(overlayBase instanceof HTMLImageElement) || (overlayBase.complete && overlayBase.naturalWidth > 0)) {
      const tintedOverlay = createSelectiveTintedCanvas(overlayBase, TINT_COLORS.grass, 0.2);
      if (tintedOverlay) canvasCtx.drawImage(tintedOverlay, 0, 0, 16, 16);
    }
  }

  return canvas;
}

function buildConnectStateMap() {
  const map = new Map();
  textureItems.forEach((item) => {
    if (!item.connectGroup || !item.connectState) return;
    if (!map.has(item.connectGroup)) map.set(item.connectGroup, {});
    map.get(item.connectGroup)[item.connectState] = item.id;
  });
  return map;
}

function getConnectionState(left, right) {
  if (left && right) return "lr";
  if (left) return "l";
  if (right) return "r";
  return "none";
}

function isConnectShape(textureId) {
  return Boolean(textureById.get(textureId)?.connectGroup);
}

const NON_SOLID_CONNECTION_PATTERNS = [
  "__slab", "__stair", "__fence", "__wall", "_door", "_trapdoor",
  "button", "pressure_plate", "torch", "lantern", "chain", "iron_bars", "pane",
  "ladder", "rail", "redstone", "repeater", "comparator", "lever", "tripwire", "string",
  "banner", "sign", "hanging_sign", "flower", "sapling", "bush", "grass", "fern",
  "roots", "vine", "vines", "kelp", "seagrass", "coral", "mushroom", "beetroots",
  "carrots", "potatoes", "wheat", "melon_stem", "pumpkin_stem", "cocoa", "pink_petals",
  "wildflowers", "leaf_litter", "nether_sprouts", "fire", "cobweb", "snow", "carpet",
  "bed", "end_rod", "lightning_rod", "candle", "flower_pot", "potted", "skull", "head",
  "amethyst_cluster", "bud", "turtle_egg", "scaffolding", "water", "lava", "sugar_cane"
];

const WALL_SPECIAL_CONNECTION_PATTERNS = ["iron_bars", "pane", "pressure_plate", "banner", "string", "sea_pickle"];

function isFenceLikeInfo(info) {
  return info?.connectKind === "fence";
}

function isWallLikeInfo(info) {
  return info?.connectKind === "wall";
}

function isPaneLikeInfo(info) {
  return info?.connectKind === "pane";
}

function getConnectBaseId(info, textureId = "") {
  return info?.connectBaseId || info?.baseId || String(textureId || info?.id || "").replace(/__(fence|wall).*$/, "");
}

function isNetherBrickFenceInfo(info, textureId = "") {
  return isFenceLikeInfo(info) && getConnectBaseId(info, textureId) === "nether_bricks";
}

function isFenceGateId(textureId) {
  return /_fence_gate($|__)/.test(String(textureId || ""));
}

function isWallSpecialConnection(textureId) {
  const id = String(textureId || "");
  return WALL_SPECIAL_CONNECTION_PATTERNS.some((pattern) => id.includes(pattern));
}

function isFullSolidConnectionBlock(textureId, info = textureById.get(textureId)) {
  if (!textureId || !info) return false;
  if (info.connectKind || info.generatedShape) return false;
  if (info.renderKind === "trapdoor") return false;
  if (info.type === "door") return false;
  const id = String(textureId);
  if (NON_SOLID_CONNECTION_PATTERNS.some((pattern) => id.includes(pattern))) return false;
  return true;
}

function canConnectToNeighbor(sourceInfo, sourceId, neighborId) {
  if (!sourceInfo || !neighborId) return false;
  const neighborInfo = textureById.get(neighborId);
  if (!neighborInfo) return false;

  if (isFenceGateId(neighborId)) return true;

  if (isFenceLikeInfo(sourceInfo)) {
    if (isWallLikeInfo(neighborInfo) || isPaneLikeInfo(neighborInfo)) return false;
    if (isFenceLikeInfo(neighborInfo)) {
      const sourceNether = isNetherBrickFenceInfo(sourceInfo, sourceId);
      const neighborNether = isNetherBrickFenceInfo(neighborInfo, neighborId);
      return sourceNether === neighborNether;
    }
    return isFullSolidConnectionBlock(neighborId, neighborInfo);
  }

  if (isWallLikeInfo(sourceInfo)) {
    if (isFenceLikeInfo(neighborInfo)) return false;
    if (isWallLikeInfo(neighborInfo) || isPaneLikeInfo(neighborInfo)) return true;
    if (isWallSpecialConnection(neighborId)) return true;
    return isFullSolidConnectionBlock(neighborId, neighborInfo);
  }

  if (isPaneLikeInfo(sourceInfo)) {
    if (isFenceLikeInfo(neighborInfo)) return false;
    if (isPaneLikeInfo(neighborInfo) || isWallLikeInfo(neighborInfo)) return true;
    if (String(neighborId).includes('iron_bars')) return true;
    return isFullSolidConnectionBlock(neighborId, neighborInfo);
  }

  return false;
}

function isConnectableCell(layer, x, y, sourceInfo = null, sourceId = null) {
  if (!currentProject || !layer || x < 0 || x >= currentProject.width || y < 0 || y >= currentProject.height) return false;
  const neighborId = layer.cells[y * currentProject.width + x];
  return canConnectToNeighbor(sourceInfo, sourceId, neighborId);
}

function refreshConnectCell(layer, x, y) {
  if (!currentProject || !layer || x < 0 || x >= currentProject.width || y < 0 || y >= currentProject.height) return false;
  const index = y * currentProject.width + x;
  const textureId = layer.cells[index];
  const info = textureById.get(textureId);
  if (!info?.connectGroup) return false;

  const left = isConnectableCell(layer, x - 1, y, info, textureId);
  const right = isConnectableCell(layer, x + 1, y, info, textureId);
  const state = getConnectionState(left, right);
  const group = connectStateByGroup.get(info.connectGroup);
  const nextId = group?.[state];
  if (!nextId || nextId === textureId) return false;
  layer.cells[index] = nextId;
  return true;
}

function refreshConnectionsAround(layer, x, y) {
  if (!layer) return false;
  let changed = false;
  for (let dx = -1; dx <= 1; dx += 1) {
    changed = refreshConnectCell(layer, x + dx, y) || changed;
  }
  return changed;
}

function refreshAllConnections(project = currentProject) {
  if (!project?.layers) return;
  const previousProject = currentProject;
  currentProject = project;
  project.layers.forEach((layer) => {
    for (let y = 0; y < project.height; y += 1) {
      for (let x = 0; x < project.width; x += 1) refreshConnectCell(layer, x, y);
    }
  });
  currentProject = previousProject;
}

function getTextureImage(textureId) {
  if (!textureId || textureId === 1 || textureId === "black_test") return blackBlockTexture;
  if (renderedTextureCache.has(textureId)) return renderedTextureCache.get(textureId);

  const tintSpec = getTintSpec(textureId);
  if (!tintSpec) return getBaseTextureImage(textureId);

  let rendered = null;
  if (tintSpec.mode === "grass-side-composite") {
    rendered = createGrassSideCanvas();
  } else {
    rendered = createSelectiveTintedCanvas(getBaseTextureImage(textureId), tintSpec.color, 0.18);
  }

  if (rendered) {
    renderedTextureCache.set(textureId, rendered);
    return rendered;
  }

  return getBaseTextureImage(textureId);
}

function getTexturePreviewSrc(item) {
  if (!item?.id) return item?.preview || item?.src || "";
  if (previewSrcCache.has(item.id)) return previewSrcCache.get(item.id);

  const textureInfo = textureById.get(item.id);
  if (textureInfo?.generatedShape === "fence" || textureInfo?.generatedShape === "wall") {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const previewCtx = canvas.getContext("2d");
    previewCtx.clearRect(0, 0, 16, 16);
    if (drawGeneratedStructureCell(textureInfo, 0, 0, previewCtx, 16, false, null, 16, true)) {
      const src = canvas.toDataURL("image/png");
      previewSrcCache.set(item.id, src);
      return src;
    }
  }

  const textureAsset = getTextureImage(item.id);
  if (textureAsset instanceof HTMLCanvasElement) {
    const src = textureAsset.toDataURL("image/png");
    previewSrcCache.set(item.id, src);
    return src;
  }

  return item.preview || item.src;
}

function cloneProject(project) {
  return typeof structuredClone === "function" ? structuredClone(project) : JSON.parse(JSON.stringify(project));
}

function createLayer(name, width, height, fill = null) {
  return {
    id: randomId("layer"),
    name,
    type: "normal",
    cells: new Array(width * height).fill(fill),
  };
}

function snapshotLayers(layers) {
  return layers.map((layer) => ({ id: layer.id, name: layer.name, type: layer.type || "normal", depthShadeOff: Boolean(layer.depthShadeOff), cells: layer.cells.slice() }));
}

function normalizeProject(project) {
  const normalized = cloneProject(project);
  const width = Number(normalized.width) || 1;
  const height = Number(normalized.height) || 1;

  if (!Array.isArray(normalized.layers) || normalized.layers.length === 0) {
    const legacyCells = Array.isArray(normalized.cells) ? normalized.cells.slice() : new Array(width * height).fill(null);
    normalized.layers = [{ id: randomId("layer"), name: "Warstwa 1", cells: legacyCells.map((c) => (c === 0 ? null : c)) }];
  }

  normalized.layers = normalized.layers.slice(0, MAX_LAYERS).map((layer, index) => ({
    id: layer.id || randomId("layer"),
    name: layer.name || `Warstwa ${index + 1}`,
    type: layer.type || (layer.name === "Teren" ? "terrain" : "normal"),
    depthShadeOff: Boolean(layer.depthShadeOff),
    cells: Array.isArray(layer.cells) ? layer.cells.map((c) => (c === 0 ? null : c)) : new Array(width * height).fill(null),
  }));

  const expected = width * height;
  normalized.layers.forEach((layer) => {
    if (layer.cells.length < expected) {
      layer.cells = layer.cells.concat(new Array(expected - layer.cells.length).fill(null));
    }
    if (layer.cells.length > expected) {
      layer.cells = layer.cells.slice(0, expected);
    }
  });

  if (!normalized.currentLayerId || !normalized.layers.some((layer) => layer.id === normalized.currentLayerId)) {
    normalized.currentLayerId = normalized.layers[normalized.layers.length - 1].id;
  }

  normalized.depthShadingEnabled = Boolean(normalized.depthShadingEnabled);
  normalized.backgroundMode = normalized.backgroundMode || (normalized.backgroundColor === SKY_COLOR ? "sky" : "default");
  normalized.backgroundColor = normalized.backgroundMode === "sky" ? SKY_COLOR : null;
  normalized.cells = undefined;
  return normalized;
}

function getLayerIndexById(layerId) {
  if (!currentProject) return -1;
  return currentProject.layers.findIndex((layer) => layer.id === layerId);
}

function getActiveLayer() {
  if (!currentProject) return null;
  return currentProject.layers.find((layer) => layer.id === currentProject.currentLayerId) || currentProject.layers[currentProject.layers.length - 1] || null;
}

function getProjectBackgroundColor(project) {
  if (project?.backgroundMode === "sky") return SKY_COLOR;
  return getDefaultBackgroundColor();
}

function getEmptyLayerCount(layer) {
  return layer.cells.reduce((count, cell) => count + (cell ? 1 : 0), 0);
}

function isTerrainLayer(layer) {
  return layer?.type === "terrain" || layer?.name === "Teren";
}

function getFirstNonTerrainLayerId(project = currentProject) {
  if (!project?.layers) return null;
  return project.layers.find((layer) => !isTerrainLayer(layer))?.id || null;
}

function getBackNonTerrainLayerId(project = currentProject) {
  if (!project?.layers) return null;
  const normalLayers = project.layers.filter((layer) => !isTerrainLayer(layer));
  if (normalLayers.length < 2) return null;
  return normalLayers[0].id;
}

function getLayerDarkenAlpha(layer, project = currentProject) {
  if (!project || !layer || isTerrainLayer(layer)) return 0;
  if (!project.depthShadingEnabled) {
    return layer.id === getBackNonTerrainLayerId(project) ? 0.42 : 0;
  }
  if (layer.depthShadeOff) return 0;
  const normalLayers = project.layers.filter((entry) => !isTerrainLayer(entry) && !entry.depthShadeOff);
  const index = normalLayers.findIndex((entry) => entry.id === layer.id);
  if (index < 0) return 0;
  const depthFromFront = normalLayers.length - 1 - index;
  if (depthFromFront <= 0) return 0;
  return Math.min(0.46, 0.10 + depthFromFront * 0.10);
}

function buildFlatTerrainCells(width, height) {
  const cells = new Array(width * height).fill(null);
  const groundHeight = Math.max(2, Math.round(height / 3));
  const topY = Math.max(0, height - groundHeight);

  for (let x = 0; x < width; x += 1) {
    for (let y = topY; y < height; y += 1) {
      const depth = y - topY;
      let textureId = "dirt";
      if (depth === 0) textureId = "grass_block_side";
      else if (groundHeight >= 6 && depth >= Math.floor(groundHeight * 0.65)) textureId = "stone";
      cells[y * width + x] = textureId;
    }
  }

  return cells;
}

function buildRandomTerrainCells(width, height) {
  const cells = new Array(width * height).fill(null);
  const minGround = Math.max(2, Math.round(height * 0.22));
  const maxGround = Math.max(minGround + 1, Math.round(height * 0.42));
  const baseGround = Math.max(minGround, Math.round(height / 3));
  const rough = [];
  let currentGround = baseGround;

  for (let x = 0; x < width; x += 1) {
    // Małe kroki zamiast skoków: mniej zębów, więcej pagórków.
    currentGround += (Math.random() - 0.5) * 1.15;
    if (Math.random() < 0.08) currentGround += (Math.random() - 0.5) * 1.4;
    currentGround = Math.max(minGround, Math.min(maxGround, currentGround));
    rough.push(currentGround);
  }

  const smoothed = rough.map((_, x) => {
    let total = 0;
    let weight = 0;
    for (let offset = -3; offset <= 3; offset += 1) {
      const index = Math.max(0, Math.min(width - 1, x + offset));
      const localWeight = 4 - Math.abs(offset);
      total += rough[index] * localWeight;
      weight += localWeight;
    }
    return Math.round(total / weight);
  });

  for (let x = 0; x < width; x += 1) {
    const ground = Math.max(minGround, Math.min(maxGround, smoothed[x]));
    const topY = Math.max(0, height - ground);

    for (let y = topY; y < height; y += 1) {
      const depth = y - topY;
      let textureId = "dirt";
      if (depth === 0) textureId = "grass_block_side";
      else if (ground >= 5 && depth >= Math.floor(ground * 0.65)) textureId = "stone";
      cells[y * width + x] = textureId;
    }
  }

  return cells;
}

function buildProjectLayers(width, height, terrainMode) {
  const layers = [];

  if (terrainMode === "flat" || terrainMode === "random") {
    const terrainLayer = createLayer("Teren", width, height, null);
    terrainLayer.type = "terrain";
    terrainLayer.cells = terrainMode === "flat" ? buildFlatTerrainCells(width, height) : buildRandomTerrainCells(width, height);
    layers.push(terrainLayer);
    layers.push(createLayer("Warstwa 1", width, height, null));
  } else {
    layers.push(createLayer("Warstwa 1", width, height, null));
  }

  return layers;
}

function createProject({ name, width, height, skyEnabled, terrainMode }) {
  const layers = buildProjectLayers(width, height, terrainMode);
  currentProject = normalizeProject({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: name.trim() || "Projekt bez nazwy",
    width,
    height,
    layers,
    currentLayerId: layers[layers.length - 1].id,
    backgroundMode: skyEnabled ? "sky" : "default",
    backgroundColor: skyEnabled ? SKY_COLOR : null,
    thumbnail: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  openEditor();
}

function showView(viewName) {
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
  backToGalleryTop.classList.toggle("hidden", viewName === "gallery");
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function renderGallery() {
  galleryEl.innerHTML = "";
  const sortedProjects = [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  emptyGalleryEl.classList.toggle("hidden", sortedProjects.length > 0);

  sortedProjects.forEach((project) => {
    const normalized = normalizeProject(project);
    const card = document.createElement("article");
    card.className = "project-card panel";

    const thumb = document.createElement("img");
    thumb.className = "project-thumb";
    thumb.alt = `Miniatura projektu ${normalized.name}`;
    thumb.src = normalized.thumbnail || makePlaceholderThumbnail(normalized);

    const body = document.createElement("div");
    body.className = "project-card-body";

    const title = document.createElement("h3");
    title.textContent = normalized.name;

    const size = document.createElement("p");
    size.className = "project-size";
    size.textContent = `${normalized.width}×${normalized.height} bloków · ${normalized.layers.length} warstw`;

    const date = document.createElement("p");
    date.className = "project-date";
    date.textContent = `Aktualizacja: ${formatDate(normalized.updatedAt || normalized.createdAt || Date.now())}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "primary";
    openBtn.type = "button";
    openBtn.textContent = "Otwórz";
    openBtn.addEventListener("click", () => openProject(normalized.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "secondary";
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", () => deleteProject(normalized.id));

    actions.append(openBtn, deleteBtn);
    body.append(title, size, date, actions);
    card.append(thumb, body);
    galleryEl.append(card);
  });
}

function makePlaceholderThumbnail(project) {
  const bg = isDarkTheme() ? "%2324221f" : "%23f1f0eb";
  const fg = isDarkTheme() ? "%23f2f2f2" : "%23111111";
  const muted = isDarkTheme() ? "%23a9adb5" : "%236c6c6c";
  const safeName = String(project.name || "Projekt").replace(/[<>&"]/g, "");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
      <rect width="320" height="240" rx="18" fill="${bg}"/>
      <rect x="28" y="28" width="264" height="140" rx="12" fill="none" stroke="${muted}" stroke-dasharray="8 8" stroke-width="2"/>
      <text x="160" y="102" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${fg}">${safeName}</text>
      <text x="160" y="132" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="${muted}">${project.width}×${project.height} bloków</text>
      <text x="160" y="202" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="${muted}">${project.layers?.length || 1} warstw</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${svg.replace(/\n/g, "").trim()}`;
}

function openProject(projectId) {
  const savedProject = projects.find((project) => project.id === projectId);
  if (!savedProject) return;
  currentProject = normalizeProject(savedProject);
  openEditor();
}

async function deleteProject(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  const confirmed = confirm(`Usunąć projekt „${project.name}”?`);
  if (!confirmed) return;

  projects = projects.filter((item) => item.id !== projectId);

  if (isCloudMode()) {
    try {
      await deleteProjectFromCloud(projectId);
      setStatus("Projekt usunięty z chmury.");
    } catch (error) {
      console.error("Cloud delete error", error);
      setStatus("Projekt usunięty lokalnie, ale chmura zwróciła błąd.");
    }
  }

  await persistProjects();
  renderGallery();
}

function openEditor() {
  currentProject = normalizeProject(currentProject);
  refreshAllConnections(currentProject);
  editorProjectName.textContent = currentProject.name;
  editorProjectSize.textContent = `${currentProject.width}×${currentProject.height} bloków`;
  showGrid = true;
  gridBtn.textContent = "Ukryj siatkę";
  resetHistory();
  setTool("brush");
  updateSelectedTextureUI();
  renderPalette();
  renderLayerList();
  setStatus("");
  lastTransformTarget = null;
  showView("editor");
  fitCanvasToWindow();
}

function showCreateView() {
  projectNameInput.value = "";
  projectWidthInput.value = 32;
  projectHeightInput.value = 24;
  skyEnabledInput.checked = false;
  terrainModeInput.value = "none";
  showView("create");
}

function getViewportMetrics() {
  const rect = canvasViewport.getBoundingClientRect();
  const style = getComputedStyle(canvasViewport);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const contentWidth = Math.max(1, canvasViewport.clientWidth - paddingLeft - paddingRight);
  const contentHeight = Math.max(1, canvasViewport.clientHeight - paddingTop - paddingBottom);

  return {
    rect,
    paddingLeft,
    paddingTop,
    contentWidth,
    contentHeight,
    baseLeft: rect.left + paddingLeft + (contentWidth - canvas.width) / 2,
    baseTop: rect.top + paddingTop + (contentHeight - canvas.height) / 2,
  };
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampCanvasPan() {
  const metrics = getViewportMetrics();
  const margin = 80;
  const limitX = Math.max(0, (canvas.width - metrics.contentWidth) / 2) + margin;
  const limitY = Math.max(0, (canvas.height - metrics.contentHeight) / 2) + margin;
  panX = clampValue(panX, -limitX, limitX);
  panY = clampValue(panY, -limitY, limitY);
}

function applyCanvasPan() {
  canvas.style.transform = `translate(${Math.round(panX)}px, ${Math.round(panY)}px)`;
}

function resetCanvasPan() {
  panX = 0;
  panY = 0;
  applyCanvasPan();
}

function getWorldPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left) / tileSize, y: (clientY - rect.top) / tileSize };
}

function zoomCanvasAt(nextTileSize, clientX, clientY) {
  if (!currentProject) return;
  const nextSize = clampValue(Math.round(nextTileSize), MIN_TILE_SIZE, MAX_TILE_SIZE);
  if (nextSize === tileSize) return;

  const worldPoint = getWorldPointFromClient(clientX, clientY);
  autoFitMode = false;
  tileSize = nextSize;
  resizeCanvasToProject();
  drawCanvas();

  const metrics = getViewportMetrics();
  panX = clientX - metrics.baseLeft - worldPoint.x * tileSize;
  panY = clientY - metrics.baseTop - worldPoint.y * tileSize;
  clampCanvasPan();
  applyCanvasPan();
  updateZoomUI();
}

function getViewportCenter() {
  const rect = canvasViewport.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function handleCanvasWheel(event) {
  if (!currentProject) return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  const multiplier = direction > 0 ? 1.12 : 0.88;
  const scaledSize = tileSize * multiplier;
  const steppedSize = tileSize + direction * Math.max(1, Math.round(tileSize * 0.10));
  const nextSize = direction > 0 ? Math.max(scaledSize, steppedSize) : Math.min(scaledSize, steppedSize);
  zoomCanvasAt(nextSize, event.clientX, event.clientY);
}

function beginPanning(event) {
  if (!currentProject) return;
  event.preventDefault();
  finishDrawing();
  isPanning = true;
  panStart = { clientX: event.clientX, clientY: event.clientY, panX, panY };
  canvasViewport.classList.add("panning");
}

function updatePanning(event) {
  if (!isPanning || !panStart) return;
  if (event.preventDefault) event.preventDefault();
  panX = panStart.panX + event.clientX - panStart.clientX;
  panY = panStart.panY + event.clientY - panStart.clientY;
  clampCanvasPan();
  applyCanvasPan();
}

function queuePanningUpdate(event) {
  if (!isPanning || !panStart) return;
  event.preventDefault();
  queuedPanPoint = { clientX: event.clientX, clientY: event.clientY };
  if (panMoveQueued) return;
  panMoveQueued = true;
  requestAnimationFrame(() => {
    panMoveQueued = false;
    if (!queuedPanPoint) return;
    updatePanning(queuedPanPoint);
    queuedPanPoint = null;
  });
}

function endPanning() {
  if (!isPanning) return;
  isPanning = false;
  panStart = null;
  canvasViewport.classList.remove("panning");
}

function resizeCanvasToProject() {
  canvas.width = Math.max(1, Math.round(currentProject.width * tileSize));
  canvas.height = Math.max(1, Math.round(currentProject.height * tileSize));
  ctx.imageSmoothingEnabled = false;
  clearCellRenderCache();
}

function calculateFittedTileSize() {
  const canvasBox = canvas.parentElement;
  const availableWidth = Math.max(120, canvasBox.clientWidth - 40);
  const availableHeight = Math.max(120, canvasBox.clientHeight - 40);
  const fitX = Math.floor(availableWidth / currentProject.width);
  const fitY = Math.floor(availableHeight / currentProject.height);
  return Math.min(MAX_TILE_SIZE, Math.max(MIN_TILE_SIZE, Math.min(fitX, fitY)));
}

function fitCanvasToWindow() {
  if (!currentProject) return;
  autoFitMode = true;
  tileSize = calculateFittedTileSize();
  resizeCanvasToProject();
  resetCanvasPan();
  updateZoomUI();
  drawCanvas();
}

function hasHorizontalNeighbor(layer, x, y, direction, gridWidth) {
  if (!layer || !gridWidth) return false;
  const nx = x + direction;
  if (nx < 0 || nx >= gridWidth) return false;
  return Boolean(layer.cells[y * gridWidth + nx]);
}

function drawDarkenOverlay(targetCtx, x, y, w, h, alpha) {
  targetCtx.save();
  targetCtx.globalCompositeOperation = "source-atop";
  targetCtx.fillStyle = `rgba(0,0,0,${alpha})`;
  targetCtx.fillRect(x, y, w, h);
  targetCtx.restore();
}

function drawGeneratedStructureCell(textureInfo, x, y, targetCtx, targetTileSize, darken, layer, gridWidth, previewMode = false) {
  const baseImage = getTextureImage(textureInfo.baseId || textureInfo.id);
  if (!(baseImage instanceof HTMLCanvasElement || (baseImage.complete && baseImage.naturalWidth > 0))) return false;

  const connectLeft = previewMode ? false : hasHorizontalNeighbor(layer, x, y, -1, gridWidth);
  const connectRight = previewMode ? false : hasHorizontalNeighbor(layer, x, y, 1, gridWidth);
  const px = x * targetTileSize;
  const py = y * targetTileSize;
  const unit = targetTileSize / 16;
  const kind = textureInfo.generatedShape;
  const isWall = kind === "wall";
  const postW = (isWall ? 6 : 4) * unit;
  const postX = px + (targetTileSize - postW) / 2;
  const topLift = previewMode ? 0 : (isWall ? 0.10 : 0.12) * targetTileSize;
  const postY = py - topLift;
  const postH = targetTileSize + topLift;
  const armDarkAlpha = isWall ? 0.14 : 0.12;

  targetCtx.imageSmoothingEnabled = false;
  const srcPostX = Math.floor((16 - (isWall ? 6 : 4)) / 2);
  const srcPostW = isWall ? 6 : 4;
  targetCtx.drawImage(baseImage, srcPostX, 0, srcPostW, 16, postX, postY, postW, postH);

  if (isWall) {
    const armY = py + 4.0 * unit;
    const armH = 10.8 * unit;
    if (connectLeft) {
      const leftX = px;
      const leftW = postX + postW * 0.55 - leftX;
      targetCtx.drawImage(baseImage, 0, 2, 16, 12, leftX, armY, leftW, armH);
      drawDarkenOverlay(targetCtx, leftX, armY, leftW, armH, armDarkAlpha);
    }
    if (connectRight) {
      const rightX = postX + postW * 0.45;
      const rightW = px + targetTileSize - rightX;
      targetCtx.drawImage(baseImage, 0, 2, 16, 12, rightX, armY, rightW, armH);
      drawDarkenOverlay(targetCtx, rightX, armY, rightW, armH, armDarkAlpha);
    }
  } else {
    const armInset = 0;
    const upperY = py + 4.2 * unit;
    const lowerY = py + 7.8 * unit;
    const armH = 2 * unit;
    if (connectLeft) {
      const leftX = px + armInset;
      const leftW = postX + postW * 0.18 - leftX;
      targetCtx.drawImage(baseImage, 0, 4, 16, 2, leftX, upperY, leftW, armH);
      targetCtx.drawImage(baseImage, 0, 9, 16, 2, leftX, lowerY, leftW, armH);
      drawDarkenOverlay(targetCtx, leftX, upperY, leftW, armH, armDarkAlpha);
      drawDarkenOverlay(targetCtx, leftX, lowerY, leftW, armH, armDarkAlpha);
    }
    if (connectRight) {
      const rightX = postX + postW - postW * 0.18;
      const rightW = px + targetTileSize - armInset - rightX;
      targetCtx.drawImage(baseImage, 0, 4, 16, 2, rightX, upperY, rightW, armH);
      targetCtx.drawImage(baseImage, 0, 9, 16, 2, rightX, lowerY, rightW, armH);
      drawDarkenOverlay(targetCtx, rightX, upperY, rightW, armH, armDarkAlpha);
      drawDarkenOverlay(targetCtx, rightX, lowerY, rightW, armH, armDarkAlpha);
    }
  }

  if (darken) {
    drawDarkenOverlay(targetCtx, px, py - topLift, targetTileSize, targetTileSize + topLift, 0.32);
  }

  return true;
}

function drawTextureCell(textureId, x, y, targetCtx, targetTileSize, darken = false, layer = null, gridWidth = null) {
  const textureInfo = textureById.get(textureId) || null;
  if (textureInfo?.generatedShape === "fence" || textureInfo?.generatedShape === "wall") {
    if (drawGeneratedStructureCell(textureInfo, x, y, targetCtx, targetTileSize, darken, layer, gridWidth)) {
      return;
    }
  }

  const image = getTextureImage(textureId);
  const px = x * targetTileSize;
  const py = y * targetTileSize;

  if (image instanceof HTMLCanvasElement || (image.complete && image.naturalWidth > 0)) {
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(image, px, py, targetTileSize, targetTileSize);
  } else {
    targetCtx.fillStyle = "#111111";
    targetCtx.fillRect(px, py, targetTileSize, targetTileSize);
  }

  if (darken) {
    drawDarkenOverlay(targetCtx, px, py, targetTileSize, targetTileSize, 0.32);
  }
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = isDarkTheme() ? "rgba(255, 255, 255, 0.20)" : "rgba(30, 30, 30, 0.22)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= currentProject.width; x += 1) {
    const px = x * tileSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= currentProject.height; y += 1) {
    const py = y * tileSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }

  ctx.restore();
}

function scheduleCanvasRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!currentProject) return;
    if (pendingFullRender || !dirtyCellRect) {
      pendingFullRender = false;
      dirtyCellRect = null;
      drawCanvasNow();
      return;
    }
    const rect = dirtyCellRect;
    dirtyCellRect = null;
    drawCanvasRectNow(rect);
  });
}

function drawCanvas(reason = "change") {
  if (!currentProject) return;
  pendingRenderReason = reason || pendingRenderReason;
  pendingFullRender = true;
  dirtyCellRect = null;
  scheduleCanvasRender();
}

function mergeDirtyRect(nextRect) {
  if (!nextRect) return;
  if (!dirtyCellRect) {
    dirtyCellRect = { ...nextRect };
    return;
  }
  dirtyCellRect.x0 = Math.min(dirtyCellRect.x0, nextRect.x0);
  dirtyCellRect.y0 = Math.min(dirtyCellRect.y0, nextRect.y0);
  dirtyCellRect.x1 = Math.max(dirtyCellRect.x1, nextRect.x1);
  dirtyCellRect.y1 = Math.max(dirtyCellRect.y1, nextRect.y1);
}

function requestCanvasRedrawCells(x0, y0, x1, y1) {
  if (!currentProject) return;
  const rect = {
    x0: clampValue(Math.floor(x0), 0, currentProject.width - 1),
    y0: clampValue(Math.floor(y0), 0, currentProject.height - 1),
    x1: clampValue(Math.ceil(x1), 0, currentProject.width - 1),
    y1: clampValue(Math.ceil(y1), 0, currentProject.height - 1),
  };
  if (rect.x1 < rect.x0 || rect.y1 < rect.y0) return;
  const area = (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
  const total = currentProject.width * currentProject.height;
  if (area > Math.max(1200, total * 0.35)) {
    drawCanvas("large-dirty-area");
    return;
  }
  mergeDirtyRect(rect);
  scheduleCanvasRender();
}

function requestCanvasRedrawAround(x, y, radius = 1) {
  requestCanvasRedrawCells(x - radius, y - radius, x + radius, y + radius);
}

function drawCanvasNow() {
  if (!currentProject) return;
  const renderStart = performance.now();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getProjectBackgroundColor(currentProject);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const width = currentProject.width;
  const height = currentProject.height;
  currentProject.layers.forEach((layer) => {
    const darken = getLayerDarkenAlpha(layer, currentProject);
    const cells = layer.cells;
    for (let y = 0, row = 0; y < height; y += 1, row += width) {
      for (let x = 0; x < width; x += 1) {
        const cell = cells[row + x];
        if (cell) drawTextureCell(cell, x, y, ctx, tileSize, darken, layer, width);
      }
    }
  });

  if (showGrid) drawGrid();
  lastRenderMs = performance.now() - renderStart;
  pendingRenderReason = "";
}

function drawCanvasRectNow(rect) {
  if (!currentProject || !rect) return;
  const renderStart = performance.now();
  const width = currentProject.width;
  const x0 = clampValue(rect.x0, 0, currentProject.width - 1);
  const y0 = clampValue(rect.y0, 0, currentProject.height - 1);
  const x1 = clampValue(rect.x1, 0, currentProject.width - 1);
  const y1 = clampValue(rect.y1, 0, currentProject.height - 1);
  const px = x0 * tileSize;
  const py = y0 * tileSize;
  const pw = (x1 - x0 + 1) * tileSize;
  const ph = (y1 - y0 + 1) * tileSize;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.clearRect(px, py, pw, ph);
  ctx.fillStyle = getProjectBackgroundColor(currentProject);
  ctx.fillRect(px, py, pw, ph);

  currentProject.layers.forEach((layer) => {
    const darken = getLayerDarkenAlpha(layer, currentProject);
    const cells = layer.cells;
    for (let y = y0; y <= y1; y += 1) {
      const row = y * width;
      for (let x = x0; x <= x1; x += 1) {
        const cell = cells[row + x];
        if (cell) drawTextureCell(cell, x, y, ctx, tileSize, darken, layer, width);
      }
    }
  });

  if (showGrid) drawGrid();
  ctx.restore();
  lastRenderMs = performance.now() - renderStart;
}

function getIndex(x, y) {
  return y * currentProject.width + x;
}

function getCellFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((event.clientX - rect.left) * scaleX) / tileSize);
  const y = Math.floor(((event.clientY - rect.top) * scaleY) / tileSize);
  if (x < 0 || y < 0 || x >= currentProject.width || y >= currentProject.height) return null;
  return { x, y };
}

function findPaletteItemForTexture(textureId) {
  return paletteItems.find((item) => item.id === textureId) || textureItems.find((item) => item.id === textureId) || textureById.get(textureId) || null;
}

function pickTextureAtCell(x, y) {
  if (!currentProject) return null;
  const activeLayer = getActiveLayer();
  const index = getIndex(x, y);
  if (activeLayer?.cells?.[index]) return activeLayer.cells[index];
  for (let i = currentProject.layers.length - 1; i >= 0; i -= 1) {
    const layer = currentProject.layers[i];
    if (layer.id === activeLayer?.id) continue;
    const value = layer.cells[index];
    if (value) return value;
  }
  return null;
}

function cancelEyedropper(message = "Pipeta anulowana.") {
  setTool(pipettePreviousTool || "brush");
  setStatus(message);
}

function useEyedropperAtCell(x, y) {
  const textureId = pickTextureAtCell(x, y);
  if (!textureId) {
    cancelEyedropper("Kliknięto powietrze. Pipeta anulowana.");
    return false;
  }
  const item = findPaletteItemForTexture(textureId);
  selectedTexture = item || { id: textureId, label: textureId, category: "Inne", type: "block", src: "" };
  updateSelectedTextureUI();
  setTool("brush");
  renderPalette();
  setStatus(`Pobrano blok: ${selectedTexture.label || textureId}.`);
  return true;
}

function toggleEyedropper() {
  if (currentTool === "eyedropper") {
    cancelEyedropper("Pipeta anulowana.");
    return;
  }
  setTool("eyedropper");
  setStatus("Pipeta: kliknij blok na planszy. Aktywna warstwa ma pierwszeństwo.");
}

function paintCell(event, forceTool = null) {
  if (!currentProject) return false;
  const cell = getCellFromEvent(event);
  if (!cell) return false;
  const tool = forceTool || currentTool;

  if (tool === "eyedropper") return useEyedropperAtCell(cell.x, cell.y);
  if (tool === "eraser") return eraseCell(cell.x, cell.y);
  if (selectedTexture?.type === "door") return placeDoor(cell.x, cell.y);
  return placeSingleTexture(cell.x, cell.y, selectedTexture.id);
}

function placeSingleTexture(x, y, textureId) {
  const activeLayer = getActiveLayer();
  if (!activeLayer) return false;
  const index = getIndex(x, y);
  if (activeLayer.cells[index] === textureId) return false;
  activeLayer.cells[index] = textureId;
  refreshConnectionsAround(activeLayer, x, y);
  updateLastTransformTarget(x, y, activeLayer.cells[index], activeLayer.id);
  drawingChanged = true;
  requestCanvasRedrawAround(x, y, 1);
  return true;
}

function placeDoor(x, y) {
  const activeLayer = getActiveLayer();
  if (!activeLayer || !selectedTexture?.parts) return false;
  if (y === 0) {
    setStatus("Drzwi potrzebują dwóch kratek wysokości. Kliknij miejsce dolnej części drzwi.");
    return false;
  }

  const topIndex = getIndex(x, y - 1);
  const bottomIndex = getIndex(x, y);
  const topId = selectedTexture.parts.top.id;
  const bottomId = selectedTexture.parts.bottom.id;
  if (activeLayer.cells[topIndex] === topId && activeLayer.cells[bottomIndex] === bottomId) return false;

  activeLayer.cells[topIndex] = topId;
  activeLayer.cells[bottomIndex] = bottomId;
  refreshConnectionsAround(activeLayer, x, y);
  refreshConnectionsAround(activeLayer, x, y - 1);
  drawingChanged = true;
  lastTransformTarget = null;
  requestCanvasRedrawCells(x - 1, y - 2, x + 1, y + 1);
  return true;
}

function eraseCell(x, y) {
  const activeLayer = getActiveLayer();
  if (!activeLayer) return false;
  const index = getIndex(x, y);
  if (!activeLayer.cells[index]) return false;
  activeLayer.cells[index] = null;
  refreshConnectionsAround(activeLayer, x, y);

  if (lastTransformTarget?.x === x && lastTransformTarget?.y === y && lastTransformTarget?.layerId === activeLayer.id) {
    lastTransformTarget = null;
  }

  drawingChanged = true;
  requestCanvasRedrawAround(x, y, 1);
  return true;
}

function updateLastTransformTarget(x, y, textureId, layerId) {
  const textureInfo = textureById.get(textureId);
  if (!textureInfo?.transform) return;
  lastTransformTarget = { x, y, layerId };
}

function transformLastPlaced(mode) {
  if (!currentProject || !lastTransformTarget) {
    setStatus(mode === "rotate" ? "Nie ma ostatniego schodka do obrócenia." : "Nie ma ostatniego półbloku, schodka albo loga do odbicia.");
    return;
  }

  const layer = currentProject.layers.find((entry) => entry.id === lastTransformTarget.layerId);
  if (!layer) {
    lastTransformTarget = null;
    setStatus("Ostatni obiekt do obrotu nie istnieje już na warstwach.");
    return;
  }

  const { x, y } = lastTransformTarget;
  if (x < 0 || y < 0 || x >= currentProject.width || y >= currentProject.height) {
    lastTransformTarget = null;
    setStatus("Ostatni obiekt do obrotu nie jest już na planszy.");
    return;
  }

  const index = getIndex(x, y);
  const currentTextureId = layer.cells[index];
  const textureInfo = textureById.get(currentTextureId);
  const transformInfo = textureInfo?.transform;
  const nextId = mode === "rotate" ? transformInfo?.nextR : transformInfo?.nextT;

  if (!currentTextureId || !transformInfo || !nextId || !textureById.has(nextId)) {
    setStatus(mode === "rotate" ? "Ostatni obiekt nie ma obrotu R." : "Ostatni obiekt nie ma odbicia T.");
    return;
  }

  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  layer.cells[index] = nextId;
  lastTransformTarget = { x, y, layerId: layer.id };
  requestCanvasRedrawAround(x, y, 1);

  if (mode === "rotate") setStatus("Schodek obrócony o 90°. Ctrl+Z cofa zmianę.");
  else if (transformInfo.kind === "slab") setStatus("Półblok przeniesiony między dołem i górą kratki. Ctrl+Z cofa zmianę.");
  else if (transformInfo.kind === "log") setStatus("Log obrócony o 180°. Ctrl+Z cofa zmianę.");
  else setStatus("Schodek odbity w poziomie. Ctrl+Z cofa zmianę.");
}

function setTool(tool) {
  if (tool !== "eyedropper" && currentTool !== "eyedropper") pipettePreviousTool = tool;
  if (tool === "eyedropper" && currentTool !== "eyedropper") pipettePreviousTool = currentTool === "eraser" ? "eraser" : "brush";
  currentTool = tool;
  brushBtn.classList.toggle("active", tool === "brush");
  eraserBtn.classList.toggle("active", tool === "eraser");
  if (eyedropperBtn) eyedropperBtn.classList.toggle("active", tool === "eyedropper");
}

function resetHistory() {
  undoStack = [];
  redoStack = [];
  drawingSnapshot = null;
  drawingChanged = false;
}

function pushUndoSnapshot(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

function beginDrawing() {
  if (!currentProject || isDrawing) return;
  isDrawing = true;
  drawingSnapshot = snapshotLayers(currentProject.layers);
  drawingChanged = false;
}

function finishDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  if (drawingChanged && drawingSnapshot) {
    pushUndoSnapshot(drawingSnapshot);
    setStatus("Zmiana gotowa. Ctrl+Z cofa ostatni ruch.");
  }
  drawingSnapshot = null;
  drawingChanged = false;
}

function restoreLayersFromSnapshot(snapshot) {
  currentProject.layers = snapshot.map((layer) => ({ id: layer.id, name: layer.name, type: layer.type || (layer.name === "Teren" ? "terrain" : "normal"), depthShadeOff: Boolean(layer.depthShadeOff), cells: layer.cells.slice() }));
  if (!currentProject.layers.some((layer) => layer.id === currentProject.currentLayerId)) {
    currentProject.currentLayerId = currentProject.layers[currentProject.layers.length - 1]?.id || null;
  }
  renderLayerList();
  drawCanvas();
}

function undoLastChange() {
  if (!currentProject || undoStack.length === 0) {
    setStatus("Nie ma czego cofnąć.");
    return;
  }
  redoStack.push(snapshotLayers(currentProject.layers));
  const snapshot = undoStack.pop();
  restoreLayersFromSnapshot(snapshot);
  setStatus("Cofnięto ostatnią zmianę.");
}

function redoLastChange() {
  if (!currentProject || redoStack.length === 0) {
    setStatus("Nie ma czego przywrócić.");
    return;
  }
  undoStack.push(snapshotLayers(currentProject.layers));
  const snapshot = redoStack.pop();
  restoreLayersFromSnapshot(snapshot);
  setStatus("Przywrócono zmianę.");
}

function setZoom(nextTileSize) {
  if (!currentProject) return;
  const center = getViewportCenter();
  zoomCanvasAt(nextTileSize, center.x, center.y);
}

function updateZoomUI() {
  const percent = Math.round((tileSize / DEFAULT_TILE_SIZE) * 100);
  zoomValue.textContent = `${percent}%`;
  zoomOutBtn.disabled = tileSize <= MIN_TILE_SIZE;
  zoomInBtn.disabled = tileSize >= MAX_TILE_SIZE;
}

function getSearchScore(item, query) {
  const itemId = item.id.toLowerCase();
  const itemLabel = item.label.toLowerCase();
  const words = itemLabel.split(/\s+/);
  if (itemId === query || itemLabel === query) return 0;
  if (words.includes(query)) return 1;
  if (itemId.startsWith(query) || itemLabel.startsWith(query)) return 2;
  if (words.some((word) => word.startsWith(query))) return 3;
  const indexes = [itemId.indexOf(query), itemLabel.indexOf(query)].filter((index) => index >= 0);
  if (indexes.length > 0) return 10 + Math.min(...indexes);
  return 999;
}

function initTextureControls() {
  const counts = paletteItems.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  categorySelect.innerHTML = "";
  categorySelect.append(new Option(`Wszystkie (${paletteItems.length})`, "Wszystkie"));
  textureCategoryOrder.forEach((category) => {
    if (!counts[category]) return;
    categorySelect.append(new Option(`${category} (${counts[category]})`, category));
  });

  if (currentCategory && counts[currentCategory]) categorySelect.value = currentCategory;
  else categorySelect.value = "Wszystkie";

  textureSearch.addEventListener("input", renderPalette);
  categorySelect.addEventListener("change", () => {
    currentCategory = categorySelect.value;
    renderPalette();
  });
}

function getVariantBaseId(item) {
  const id = item.id || "";
  const markers = ["__slab", "__stair", "__fence", "__wall", "__button"];
  for (const marker of markers) {
    const pos = id.indexOf(marker);
    if (pos > 0) return id.slice(0, pos);
  }
  return null;
}

function getPaletteVariantsByBase() {
  const groups = new Map();
  paletteItems.forEach((item) => {
    const baseId = getVariantBaseId(item);
    if (!baseId) return;
    if (!groups.has(baseId)) groups.set(baseId, []);
    groups.get(baseId).push(item);
  });
  return groups;
}

function renderPalette() {
  const query = textureSearch.value.trim().toLowerCase();
  const category = categorySelect.value || currentCategory || "Wszystkie";
  const variantsByBase = getPaletteVariantsByBase();

  const basicFiltered = paletteItems
    .filter((item) => {
      const itemId = item.id.toLowerCase();
      const itemLabel = item.label.toLowerCase();
      const matchesCategory = category === "Wszystkie" || item.category === category;
      const matchesQuery = !query || itemLabel.includes(query) || itemId.includes(query);
      return query ? matchesQuery : matchesCategory;
    })
    .sort((a, b) => {
      if (!query) return 0;
      const aScore = getSearchScore(a, query);
      const bScore = getSearchScore(b, query);
      if (aScore !== bScore) return aScore - bScore;
      return a.label.localeCompare(b.label);
    });

  const filtered = [];
  const seen = new Set();
  basicFiltered.forEach((item) => {
    const baseId = getVariantBaseId(item);
    if (baseId) {
      const baseItem = paletteItems.find((entry) => entry.id === baseId);
      if (baseItem && !query) return;
    }
    if (seen.has(item.id)) return;
    filtered.push(item);
    seen.add(item.id);
    const variants = variantsByBase.get(item.id) || [];
    if (!query && variants.length && expandedPaletteGroups.has(item.id)) {
      variants.forEach((variant) => {
        if (!seen.has(variant.id) && (category === "Wszystkie" || variant.category === category)) {
          filtered.push(variant);
          seen.add(variant.id);
        }
      });
    }
  });

  texturePalette.innerHTML = "";
  filtered.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "texture-item";
    const baseId = getVariantBaseId(item);
    if (baseId) button.classList.add("variant-item");
    button.dataset.type = item.type;
    button.title = item.type === "door" ? `${item.label} — zajmuje 2 kratki wysokości` : item.label;
    button.classList.toggle("active", selectedTexture?.id === item.id);

    const img = document.createElement("img");
    img.alt = item.label;
    img.src = getTexturePreviewSrc(item);
    img.loading = "lazy";
    img.decoding = "async";
    button.append(img);

    const variants = variantsByBase.get(item.id) || [];
    if (!query && variants.length) {
      const badge = document.createElement("span");
      badge.className = "texture-group-badge";
      badge.textContent = expandedPaletteGroups.has(item.id) ? "−" : "+";
      button.append(badge);
      button.addEventListener("click", () => {
        if (expandedPaletteGroups.has(item.id)) expandedPaletteGroups.delete(item.id);
        else expandedPaletteGroups.add(item.id);
        selectedTexture = item;
        setTool("brush");
        updateSelectedTextureUI();
        renderPalette();
      });
    } else {
      button.addEventListener("click", () => {
        selectedTexture = item;
        setTool("brush");
        updateSelectedTextureUI();
        renderPalette();
      });
    }

    texturePalette.append(button);
  });

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "selected-texture";
    empty.textContent = "Brak bloków dla tego filtra.";
    texturePalette.append(empty);
  }
}

function updateSelectedTextureUI() {
  if (!selectedTexture) {
    selectedTextureName.textContent = "Wybrany blok: —";
    return;
  }
  const suffix = selectedTexture.type === "door" ? " · drzwi 1×2" : "";
  selectedTextureName.textContent = `Wybrany blok: ${selectedTexture.label}${suffix}`;
}

function renderLayerList() {
  if (!currentProject) {
    layerList.innerHTML = "";
    return;
  }

  if (depthShadingToggle) {
    depthShadingToggle.checked = Boolean(currentProject.depthShadingEnabled);
    depthShadingToggle.disabled = currentProject.layers.filter((layer) => !isTerrainLayer(layer)).length < 2;
  }

  layerList.innerHTML = "";
  currentProject.layers.forEach((layer, index) => {
    const item = document.createElement("div");
    item.className = "layer-item";
    item.draggable = true;
    item.dataset.layerId = layer.id;
    item.classList.toggle("active", layer.id === currentProject.currentLayerId);

    const main = document.createElement("div");
    main.className = "layer-main";

    const drag = document.createElement("span");
    drag.className = "layer-drag";
    drag.textContent = "⋮⋮";

    const nameWrap = document.createElement("div");
    nameWrap.className = "layer-name-wrap";

    const name = document.createElement("div");
    name.className = "layer-name";
    name.textContent = layer.name;

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    const blockCount = getEmptyLayerCount(layer);
    const alpha = getLayerDarkenAlpha(layer, currentProject);
    const extra = isTerrainLayer(layer) ? " · teren" : alpha > 0 ? ` · cień ${Math.round(alpha * 100)}%` : "";
    meta.textContent = `${blockCount}${extra}`;

    nameWrap.append(name, meta);
    main.append(drag, nameWrap);

    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = layer.id === currentProject.currentLayerId ? "primary layer-select-btn" : "secondary layer-select-btn";
    selectBtn.textContent = layer.id === currentProject.currentLayerId ? "Ed." : "Edytuj";
    selectBtn.addEventListener("click", () => setActiveLayer(layer.id));

    const depthBtn = document.createElement("button");
    depthBtn.type = "button";
    depthBtn.className = `secondary layer-depth-btn ${layer.depthShadeOff ? "off" : ""}`;
    depthBtn.textContent = isTerrainLayer(layer) ? "—" : "◐";
    depthBtn.title = layer.depthShadeOff ? "Włącz przyciemnianie tej warstwy" : "Wyłącz tę warstwę z przyciemniania";
    depthBtn.disabled = isTerrainLayer(layer);
    depthBtn.addEventListener("click", () => toggleLayerDepthShade(layer.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary layer-delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.disabled = currentProject.layers.length === 1;
    deleteBtn.addEventListener("click", () => deleteLayer(layer.id));

    item.append(main, selectBtn, depthBtn, deleteBtn);

    item.addEventListener("dragstart", (event) => {
      draggingLayerId = layer.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", layer.id);
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      const sourceId = draggingLayerId || event.dataTransfer.getData("text/plain");
      if (sourceId && sourceId !== layer.id) moveLayer(sourceId, layer.id);
      draggingLayerId = null;
    });
    item.addEventListener("dragend", () => {
      draggingLayerId = null;
      document.querySelectorAll(".layer-item.drag-over").forEach((entry) => entry.classList.remove("drag-over"));
    });

    layerList.append(item);
  });

  addLayerBtn.disabled = currentProject.layers.length >= MAX_LAYERS;
}

function setActiveLayer(layerId) {
  if (!currentProject) return;
  if (!currentProject.layers.some((layer) => layer.id === layerId)) return;
  currentProject.currentLayerId = layerId;
  renderLayerList();
  setStatus(`Aktywna warstwa: ${getActiveLayer().name}.`);
}

function toggleDepthShading() {
  if (!currentProject) return;
  currentProject.depthShadingEnabled = !currentProject.depthShadingEnabled;
  renderLayerList();
  drawCanvas();
  setStatus(currentProject.depthShadingEnabled ? "Przyciemnianie głębi włączone." : "Przyciemnianie głębi wyłączone. Zostaje tylko domyślna najgłębsza warstwa.");
}

function toggleLayerDepthShade(layerId) {
  if (!currentProject) return;
  const layer = currentProject.layers.find((entry) => entry.id === layerId);
  if (!layer || isTerrainLayer(layer)) return;
  layer.depthShadeOff = !layer.depthShadeOff;
  renderLayerList();
  drawCanvas();
  setStatus(layer.depthShadeOff ? "Ta warstwa nie będzie przyciemniana." : "Ta warstwa wraca do przyciemniania.");
}

function addLayer() {
  if (!currentProject) return;
  if (currentProject.layers.length >= MAX_LAYERS) {
    setStatus(`Maksymalnie ${MAX_LAYERS} warstwy.`);
    return;
  }

  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  const newLayer = createLayer(`Warstwa ${currentProject.layers.length + 1}`, currentProject.width, currentProject.height, null);
  currentProject.layers.push(newLayer);
  currentProject.currentLayerId = newLayer.id;
  renderLayerList();
  drawCanvas();
  setStatus("Dodano nową warstwę.");
}

function deleteLayer(layerId) {
  if (!currentProject) return;
  if (currentProject.layers.length === 1) {
    setStatus("Projekt musi mieć przynajmniej jedną warstwę.");
    return;
  }

  const layer = currentProject.layers.find((entry) => entry.id === layerId);
  if (!layer) return;
  const confirmed = confirm(`Usunąć warstwę „${layer.name}”?`);
  if (!confirmed) return;

  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  currentProject.layers = currentProject.layers.filter((entry) => entry.id !== layerId);
  if (currentProject.currentLayerId === layerId) currentProject.currentLayerId = currentProject.layers[currentProject.layers.length - 1].id;
  if (lastTransformTarget?.layerId === layerId) lastTransformTarget = null;
  renderLayerList();
  drawCanvas();
  setStatus("Warstwa usunięta.");
}

function moveLayer(sourceId, targetId) {
  if (!currentProject || sourceId === targetId) return;
  const sourceIndex = getLayerIndexById(sourceId);
  const targetIndex = getLayerIndexById(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  const [moved] = currentProject.layers.splice(sourceIndex, 1);
  const insertIndex = currentProject.layers.findIndex((layer) => layer.id === targetId);
  currentProject.layers.splice(insertIndex, 0, moved);
  renderLayerList();
  drawCanvas();
  setStatus("Kolejność warstw zmieniona.");
}

function makeThumbnail(project) {
  const normalized = normalizeProject(project);
  refreshAllConnections(normalized);
  const maxThumbSize = 220;
  const scale = Math.max(1, Math.floor(maxThumbSize / Math.max(normalized.width, normalized.height)));
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = normalized.width * scale;
  thumbCanvas.height = normalized.height * scale;
  const thumbCtx = thumbCanvas.getContext("2d");
  thumbCtx.imageSmoothingEnabled = false;
  thumbCtx.fillStyle = getProjectBackgroundColor(normalized);
  thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);

  normalized.layers.forEach((layer) => {
    const darken = getLayerDarkenAlpha(layer, normalized);
    for (let y = 0; y < normalized.height; y += 1) {
      for (let x = 0; x < normalized.width; x += 1) {
        const textureId = layer.cells[y * normalized.width + x];
        if (textureId) drawTextureCell(textureId, x, y, thumbCtx, scale, darken, layer, normalized.width);
      }
    }
  });

  return thumbCanvas.toDataURL("image/webp", 0.72);
}

function upsertCurrentProject() {
  const payload = cloneProject(currentProject);
  const existingIndex = projects.findIndex((project) => project.id === payload.id);
  if (existingIndex >= 0) projects[existingIndex] = payload;
  else projects.push(payload);
}

function clearCanvas() {
  if (!currentProject) return;
  const activeLayer = getActiveLayer();
  if (!activeLayer) return;
  const confirmed = confirm(`Wyczyścić tylko aktywną warstwę „${activeLayer.name}”?`);
  if (!confirmed) return;

  const hasBlocks = activeLayer.cells.some((cell) => Boolean(cell));
  if (!hasBlocks) {
    setStatus("Ta warstwa już jest pusta.");
    return;
  }

  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  activeLayer.cells.fill(null);
  if (lastTransformTarget?.layerId === activeLayer.id) lastTransformTarget = null;
  drawCanvas();
  renderLayerList();
  setStatus("Warstwa wyczyszczona. Ctrl+Z przywraca poprzedni stan.");
}

function setStatus(message) {
  statusMessage.textContent = message;
}

async function saveCurrentProject() {
  if (!currentProject) return;
  saveBtn.disabled = true;
  const previousText = saveBtn.textContent;
  saveBtn.textContent = "Zapisuję...";

  currentProject.updatedAt = Date.now();
  currentProject.thumbnail = makeThumbnail(currentProject);
  upsertCurrentProject();

  if (isCloudMode()) {
    try {
      await saveProjectToCloud(currentProject);
      await persistProjects();
      setStatus("Projekt zapisany w chmurze.");
      saveBtn.textContent = "Zapisano";
    } catch (error) {
      console.error("Cloud save error", error);
      const localSaved = await persistProjects();
      setStatus(localSaved ? "Chmura zwróciła błąd, ale projekt zapisano lokalnie." : "Błąd zapisu w chmurze i lokalnie.");
      saveBtn.textContent = localSaved ? "Zapis lokalny" : "Błąd zapisu";
    }

    setTimeout(() => {
      saveBtn.textContent = previousText;
      saveBtn.disabled = false;
    }, 1100);
    return;
  }

  const ok = await persistProjects();
  setStatus(ok ? "Projekt zapisany lokalnie." : "Nie udało się zapisać projektu.");
  saveBtn.textContent = ok ? "Zapisano" : "Błąd zapisu";
  setTimeout(() => {
    saveBtn.textContent = previousText;
    saveBtn.disabled = false;
  }, 900);
}

function isCloudMode() {
  return firebaseReady && firebaseDb && currentUser;
}

function updateAuthUI(customMessage = "") {
  if (customMessage) {
    authStatus.textContent = customMessage;
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }
  if (currentUser) {
    authStatus.textContent = currentUser.displayName || currentUser.email || "Zalogowano";
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    authStatus.textContent = "Tryb lokalny";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
}

function initFirebaseCloud() {
  if (!window.firebase || !window.FIREBASE_CONFIG) {
    updateAuthUI("Firebase nie jest gotowy. Sprawdź połączenie z internetem.");
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    firebaseDb = firebase.firestore();
    firebaseReady = true;

    firebaseAuth.onAuthStateChanged(async (user) => {
      currentUser = user;
      updateAuthUI();
      if (user) await loadCloudProjectsIntoGallery();
      else {
        projects = await loadProjects();
        renderGallery();
      }
    });
  } catch (error) {
    console.error("Firebase init error", error);
    updateAuthUI("Firebase zwrócił błąd konfiguracji.");
  }
}

async function signInWithGoogle() {
  if (!firebaseReady || !firebaseAuth) {
    alert("Firebase nie jest gotowy. Otwórz aplikację przez hosting i sprawdź internet.");
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebaseAuth.signInWithPopup(provider);
  } catch (error) {
    console.error("Google login error", error);
    alert(`Logowanie Google nie zadziałało: ${error.message}`);
  }
}

async function signOutGoogle() {
  if (!firebaseAuth) return;
  await firebaseAuth.signOut();
}

async function saveProjectToCloud(project) {
  if (!isCloudMode()) throw new Error("Brak zalogowanego użytkownika.");
  const cleanProject = cloneProject(project);
  cleanProject.ownerUid = currentUser.uid;
  cleanProject.cloudUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
  await firebaseDb.collection("users").doc(currentUser.uid).collection("projects").doc(project.id).set(cleanProject, { merge: true });
}

async function deleteProjectFromCloud(projectId) {
  if (!isCloudMode()) return;
  await firebaseDb.collection("users").doc(currentUser.uid).collection("projects").doc(projectId).delete();
}

async function loadCloudProjectsIntoGallery() {
  if (!isCloudMode()) return;
  try {
    const snapshot = await firebaseDb.collection("users").doc(currentUser.uid).collection("projects").orderBy("updatedAt", "desc").get();
    const cloudProjects = snapshot.docs.map((doc) => normalizeProject({ ...doc.data(), id: doc.data().id || doc.id }));

    if (cloudProjects.length === 0 && projects.length > 0) {
      const moveLocal = confirm("Nie masz jeszcze projektów w chmurze. Przenieść lokalne projekty na konto Google?");
      if (moveLocal) {
        for (const project of projects) {
          await saveProjectToCloud(normalizeProject(project));
        }
        setStatus("Lokalne projekty przeniesione do chmury.");
      }
    }

    const refreshed = await firebaseDb.collection("users").doc(currentUser.uid).collection("projects").orderBy("updatedAt", "desc").get();
    projects = refreshed.docs.map((doc) => normalizeProject({ ...doc.data(), id: doc.data().id || doc.id }));
    renderGallery();
    showView("gallery");
  } catch (error) {
    console.error("Cloud load error", error);
    setStatus("Nie udało się wczytać chmury. Pokazuję lokalną kopię.");
  }
}

function loadLegacyProjects() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) return JSON.parse(rawV2).map(normalizeProject);
  } catch (error) {
    console.warn("Nie udało się wczytać v2 z localStorage", error);
  }

  try {
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    return rawV1 ? JSON.parse(rawV1).map(normalizeProject) : [];
  } catch (error) {
    console.error("Nie udało się wczytać projektów z localStorage", error);
    return [];
  }
}

function openProjectDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB nie jest dostępne w tej przeglądarce."));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function loadProjects() {
  try {
    const db = await openProjectDatabase();
    const transaction = db.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const idbProjects = await idbRequest(store.getAll());
    db.close();
    if (idbProjects.length > 0) return idbProjects.map(normalizeProject);
  } catch (error) {
    console.warn("IndexedDB fallback to localStorage", error);
  }
  return loadLegacyProjects();
}

async function persistProjects() {
  const normalizedProjects = projects.map(normalizeProject);
  try {
    const db = await openProjectDatabase();
    const transaction = db.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    store.clear();
    normalizedProjects.forEach((project) => store.put(project));
    await idbDone(transaction);
    db.close();
    try {
      localStorage.setItem(`${STORAGE_KEY}.lastSave`, String(Date.now()));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedProjects));
    } catch (_) {}
    projects = normalizedProjects;
    return true;
  } catch (indexedError) {
    console.warn("IndexedDB save failed, trying localStorage", indexedError);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedProjects));
    projects = normalizedProjects;
    return true;
  } catch (localStorageError) {
    console.error("Save failed", localStorageError);
    return false;
  }
}

function applyTheme(theme) {
  const useDark = theme === "dark";
  document.body.classList.toggle("dark", useDark);
  darkModeToggle.checked = useDark;
  try {
    localStorage.setItem(THEME_KEY, useDark ? "dark" : "light");
  } catch (_) {}
  renderGallery();
  if (currentProject) drawCanvas();
}

function initSettings() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);

  settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
  settingsCloseBtn.addEventListener("click", () => settingsPanel.classList.add("hidden"));
  darkModeToggle.addEventListener("change", () => applyTheme(darkModeToggle.checked ? "dark" : "light"));
}

function backToGallery() {
  finishDrawing();
  currentProject = null;
  lastTransformTarget = null;
  renderGallery();
  showView("gallery");
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const width = Number(projectWidthInput.value);
  const height = Number(projectHeightInput.value);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    alert("Szerokość i wysokość muszą być pełnymi liczbami.");
    return;
  }
  if (width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
    alert(`Rozmiar projektu musi mieścić się w zakresie 1–${MAX_SIZE}.`);
    return;
  }

  createProject({
    name: projectNameInput.value,
    width,
    height,
    skyEnabled: skyEnabledInput.checked,
    terrainMode: terrainModeInput.value,
  });
}

function initEventListeners() {
  loginBtn.addEventListener("click", signInWithGoogle);
  logoutBtn.addEventListener("click", signOutGoogle);

  newProjectBtn.addEventListener("click", showCreateView);
  cancelCreateBtn.addEventListener("click", () => showView("gallery"));
  projectForm.addEventListener("submit", handleProjectSubmit);

  brushBtn.addEventListener("click", () => setTool("brush"));
  eraserBtn.addEventListener("click", () => setTool("eraser"));
  if (eyedropperBtn) eyedropperBtn.addEventListener("click", toggleEyedropper);

  gridBtn.addEventListener("click", () => {
    showGrid = !showGrid;
    gridBtn.textContent = showGrid ? "Ukryj siatkę" : "Pokaż siatkę";
    drawCanvas();
  });

  zoomOutBtn.addEventListener("click", () => setZoom(tileSize - ZOOM_STEP));
  zoomInBtn.addEventListener("click", () => setZoom(tileSize + ZOOM_STEP));
  zoomResetBtn.addEventListener("click", fitCanvasToWindow);

  saveBtn.addEventListener("click", saveCurrentProject);
  clearBtn.addEventListener("click", clearCanvas);
  backToGalleryBtn.addEventListener("click", backToGallery);
  backToGalleryTop.addEventListener("click", backToGallery);
  addLayerBtn.addEventListener("click", addLayer);
  if (depthShadingToggle) depthShadingToggle.addEventListener("change", toggleDepthShading);

  canvasViewport.addEventListener("wheel", handleCanvasWheel, { passive: false });
  canvasViewport.addEventListener("mousedown", (event) => {
    if (event.button === 1) beginPanning(event);
  });
  canvasViewport.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
      beginDrawing();
      paintCell(event);
    }
    if (event.button === 2) {
      beginDrawing();
      paintCell(event, "eraser");
    }
  });

  canvas.addEventListener("mousemove", (event) => {
    if (!isDrawing) return;
    if (event.buttons === 1) paintCell(event);
    if (event.buttons === 2) paintCell(event, "eraser");
  });

  window.addEventListener("mousemove", queuePanningUpdate);
  canvas.addEventListener("mouseleave", finishDrawing);
  window.addEventListener("mouseup", () => {
    endPanning();
    finishDrawing();
  });

  window.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

    if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      finishDrawing();
      toggleEyedropper();
      return;
    }

    if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      finishDrawing();
      transformLastPlaced("rotate");
      return;
    }

    if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      finishDrawing();
      transformLastPlaced("toggle");
      return;
    }

    const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
    const isRedo = ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z") || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y");

    if (isUndo) {
      event.preventDefault();
      finishDrawing();
      undoLastChange();
    }
    if (isRedo) {
      event.preventDefault();
      finishDrawing();
      redoLastChange();
    }
  });

  window.addEventListener("resize", () => {
    if (!currentProject) return;
    if (autoFitMode) fitCanvasToWindow();
    else {
      clampCanvasPan();
      applyCanvasPan();
    }
  });
}

async function initApp() {
  projects = (await loadProjects()).map(normalizeProject);
  initSettings();
  initTextureControls();
  initEventListeners();
  renderGallery();
  showView("gallery");
  initFirebaseCloud();
}


const EXTRA_LOG_TOP_TEXTURES = {"oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEVfSivCnWK4lF+vj1WfhE2WdEF+Yjd0WjZMPSZxHR9aAAAAbklEQVR42gXBgXHDQAwDMFD21dp/3CZ+BmA9lmdZZP+R5oziL+ZWTRHf3vgIUq70liYg2phtmUlmiI1rjuvFHPOeoVWJamMAIoRZoEeFjWvejLTa6XtTDiA1W6pte7AxkwbgPTFE44xyWCzPsg8/vNE4rPRQOg0AAAAASUVORK5CYII=", "spruce_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEVVOh+IZTmCYTp6WjRwUi5hSy5aRCREMyGYAvO9AAAAbUlEQVR42gXBgQGCQAwEsFxBuv+8yp8J67E8yyL7RZozik/MrZoifr3xFaRc6S1NQLQx2zKTzBAb1xzXiznmPUOrZlQbA0AIs8A5Kmxc82ak1U7fm3IAqdlSbduDjZk0AO+JIRpnlMNieZZ9+AOy9ziZ2vV1WgAAAABJRU5ErkJggg==", "birch_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAHlBMVEX////r6+fXy43XwYXIt3q4qHWun3aZloKllGdRT0evoDs+AAAAd0lEQVR42gXBgXGDAAwEML0hpN1/2Fw56o8UuW6XsffPJxoH0uwoNu/nZTVFPK/zHrcg5cgc7+okiURkpmUmmSHukcRsu0TNaq1Eten8ASKEAXRVyEQw54TWdV7/ZS1IzZRq2y7mxNEAVN4P0dhRNunvupVcxucLT5NCOX8f9bYAAAAASUVORK5CYII=", "jungle_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEWqeVS4h2S/jmtANhJjWCA+MBN9XSafcUqXakSPaPuWAAAAcElEQVR42gXBgW3DQAwEMJ78qL3/tG6A6ELmbxsdK73WHF90OyuLXHujKeKTEz6KhrvXabWg0u6ZLY+KV+RoyotHxawG963SzlyACOEA/qmyZwUPJdUT5QXEHCENpDjL3QBkXUkIQ5KTM9/ZGLZmrx8zZj1Pm5nxGwAAAABJRU5ErkJggg==", "acacia_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIVBMVEWtXTK6YzfCbT+PTCpXUklQTERLRz5pYllFQTqgVjCZUCtN/BeQAAAAdElEQVR42gXBwZGDQBAEMPUyVRzkHytnP5a2lHOnItqV7RgbTdcrMK/l1BTxyZR+ioarWdOzb9tqtZ035VbxiI6mvhu3ilWN03WptMdagAhhAP9U2bMF9/csqUyUhwfCJKSBlAyuBiD8JSEskkzmaNXBjsgPVh5AXVFU4csAAAAASUVORK5CYII=", "dark_oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIVBMVEVJLxdPMhg/MR1KOB4pIBEwJRMzJxUwHg5TOBo+KRI6JBHZh6VgAAAAeElEQVR42gXBgQHDMAzDMNJu2kj//7sBvLOz88zsO7Pn5agiF1SH9fvaNEnau4zfvaqo9WGoAACG5THSJi2WYSl8AIV6GCIlIRh2AABEEDhEChAow1BpvyYYHpYIAGB5R0FUvQCsadq2beswKggX1LNnwFV/zML+AdWaBDYLCQhZAAAAAElFTkSuQmCC", "mangrove_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAHlBMVEVaSCxnUjB/QjR3OTROPydvKi1ENSJkJCM8LyNdHB55mjQvAAAAcUlEQVR42gXBgVHAMAwEMPlruv+6HOkH6dn93s/7490z7HiQ5nsUM5MXTRG/XfwapLxjb0xAtPlWy6o4UpGE0x6im9EiUW0EIEKcAHpUsARLaVnKAaS7t9EU7nB2r7cB6MxeovE9ysR8c8/z/O1z288/JU8+QcQuA1gAAAAASUVORK5CYII=", "cherry_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEXmta3nvrTNhYA7Iy0nFiDnx7swHSnhqKHdnZd/SqPFAAAAeElEQVR42gXBgWHDIBAEMB2PDftP28YxHylTlzfGSzQzScRFkszUiVun8aiTOilfdEgPZQcgS80EW4s/jyibAZuRGnTc1tJydQ2ACI93BvindWS0YI+9yKXdVgCy1TghkiSXj6TOnQ4+UJ06tLTra3JSadHqtIzXD840KrxpFWQFAAAAAElFTkSuQmCC", "pale_oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIVBMVEXn4+H67+5eU1BOQ0BuZGJ9cnBDOznHuLj/+/jdzs3SxseWkpe2AAAAdklEQVR42j2PWwoDMBACx83mofc/cClJO+CPqCA1a/WorquiJAlxQJImQ3snjm0npyjtc25KihZNxEOmKVkkdoLCYBDYAIGoKCyCjW+lnxGCwj8BGN6GSHZsZOpWHgrNkiX05dwNOc4PDaYkEO9dUfX/3qtmfwDuEgOfF/Y/MAAAAABJRU5ErkJggg==", "stripped_oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEXCnWK4lF+vj1WfhE2WdEGIcUOEbUB9Zzl+YjcgPPjAAAAAaklEQVR42gXBgQ3DMAwDMMoL2v+/HYbAGpl3TUMp0+MizY7iObyuJiTuHnwFKZ/MkZuAaOO0ZVSsdCdJnG2XqKF1JaqNAYgQM4CuCp0VzDOhZUbZ/W1LGKXatoscfBqAOqy0saNsXjsA8Ae8skMjOIfh/AAAAABJRU5ErkJggg==", "stripped_spruce_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEVnVjGIZTmCYTp6WjRwUi5hUS1hSy5aRCTdDIXKAAAAb0lEQVR42gXBgWHDMAwDMFCO/v93acwBWOwuy272Q5o7ivuw6k7IeMXsnyDl+Z1HmoDozTvbyznJOQwjE/naj+ieU016ppTfvACG4QF8XMEwOM8JvZytpr2F045SbduLffDcAagYonFHuWFf9oXFP1MnOWpuViRJAAAAAElFTkSuQmCC", "stripped_birch_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEWxmGDXy43XwYXIt3q4qHWun3allGenjlYhxhGfAAAAaUlEQVR42gXBgW3DAAwDMMoJ5v/PHbpaIy2sXWBjkOZGcdnPq5oi/n5i3o8g5fneK01AtPFqGRUnNZtErj2ihlYlqo0BiBDmF+ipYFYwz4TWxpMLoM99Z0u1bQ9ePA1AvZy0caMsLGAX/22KOXSg8lEzAAAAAElFTkSuQmCC", "stripped_jungle_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEW/jmu4h2Sih1CfhE2eg0yqeVSXfEWfcUqXakSzZxaGAAAAdklEQVR42k2PUQoDUQgDHWtM7n/isu9toYP4IRkktTv96b10Ty2AUEkAU0OSOLad1NaSqpuC0DUKesH61GCU2ImIplrRM2ddxSiyZWFN7XuIjrIncRVL0dwvSeJ/5XKVxiAeiqPgOD9OF5DQ265rpmd3eh529wtvjgScRi+eqAAAAABJRU5ErkJggg==", "stripped_acacia_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEWZXDvCbT+6YzetXTKgVjCTVzaZUCuPTCqORTQHAAAAbklEQVR42gXBgWHDMAwDMFCO/v93acwBWOwuCzFIc0dxs9+qOxfjbcz+CVKe33mkCYjevLO9nJOcwzAyka/9iO451aQJym9ewBiGAfRzBcPgPCf0craa9hZOO0q1bS/2wXMHoGKIxh3lYrFgd/0Dvcc5aiA5j7wAAAAASUVORK5CYII=", "stripped_dark_oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAHlBMVEVJLxdPMhg1KxwzKRo4LR02KxwwHg5TOBo+KRI6JBHVleYjAAAAb0lEQVR42gXBgW3DMBAAMZ6sIvb+w6ZIEX3JloYYDawqeVF1dZ0fl2mQ87eHzgcT92f58QTQbe3T8Bh5iz3T+H7wGLWYXO7baKYFkIgN+GUMZxOe7zU07HWGNyCWSFUvtId7Am5xVcSLarVPQwMx/yKbK5CkVcbXAAAAAElFTkSuQmCC", "stripped_mangrove_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEVvKi13OTRtLC1vLi11MTF/QjRkJCNdHB6VDVg0AAAAaklEQVR42gXBgZHiQAAEMbVZTP7h8sV7TupSHsBlXlXypurV+X9jDXl2Hh4/LO7f65jfwLQ9p8bH5CtOa3zxMXXNwn2bNtcAiTiAf8xwEj6MpsP4ArKrSFVv7Ix7Abfyqog31dVFS7bL5g/DZjBrOR7XOwAAAABJRU5ErkJggg==", "stripped_cherry_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEXmta3nvrTNhYDJfXnnx7vSiY3hqKHdnZdeNAZfAAAAcUlEQVR42gXBgQHCIBAEsNwDZf9x1cKbpEQLmoFKEjFJkpXqWDqNV92sN+WgQ7osOwB5jHmCrcXHqw2bgk1lFR3L82iZrQAivM4EfGkdqRbs2g+ZKE8Aso0SIkky/XTGXengB3UzLi1tHoObQQ8n0PgDqM8nozdocJsAAAAASUVORK5CYII=", "stripped_pale_oak_log_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEX/+/j48PD67+7w5+Xn4+Hdzs3SxsfHuLg88d1iAAAAa0lEQVR42gXBgU0AQQwDMCc99p8X9GqxYZJJEBJFt9+z2OiPcznEnzfnV9Hl9cbkJkkkl+yzoU6snLap7N1Sq+vWSZy9pgARQg+4dUofQXPHxj6OBeS87NgubGl0cgH4Nkptfc+yQpBMMvgH29o1RQUPt3IAAAAASUVORK5CYII=", "crimson_stem_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIVBMVEV+OlaGPlpLJzdEITFSGBCUGBh7AACsICCSQWBqNEtcMEKulrNuAAAAd0lEQVR42l2PUQpDMQzD5CTdq33/A4/RjsH0aQxCdM+ras0zXb2mGUlCbJCkYakqcWw72YtW7X1eUtQUEReZomWR2AkKzRAogEA0PFgEGyPzMHcIQWFYZwAMYR1LUrGPpfBPG6pGIPRhA8PIcb5oaEkgbl3zn/8G7dkDmThPB7sAAAAASUVORK5CYII=", "warped_stem_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAJFBMVEU5g4I6jow2nZEfV1JFLVxEITEWfoZLJzcRm4UWYVsocGcuX1HTWU5bAAAAeklEQVR42l3PQQ7DMBBC0Y89Yydw//s2VdxN3xIhIeiue+9VV/XuVU3pgRigR7E0Z+L4kYxFa47xtqSo2UQcMpuWRWInKDRFYAIEouLCItgYmYs6QQgKxXoDwBDWu5LM2O/KxuJQ2NyyhL6Gwk3JcX5UtCQQ513zf/8DO1YEREMOJkQAAAAASUVORK5CYII=", "stripped_crimson_stem_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAGFBMVEWAOFOUP2GGPlqJOVt+OlZqNEtcMEJLJzfsrATwAAAAaElEQVR42gXBgQ0CMAwDMCcb//8LWosdx8sSyksUnb5jMNGPtVnErxdfQYebd3VTULOdmwm1YmRPt6nM7lCj7FiJNVsFiBCvgB2r5B5Bs8uE++4ygKxrjunAhr24mwJGlJp6xxAcAPAH2Gc3NKt0b1IAAAAASUVORK5CYII=", "stripped_warped_stem_top": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAG1BMVEU5g4I6jowxjYwuX1EocGc7mZc2lI42nZEfV1JGbz83AAAAbUlEQVQYGQXBARKCQAwEsGxbBv//XOGsSaqdeRmWMypJxE2SVGpvj2yw5jfY+WJDfaN0ADJq5gkt1rFaaT7QdK4i8ZgRySqAtawzgJdYZvq36OsJCXOE44ClhEiS3HgHlQVvCZWEcJPkSukDAH/MTiSDDDlZvQAAAABJRU5ErkJggg=="};
const LOG_SIDE_TEXTURE_IDS = [
  "oak_log","spruce_log","birch_log","jungle_log","acacia_log","dark_oak_log","mangrove_log","cherry_log","pale_oak_log",
  "stripped_oak_log","stripped_spruce_log","stripped_birch_log","stripped_jungle_log","stripped_acacia_log","stripped_dark_oak_log","stripped_mangrove_log","stripped_cherry_log","stripped_pale_oak_log",
  "crimson_stem","warped_stem","stripped_crimson_stem","stripped_warped_stem"
];
let hoverCell = null;
const specialCanvasCache = new Map();

function enhanceTextureInfoEntry(info, item) {
  info.id = item.id;
  info.label = item.label;
  info.src = item.src;
  info.transform = item.transform || null;
  info.generatedShape = item.generatedShape || null;
  info.baseId = item.baseId || item.id;
  info.connectKind = item.connectKind || null;
  info.connectBaseId = item.connectBaseId || null;
  info.connectState = item.connectState || null;
  info.connectGroup = item.connectGroup || null;
  info.renderKind = item.renderKind || null;
  info.renderBaseId = item.renderBaseId || item.baseId || item.id;
  info.renderRotate = item.renderRotate || 0;
  info.trapdoorMode = item.trapdoorMode || null;
  info.trapdoorRot = item.trapdoorRot || 0;
  info.trapdoorFlip = Boolean(item.trapdoorFlip);
  info.buttonRot = item.buttonRot || 0;
  info.height = item.height || 1;
  info.hidden = Boolean(item.hidden);
}

function registerTextureItem(item, afterId = null) {
  if (!item || !item.id) return item;
  const insertInto = (arr, value) => {
    if (!Array.isArray(arr)) return;
    const existingIndex = arr.findIndex((entry) => entry.id === value.id);
    if (existingIndex >= 0) arr.splice(existingIndex, 1);
    let index = -1;
    if (afterId) index = arr.findIndex((entry) => entry.id === afterId);
    if (index >= 0) arr.splice(index + 1, 0, value);
    else arr.push(value);
  };

  insertInto(textureItems, item);
  if (!item.hidden) insertInto(paletteItems, item);
  const existing = textureById.get(item.id) || {};
  enhanceTextureInfoEntry(existing, item);
  textureById.set(item.id, existing);
  if (item.connectGroup && item.connectState) {
    if (!connectStateByGroup.has(item.connectGroup)) connectStateByGroup.set(item.connectGroup, {});
    connectStateByGroup.get(item.connectGroup)[item.connectState] = item.id;
  }
  return item;
}

function getItemById(id) {
  return textureItems.find((item) => item.id === id) || null;
}

function ensureLogTopPaletteItems() {
  Object.entries(EXTRA_LOG_TOP_TEXTURES).forEach(([topId, src]) => {
    const sideId = topId.replace(/_top$/, "");
    const baseItem = getItemById(sideId);
    if (!baseItem || getItemById(topId)) return;
    registerTextureItem({
      id: topId,
      label: `${baseItem.label} top`,
      category: baseItem.category,
      type: "block",
      src,
      height: 1,
    }, sideId);
  });
}

function ensureHorizontalLogVariants() {
  LOG_SIDE_TEXTURE_IDS.forEach((id) => {
    const item = getItemById(id);
    const info = textureById.get(id);
    if (!item || !info || getItemById(`${id}__side_h`)) return;
    registerTextureItem({
      id: `${id}__side_h`,
      label: `${item.label} horizontal`,
      category: item.category,
      type: "block",
      src: item.src,
      height: 1,
      hidden: true,
      renderKind: "rotatedTexture",
      renderBaseId: id,
      renderRotate: 90,
      transform: { kind: "log", nextT: id },
    });
    item.transform = { kind: "log", nextT: `${id}__side_h` };
    enhanceTextureInfoEntry(info, item);
  });
}

function createTrapdoorVariantId(baseId, mode, rot, flip) {
  if (mode === "top" && rot === 0 && !flip) return baseId;
  return `${baseId}__${mode}_r${rot}${flip ? "_m" : ""}`;
}

function ensureTrapdoorVariants() {
  const baseTrapdoors = textureItems.filter((item) => !item.hidden && /_trapdoor$/.test(item.id) && !item.id.includes("__"));
  baseTrapdoors.forEach((item) => {
    const baseId = item.id;
    const baseInfo = textureById.get(baseId);
    if (!baseInfo) return;

    const allStates = [];
    ["top", "side"].forEach((mode) => {
      [0, 90, 180, 270].forEach((rot) => {
        [false, true].forEach((flip) => {
          allStates.push({ mode, rot, flip });
        });
      });
    });

    allStates.forEach((state) => {
      const variantId = createTrapdoorVariantId(baseId, state.mode, state.rot, state.flip);
      const nextR = createTrapdoorVariantId(baseId, state.mode, (state.rot + 90) % 360, state.flip);
      const nextT = createTrapdoorVariantId(baseId, state.mode, state.rot, !state.flip);
      const nextE = createTrapdoorVariantId(baseId, state.mode === "top" ? "side" : "top", state.rot, state.flip);
      if (variantId === baseId) {
        item.renderKind = "trapdoor";
        item.renderBaseId = baseId;
        item.trapdoorMode = state.mode;
        item.trapdoorRot = state.rot;
        item.trapdoorFlip = state.flip;
        item.transform = { kind: "trapdoor", nextR, nextT, nextE };
        enhanceTextureInfoEntry(baseInfo, item);
      } else if (!getItemById(variantId)) {
        registerTextureItem({
          id: variantId,
          label: `${item.label} ${state.mode}`,
          category: item.category,
          type: "block",
          src: item.src,
          height: 1,
          hidden: true,
          renderKind: "trapdoor",
          renderBaseId: baseId,
          trapdoorMode: state.mode,
          trapdoorRot: state.rot,
          trapdoorFlip: state.flip,
          transform: { kind: "trapdoor", nextR, nextT, nextE },
        });
      }
    });
  });
}

const GLASS_PANE_BASE_IDS = [
  "glass", "tinted_glass", "iron_bars",
  "white_stained_glass", "light_gray_stained_glass", "gray_stained_glass", "black_stained_glass",
  "brown_stained_glass", "red_stained_glass", "orange_stained_glass", "yellow_stained_glass",
  "lime_stained_glass", "green_stained_glass", "cyan_stained_glass", "light_blue_stained_glass",
  "blue_stained_glass", "purple_stained_glass", "magenta_stained_glass", "pink_stained_glass"
];

function createGlassPaneVariantId(baseId, state) {
  return `${baseId}__pane_${state}`;
}

function ensureGlassPaneVariants() {
  GLASS_PANE_BASE_IDS.forEach((baseId) => {
    const item = getItemById(baseId);
    const info = textureById.get(baseId);
    if (!item || !info) return;
    ["none", "l", "r", "lr"].forEach((state) => {
      const variantId = createGlassPaneVariantId(baseId, state);
      if (!getItemById(variantId)) {
        registerTextureItem({
          id: variantId,
          label: `${item.label} pane`,
          category: item.category,
          type: "block",
          src: item.src,
          height: 1,
          hidden: true,
          connectKind: "pane",
          connectBaseId: baseId,
          connectState: state,
          connectGroup: `${baseId}__pane`,
          transform: { kind: "glassPane", nextE: baseId },
        });
      }
    });
    item.transform = { ...(item.transform || {}), kind: "glassPane", nextE: createGlassPaneVariantId(baseId, "none") };
    enhanceTextureInfoEntry(info, item);
  });
}

const BUTTON_BASE_IDS = [
  "oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks", "dark_oak_planks",
  "mangrove_planks", "cherry_planks", "bamboo_planks", "pale_oak_planks", "crimson_planks", "warped_planks",
  "stone", "polished_blackstone"
];

function createButtonVariantId(baseId, rot) {
  return rot === 0 ? `${baseId}__button` : `${baseId}__button_r${rot}`;
}

function ensureButtonVariants() {
  BUTTON_BASE_IDS.forEach((baseId) => {
    const item = getItemById(baseId);
    const info = textureById.get(baseId);
    if (!item || !info) return;
    [0, 90, 180, 270].forEach((rot) => {
      const variantId = createButtonVariantId(baseId, rot);
      const nextR = createButtonVariantId(baseId, (rot + 90) % 360);
      if (rot === 0) {
        if (!getItemById(variantId)) {
          registerTextureItem({
            id: variantId,
            label: `${item.label} button`,
            category: item.category,
            type: "block",
            src: item.src,
            height: 1,
            renderKind: "button",
            renderBaseId: baseId,
            buttonRot: rot,
            transform: { kind: "button", nextR },
          }, baseId);
        } else {
          const existing = getItemById(variantId);
          existing.renderKind = "button";
          existing.renderBaseId = baseId;
          existing.buttonRot = rot;
          existing.transform = { kind: "button", nextR };
          enhanceTextureInfoEntry(textureById.get(variantId) || {}, existing);
        }
      } else if (!getItemById(variantId)) {
        registerTextureItem({
          id: variantId,
          label: `${item.label} button`,
          category: item.category,
          type: "block",
          src: item.src,
          height: 1,
          hidden: true,
          renderKind: "button",
          renderBaseId: baseId,
          buttonRot: rot,
          transform: { kind: "button", nextR },
        });
      }
    });
  });
}

function applyStructureAndTextureAugmentations() {
  ensureLogTopPaletteItems();
  ensureHorizontalLogVariants();
  ensureTrapdoorVariants();
  ensureGlassPaneVariants();
  ensureButtonVariants();
}

function getSpecialCanvasCache(key, renderer) {
  if (specialCanvasCache.has(key)) return specialCanvasCache.get(key);
  const canvas = renderer();
  if (canvas) specialCanvasCache.set(key, canvas);
  return canvas;
}

function getTransformedTextureCanvas(baseId, rotate = 0, flip = false) {
  const key = `transform:${baseId}:${rotate}:${flip ? 1 : 0}`;
  return getSpecialCanvasCache(key, () => {
    const baseImage = getBaseTextureImage(baseId);
    if (!(baseImage instanceof HTMLCanvasElement || (baseImage.complete && baseImage.naturalWidth > 0))) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.save();
    c.translate(8, 8);
    if (flip) c.scale(-1, 1);
    if (rotate) c.rotate((rotate * Math.PI) / 180);
    c.drawImage(baseImage, -8, -8, 16, 16);
    c.restore();
    return canvas;
  });
}

function drawMaskedBaseRect(baseImage, targetCtx, cellX, cellY, cellSize, rectX, rectY, rectW, rectH) {
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(rectX, rectY, rectW, rectH);
  targetCtx.clip();
  targetCtx.imageSmoothingEnabled = false;
  targetCtx.drawImage(baseImage, cellX, cellY, cellSize, cellSize);
  targetCtx.restore();
}

function getTrapdoorEdgeCanvas(baseId, rotate = 0, flip = false, orientation = "horizontal") {
  const key = `trapedge:${baseId}:${rotate}:${flip ? 1 : 0}:${orientation}`;
  return getSpecialCanvasCache(key, () => {
    const transformed = getTransformedTextureCanvas(baseId, rotate, flip);
    if (!transformed) return null;

    const strip = document.createElement("canvas");
    strip.width = 16;
    strip.height = 3;
    const stripCtx = strip.getContext("2d");
    stripCtx.imageSmoothingEnabled = false;
    stripCtx.drawImage(transformed, 0, 0, 16, 3, 0, 0, 16, 3);

    if (orientation === "horizontal") return strip;

    const out = document.createElement("canvas");
    out.width = 3;
    out.height = 16;
    const outCtx = out.getContext("2d");
    outCtx.imageSmoothingEnabled = false;
    outCtx.save();
    if (orientation === "left") {
      outCtx.translate(0, 16);
      outCtx.rotate(-Math.PI / 2);
    } else {
      outCtx.translate(3, 0);
      outCtx.rotate(Math.PI / 2);
    }
    outCtx.drawImage(strip, 0, 0);
    outCtx.restore();
    return out;
  });
}

function drawConnectShapeCell(textureInfo, x, y, targetCtx, targetTileSize, darken = false) {
  const baseId = textureInfo.connectBaseId || textureInfo.baseId || textureInfo.id;
  const baseImage = getTextureImage(baseId);
  if (!(baseImage instanceof HTMLCanvasElement || (baseImage.complete && baseImage.naturalWidth > 0))) return false;

  const state = textureInfo.connectState || "none";
  const connectLeft = state.includes("l");
  const connectRight = state.includes("r");
  const kind = textureInfo.connectKind;
  const isWall = kind === "wall";
  const isPane = kind === "pane";
  const px = x * targetTileSize;
  const py = y * targetTileSize;
  const unit = targetTileSize / 16;

  if (isPane) {
    const paneW = 2 * unit;
    const paneX = px + (targetTileSize - paneW) / 2;
    if (connectLeft && connectRight) {
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, px, py, targetTileSize, targetTileSize);
      if (darken) drawDarkenOverlay(targetCtx, px, py, targetTileSize, targetTileSize, typeof darken === "number" ? darken : 0.36);
      return true;
    }
    if (connectLeft) {
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, px, py, targetTileSize / 2, targetTileSize);
      if (darken) drawDarkenOverlay(targetCtx, px, py, targetTileSize / 2, targetTileSize, typeof darken === "number" ? darken : 0.36);
      return true;
    }
    if (connectRight) {
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, px + targetTileSize / 2, py, targetTileSize / 2, targetTileSize);
      if (darken) drawDarkenOverlay(targetCtx, px + targetTileSize / 2, py, targetTileSize / 2, targetTileSize, typeof darken === "number" ? darken : 0.36);
      return true;
    }
    drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, paneX, py, paneW, targetTileSize);
    if (darken) drawDarkenOverlay(targetCtx, paneX, py, paneW, targetTileSize, typeof darken === "number" ? darken : 0.36);
    return true;
  }

  const postW = (isWall ? 7 : 4) * unit;
  const postX = px + (targetTileSize - postW) / 2;
  drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, postX, py, postW, targetTileSize);

  if (isWall) {
    const armY = py + 3.2 * unit;
    const armH = targetTileSize - (armY - py);
    const centerOverlap = 0.9 * unit;
    if (connectLeft) {
      const leftX = px;
      const leftW = postX + postW / 2 + centerOverlap - leftX;
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, leftX, armY, leftW, armH);
      drawDarkenOverlay(targetCtx, leftX, armY, leftW, armH, 0.08);
    }
    if (connectRight) {
      const rightX = postX + postW / 2 - centerOverlap;
      const rightW = px + targetTileSize - rightX;
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, rightX, armY, rightW, armH);
      drawDarkenOverlay(targetCtx, rightX, armY, rightW, armH, 0.08);
    }
  } else {
    const upperY = py + 2.9 * unit;
    const lowerY = py + 6.0 * unit;
    const armH = 2 * unit;
    if (connectLeft) {
      const leftX = px;
      const leftW = postX + postW * 0.20 - leftX;
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, leftX, upperY, leftW, armH);
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, leftX, lowerY, leftW, armH);
      drawDarkenOverlay(targetCtx, leftX, upperY, leftW, armH, 0.08);
      drawDarkenOverlay(targetCtx, leftX, lowerY, leftW, armH, 0.08);
    }
    if (connectRight) {
      const rightX = postX + postW - postW * 0.20;
      const rightW = px + targetTileSize - rightX;
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, rightX, upperY, rightW, armH);
      drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, rightX, lowerY, rightW, armH);
      drawDarkenOverlay(targetCtx, rightX, upperY, rightW, armH, 0.08);
      drawDarkenOverlay(targetCtx, rightX, lowerY, rightW, armH, 0.08);
    }
  }

  if (darken) drawDarkenOverlay(targetCtx, px, py, targetTileSize, targetTileSize, typeof darken === "number" ? darken : 0.36);
  return true;
}

function drawRotatedTextureCell(textureInfo, x, y, targetCtx, targetTileSize, darken = false) {
  const baseCanvas = getTransformedTextureCanvas(textureInfo.renderBaseId || textureInfo.baseId || textureInfo.id, textureInfo.renderRotate || 0, false);
  if (!baseCanvas) return false;
  const px = x * targetTileSize;
  const py = y * targetTileSize;
  targetCtx.imageSmoothingEnabled = false;
  targetCtx.drawImage(baseCanvas, px, py, targetTileSize, targetTileSize);
  if (darken) drawDarkenOverlay(targetCtx, px, py, targetTileSize, targetTileSize, typeof darken === "number" ? darken : 0.36);
  return true;
}

function drawTrapdoorCell(textureInfo, x, y, targetCtx, targetTileSize, darken = false) {
  const baseId = textureInfo.renderBaseId || textureInfo.baseId || textureInfo.id;
  const rot = textureInfo.trapdoorRot || 0;
  const flip = Boolean(textureInfo.trapdoorFlip);
  const transformed = getTransformedTextureCanvas(baseId, rot, flip);
  if (!transformed) return false;
  const px = x * targetTileSize;
  const py = y * targetTileSize;
  const unit = targetTileSize / 16;
  targetCtx.imageSmoothingEnabled = false;

  if ((textureInfo.trapdoorMode || "top") === "top") {
    targetCtx.drawImage(transformed, px, py, targetTileSize, targetTileSize);
  } else {
    const strip = 3 * unit;
    const normalizedRot = ((rot % 360) + 360) % 360;
    if (normalizedRot === 0) {
      const edge = getTrapdoorEdgeCanvas(baseId, rot, flip, "horizontal");
      if (!edge) return false;
      targetCtx.drawImage(edge, px, py + targetTileSize - strip, targetTileSize, strip);
    } else if (normalizedRot === 180) {
      const edge = getTrapdoorEdgeCanvas(baseId, rot, flip, "horizontal");
      if (!edge) return false;
      targetCtx.drawImage(edge, px, py, targetTileSize, strip);
    } else if (normalizedRot === 90) {
      const edge = getTrapdoorEdgeCanvas(baseId, rot, flip, "left");
      if (!edge) return false;
      targetCtx.drawImage(edge, px, py, strip, targetTileSize);
    } else {
      const edge = getTrapdoorEdgeCanvas(baseId, rot, flip, "right");
      if (!edge) return false;
      targetCtx.drawImage(edge, px + targetTileSize - strip, py, strip, targetTileSize);
    }
  }

  if (darken) drawDarkenOverlay(targetCtx, px, py, targetTileSize, targetTileSize, typeof darken === "number" ? darken : 0.36);
  return true;
}

function drawButtonCell(textureInfo, x, y, targetCtx, targetTileSize, darken = false) {
  const baseId = textureInfo.renderBaseId || textureInfo.baseId || textureInfo.id;
  const baseImage = getTextureImage(baseId);
  if (!(baseImage instanceof HTMLCanvasElement || (baseImage.complete && baseImage.naturalWidth > 0))) return false;

  const px = x * targetTileSize;
  const py = y * targetTileSize;
  const unit = targetTileSize / 16;
  const rot = ((textureInfo.buttonRot || 0) % 360 + 360) % 360;
  const horizontal = rot === 0 || rot === 180;
  const bw = (horizontal ? 6 : 4) * unit;
  const bh = (horizontal ? 4 : 6) * unit;
  const bx = px + (targetTileSize - bw) / 2;
  const by = py + (targetTileSize - bh) / 2;

  drawMaskedBaseRect(baseImage, targetCtx, px, py, targetTileSize, bx, by, bw, bh);
  drawDarkenOverlay(targetCtx, bx, by, bw, bh, 0.08);
  if (darken) drawDarkenOverlay(targetCtx, bx, by, bw, bh, typeof darken === "number" ? darken : 0.36);
  return true;
}

const cellScratchCanvas = document.createElement("canvas");
const cellScratchCtx = cellScratchCanvas.getContext("2d");

function prepareCellScratchCanvas(size) {
  if (cellScratchCanvas.width !== size || cellScratchCanvas.height !== size) {
    cellScratchCanvas.width = size;
    cellScratchCanvas.height = size;
  }
  cellScratchCtx.clearRect(0, 0, size, size);
  cellScratchCtx.imageSmoothingEnabled = false;
  return cellScratchCtx;
}

function drawTextureCellRaw(textureId, x, y, targetCtx, targetTileSize, darken = false, layer = null, gridWidth = null) {
  const textureInfo = textureById.get(textureId) || null;
  const px = x * targetTileSize;
  const py = y * targetTileSize;

  if (darken) {
    const scratch = prepareCellScratchCanvas(targetTileSize);

    if (textureInfo?.connectKind) {
      if (!drawConnectShapeCell(textureInfo, 0, 0, scratch, targetTileSize, false)) return;
    } else if (textureInfo?.renderKind === "trapdoor") {
      if (!drawTrapdoorCell(textureInfo, 0, 0, scratch, targetTileSize, false)) return;
    } else if (textureInfo?.renderKind === "rotatedTexture") {
      if (!drawRotatedTextureCell(textureInfo, 0, 0, scratch, targetTileSize, false)) return;
    } else if (textureInfo?.renderKind === "button") {
      if (!drawButtonCell(textureInfo, 0, 0, scratch, targetTileSize, false)) return;
    } else {
      const image = getTextureImage(textureId);
      if (image instanceof HTMLCanvasElement || (image.complete && image.naturalWidth > 0)) {
        scratch.drawImage(image, 0, 0, targetTileSize, targetTileSize);
      } else {
        scratch.fillStyle = "#111111";
        scratch.fillRect(0, 0, targetTileSize, targetTileSize);
      }
    }

    drawDarkenOverlay(scratch, 0, 0, targetTileSize, targetTileSize, typeof darken === "number" ? darken : 0.36);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(cellScratchCanvas, px, py);
    return;
  }

  if (textureInfo?.connectKind) {
    if (drawConnectShapeCell(textureInfo, x, y, targetCtx, targetTileSize, false)) return;
  }
  if (textureInfo?.renderKind === "trapdoor") {
    if (drawTrapdoorCell(textureInfo, x, y, targetCtx, targetTileSize, false)) return;
  }
  if (textureInfo?.renderKind === "rotatedTexture") {
    if (drawRotatedTextureCell(textureInfo, x, y, targetCtx, targetTileSize, false)) return;
  }
  if (textureInfo?.renderKind === "button") {
    if (drawButtonCell(textureInfo, x, y, targetCtx, targetTileSize, false)) return;
  }

  const image = getTextureImage(textureId);
  if (image instanceof HTMLCanvasElement || (image.complete && image.naturalWidth > 0)) {
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(image, px, py, targetTileSize, targetTileSize);
  } else {
    targetCtx.fillStyle = "#111111";
    targetCtx.fillRect(px, py, targetTileSize, targetTileSize);
  }
}

function shouldCacheTextureCell(textureInfo, darken) {
  if (darken) return true;
  return Boolean(textureInfo?.connectKind || textureInfo?.renderKind === "trapdoor" || textureInfo?.renderKind === "rotatedTexture" || textureInfo?.renderKind === "button");
}

function getCellCacheKey(textureId, targetTileSize, darken) {
  const alpha = typeof darken === "number" ? Math.round(darken * 1000) : darken ? 360 : 0;
  return `${textureId}|${targetTileSize}|${alpha}`;
}

function drawTextureCell(textureId, x, y, targetCtx, targetTileSize, darken = false, layer = null, gridWidth = null) {
  const textureInfo = textureById.get(textureId) || null;
  if (!shouldCacheTextureCell(textureInfo, darken)) {
    drawTextureCellRaw(textureId, x, y, targetCtx, targetTileSize, false, layer, gridWidth);
    return;
  }

  const cacheKey = getCellCacheKey(textureId, targetTileSize, darken);
  let cached = cellRenderCache.get(cacheKey);
  if (!cached) {
    cached = document.createElement("canvas");
    cached.width = targetTileSize;
    cached.height = targetTileSize;
    const cachedCtx = cached.getContext("2d");
    cachedCtx.imageSmoothingEnabled = false;
    drawTextureCellRaw(textureId, 0, 0, cachedCtx, targetTileSize, darken, layer, gridWidth);
    rememberCellRender(cacheKey, cached);
  }

  targetCtx.imageSmoothingEnabled = false;
  targetCtx.drawImage(cached, x * targetTileSize, y * targetTileSize);
}

function getTexturePreviewSrc(item) {
  if (!item?.id) return item?.preview || item?.src || "";
  if (previewSrcCache.has(item.id)) return previewSrcCache.get(item.id);
  const textureInfo = textureById.get(item.id) || null;
  if (textureInfo?.connectKind || textureInfo?.renderKind === "trapdoor" || textureInfo?.renderKind === "rotatedTexture" || textureInfo?.renderKind === "button") {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const previewCtx = canvas.getContext("2d");
    previewCtx.clearRect(0, 0, 16, 16);
    drawTextureCell(item.id, 0, 0, previewCtx, 16, false, null, 1);
    const src = canvas.toDataURL("image/png");
    previewSrcCache.set(item.id, src);
    return src;
  }
  const textureAsset = getTextureImage(item.id);
  if (textureAsset instanceof HTMLCanvasElement) {
    const src = textureAsset.toDataURL("image/png");
    previewSrcCache.set(item.id, src);
    return src;
  }
  return item.preview || item.src;
}

function getHoverTransformTarget(filterFn = null) {
  if (!currentProject || !hoverCell) return null;
  const layer = getActiveLayer();
  if (!layer) return null;
  const index = getIndex(hoverCell.x, hoverCell.y);
  const textureId = layer.cells[index];
  const info = textureById.get(textureId);
  if (!textureId || !info?.transform) return null;
  if (filterFn && !filterFn(info, textureId)) return null;
  return { x: hoverCell.x, y: hoverCell.y, layerId: layer.id };
}

function getTrapdoorTargetFromHover() {
  return getHoverTransformTarget((info) => info?.transform?.kind === "trapdoor");
}

function applyTransformToTarget(target, mode) {
  if (!target || !currentProject) return false;
  const layer = currentProject.layers.find((entry) => entry.id === target.layerId);
  if (!layer) return false;
  const index = getIndex(target.x, target.y);
  const currentTextureId = layer.cells[index];
  const textureInfo = textureById.get(currentTextureId);
  const transformInfo = textureInfo?.transform;
  const nextId = mode === "rotate" ? transformInfo?.nextR : mode === "toggleMode" ? transformInfo?.nextE : transformInfo?.nextT;
  if (!currentTextureId || !transformInfo || !nextId || !textureById.has(nextId)) return false;
  pushUndoSnapshot(snapshotLayers(currentProject.layers));
  layer.cells[index] = nextId;
  const nextInfo = textureById.get(nextId);
  if (textureInfo?.connectGroup || nextInfo?.connectGroup) refreshConnectionsAround(layer, target.x, target.y);
  lastTransformTarget = { x: target.x, y: target.y, layerId: layer.id };
  requestCanvasRedrawAround(target.x, target.y, 1);
  if (mode === "rotate") {
    if (transformInfo.kind === "trapdoor") setStatus("Trapdoor obrócony o 90°. Ctrl+Z cofa zmianę.");
    else if (transformInfo.kind === "button") setStatus("Guzik obrócony o 90°. Ctrl+Z cofa zmianę.");
    else setStatus("Schodek obrócony o 90°. Ctrl+Z cofa zmianę.");
  } else if (mode === "toggleMode") {
    if (transformInfo.kind === "glassPane") setStatus("Szkło lub iron bars przełączone między blokiem i szybą / kratą. Ctrl+Z cofa zmianę.");
    else setStatus("Trapdoor przełączony między widokiem z góry i z boku. Ctrl+Z cofa zmianę.");
  } else if (transformInfo.kind === "slab") setStatus("Półblok przeniesiony między dołem i górą kratki. Ctrl+Z cofa zmianę.");
  else if (transformInfo.kind === "log") setStatus("Log obrócony między pionem a poziomem. Ctrl+Z cofa zmianę.");
  else if (transformInfo.kind === "trapdoor") setStatus("Trapdoor odbity lustrzanie. Ctrl+Z cofa zmianę.");
  else setStatus("Schodek odbity w poziomie. Ctrl+Z cofa zmianę.");
  return true;
}

function transformLastPlaced(mode) {
  const preferredTrapdoorTarget = getTrapdoorTargetFromHover();
  if (preferredTrapdoorTarget && applyTransformToTarget(preferredTrapdoorTarget, mode)) return;

  if (!currentProject || !lastTransformTarget) {
    if (mode === "rotate") setStatus("Nie ma ostatniego obiektu do obrotu.");
    else setStatus("Nie ma ostatniego obiektu do odbicia lub przełączenia.");
    return;
  }
  if (!applyTransformToTarget(lastTransformTarget, mode)) {
    setStatus(mode === "rotate" ? "Ostatni obiekt nie ma obrotu R." : "Ostatni obiekt nie ma odbicia T.");
  }
}

function toggleHoveredSpecialMode() {
  const target = getHoverTransformTarget((info) => Boolean(info?.transform?.nextE));
  if (!target) {
    setStatus("Najedź kursorem na trapdoor, szkło lub iron bars na aktywnej warstwie, aby przełączyć je klawiszem E.");
    return;
  }
  applyTransformToTarget(target, "toggleMode");
}

window.addEventListener("keydown", (event) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = activeTag === "input" || activeTag === "textarea" || activeTag === "select";
  if (!isTyping && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    finishDrawing();
    toggleHoveredSpecialMode();
  }
}, true);

canvas.addEventListener("mousemove", (event) => {
  if (!currentProject) return;
  hoverCell = getCellFromEvent(event);
});
canvas.addEventListener("mouseleave", () => { hoverCell = null; });

applyStructureAndTextureAugmentations();
refreshAllConnections();

initApp();
