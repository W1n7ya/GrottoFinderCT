import Async from "Async";
import Settings from "SettingsManager";

let settings = new Settings("GrottoFinder", "grotto-finder-settings.json");

// === GUI Settings ===
let enabled = settings.addSetting("Enabled", "toggle", false);
let debug = settings.addSetting("Debug Messages", "toggle", true);
let highlightR = settings.addSetting("Highlight Red", "slider", 1, 0, 1);
let highlightG = settings.addSetting("Highlight Green", "slider", 0, 0, 1);
let highlightB = settings.addSetting("Highlight Blue", "slider", 1, 0, 1);
let highlightA = settings.addSetting("Highlight Alpha", "slider", 0.25, 0, 1);
let maxThreads = settings.addSetting("Max Threads", "slider", 8, 1, 32);
let autoWaypoint = settings.addSetting("Auto Waypoint on First Grotto", "toggle", true);

settings.setCategory("GrottoFinder Settings");
settings.setCategoryDescription("GrottoFinder Settings", "Configure grotto scanning, type detection, and rendering.");

// === Variables ===
let scanning = false;
let blocksList = [];
let total = 0;
let threads = 0;
let queue = [];
let scanned = [];

// Grotto type thresholds
const types = {
  "Shrine": { panes: 86, blocks: 117 },
  "Arch": { panes: 57, blocks: 70 },
  "Mansion": { panes: 340, blocks: 1 },
  "Hall": { panes: 80, blocks: 19 },
  "Pillars": { panes: 101, blocks: 0 },
  "Palace": { panes: 181, blocks: 104 },
  "Remnants": { panes: 90, blocks: 17 },
  "Aqueduct": { panes: 84, blocks: 0 }
};

register("command", () => settings.openGUI()).setName("grottoFinder");

function reset() {
  scanning = false;
  blocksList = [];
  total = 0;
  threads = 0;
  queue = [];
  scanned = [];
}

function startScan() {
  reset();
  scanning = true;
}

register("step", () => {
  if (enabled.get() && World.getWorld() && Scoreboard.getLines().some(l => l.getName().includes("Crystal Hollows")) && !scanning) startScan();
  if (!enabled.get() || (scanning && !Scoreboard.getLines().some(l => l.getName().includes("Crystal Hollows")))) reset();
  if (!scanning) return;

  const ChunkProvider = Java.type("net.minecraft.client.multiplayer.ChunkProviderClient").class;
  const loadedField = ChunkProvider.getDeclaredField("field_73237_c");
  loadedField.setAccessible(true);
  const chunks = loadedField.get(World.getWorld().func_72863_F());
  chunks.forEach(c => queue.push({ x: c.field_76635_g, z: c.field_76647_h }));
  processQueue();
}).setFps(1);

function processQueue() {
  if (!scanning || queue.length === 0) return;
  while (threads < maxThreads.get() && queue.length > 0) {
    let ch = queue.shift();
    if (ch.x < 11 || ch.x > 52 || ch.z < 11 || ch.z > 52) continue;
    if (scanned.some(c => c.x === ch.x && c.z === ch.z)) continue;
    scanned.push(ch);

    threads++;
    Async.run(() => {
      scanChunk(ch.x, ch.z);
      threads--;
      processQueue();
    });
  }
}

function scanChunk(cx, cz) {
  let found = findGlass(cx, cz);
  found.blocks.forEach(b => blocksList.push(b));
  total += found.blocks.length;

  if (found.blocks.length > 0) {
    let detectedType = detectType(found.paneCount, found.blockCount);
    if (debug.get()) ChatLib.chat(`&d[GrottoFinder] Detected ${detectedType} Grotto at &b${cx*16},${cz*16}`);
    if (autoWaypoint.get()) ChatLib.command(`waypoint add Grotto_${detectedType}_${cx}_${cz} ${cx*16} 0 ${cz*16} red`);
  }
}

function detectType(panes, blocks) {
  return Object.entries(types).find(([name, t]) =>
    panes >= t.panes && blocks >= t.blocks
  )?.[0] || "Unknown";
}

function findGlass(cx, cz) {
  let found = { blocks: [], paneCount: 0, blockCount: 0 };
  let baseX = cx*16, baseZ = cz*16;
  for (let x = 0; x < 16; x++) for (let y = 37; y <= 180; y++) for (let z = 0; z < 16; z++) {
    let pos = new BlockPos(baseX + x, y, baseZ + z);
    let b = World.getBlockAt(pos);
    let id = b.type.getID(), meta = b.getMetadata();
    if ((id === 95 || id === 160) && meta >= 0) {
      found.blocks.push(b);
      if (meta === 0) found.blockCount++; else found.paneCount++;
    }
  }
  return found;
}

register("renderWorld", () => {
  let [r, g, b, a] = [highlightR.get(), highlightG.get(), highlightB.get(), highlightA.get()];
  blocksList.forEach(bl => Renderer.drawBox([bl.x, bl.y, bl.z], r, g, b, a, true));
});
