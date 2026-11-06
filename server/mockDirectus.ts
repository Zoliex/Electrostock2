import express from "express";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "mock_directus.json");

interface MockDb {
  boxes: Array<{ id: string; name: string; description: string; unique_id: string }>;
  components_types: Array<{ id: number; name: string; subcategory: string }>;
  components_packages: Array<{ id: number; name: string }>;
  components: Array<any>;
  components_files: Array<{ id: number; components_id: number; directus_files_id: string }>;
  components_files_1: Array<{ id: number; components_id: number; directus_files_id: string }>;
  files: Array<{ id: string; filename: string; mimeType: string }>;
}

const defaultBoxes = [
  { id: "box-01", name: "Drawer A-01", description: "Microcontrollers and Development Boards", unique_id: "BOX-A01" },
  { id: "box-02", name: "Drawer A-02", description: "Environmental, Motion & Optical Sensors", unique_id: "BOX-A02" },
  { id: "box-03", name: "Bin B-10", description: "SMD Passive Components (0603 & 0805)", unique_id: "BIN-B10" },
  { id: "box-04", name: "Drawer C-05", description: "Linear Regulators & Power Management ICs", unique_id: "BOX-C05" },
  { id: "box-05", name: "Bin D-02", description: "Discrete Semiconductors & Diodes", unique_id: "BIN-D02" }
];

const defaultTypes = [
  { id: 1, name: "Microcontrollers", subcategory: "32-bit MCU" },
  { id: 2, name: "Sensors", subcategory: "Environmental & IMU" },
  { id: 3, name: "Passives", subcategory: "Resistors" },
  { id: 4, name: "Power Management", subcategory: "Voltage Regulators" },
  { id: 5, name: "Interface & Communication", subcategory: "Transceivers" },
  { id: 6, name: "Discrete Semiconductors", subcategory: "Transistors & Diodes" },
  { id: 7, name: "Passives", subcategory: "Capacitors" }
];

const defaultPackages = [
  { id: 1, name: "DIP-8" },
  { id: 2, name: "SOIC-8" },
  { id: 3, name: "QFN-32" },
  { id: 4, name: "LQFP-64" },
  { id: 5, name: "SMD 0805" },
  { id: 6, name: "SMD 0603" },
  { id: 7, name: "TO-220" },
  { id: 8, name: "SOT-23" }
];

const defaultComponents = [
  {
    id: 1,
    name: "ESP32-WROOM-32D",
    description: "Wi-Fi + BT + BLE MCU module with dual Xtensa 32-bit LX6 cores up to 240 MHz, 4MB Flash.\n\n### Specifications\n- **CPU**: Dual-core 32-bit LX6 @ 240MHz\n- **RAM**: 520 KB SRAM\n- **Flash**: 4 MB SPI Flash\n- **Wireless**: 802.11 b/g/n + BT 4.2 BR/EDR/BLE",
    quantity_available: 24,
    location: "box-01",
    package: 3,
    type: 1,
    barcode: "ES32-WR-001",
    keywords: ["esp32", "wifi", "bluetooth", "espressif"],
    packet_reference: "ESP32-WROOM-32D-N4",
    date_created: "2026-01-15T10:00:00Z"
  },
  {
    id: 2,
    name: "STM32F401RE",
    description: "High-performance ARM Cortex-M4 32-bit MCU with FPU, 84 MHz, 512 KB Flash, 96 KB SRAM.\n\n### Key Features\n- 84 MHz maximum frequency\n- 512 Kbytes of Flash memory\n- 96 Kbytes of SRAM\n- USB 2.0 OTG FS",
    quantity_available: 8,
    location: "box-01",
    package: 4,
    type: 1,
    barcode: "STM32-401-002",
    keywords: ["stm32", "arm", "cortex-m4", "stmicroelectronics"],
    packet_reference: "STM32F401RET6",
    date_created: "2026-01-18T14:30:00Z"
  },
  {
    id: 3,
    name: "BME280 Digital Sensor",
    description: "Combined digital humidity, pressure and temperature sensor based on proven sensing principles.\n\n### Parameters\n- Temperature range: -40 to +85 °C\n- Pressure range: 300 to 1100 hPa\n- Humidity range: 0 to 100% RH\n- Interface: I2C and SPI",
    quantity_available: 5,
    location: "box-02",
    package: 8,
    type: 2,
    barcode: "BME280-003",
    keywords: ["sensor", "temperature", "humidity", "bosch"],
    packet_reference: "BME280",
    date_created: "2026-02-01T09:15:00Z"
  },
  {
    id: 4,
    name: "LM7805 Linear Regulator",
    description: "Positive 3-terminal voltage regulator with 5V fixed output and 1.5A current capability.\n\n### Specifications\n- Output Voltage: 5.0 V\n- Max Output Current: 1.5 A\n- Package: TO-220\n- Thermal Overload Protection: Built-in",
    quantity_available: 42,
    location: "box-04",
    package: 7,
    type: 4,
    barcode: "LM7805-004",
    keywords: ["regulator", "linear", "5v", "power", "ti"],
    packet_reference: "LM7805CT",
    date_created: "2026-02-10T11:20:00Z"
  },
  {
    id: 5,
    name: "MPU-6050 6-DoF IMU",
    description: "6-axis MotionTracking device combining a 3-axis gyroscope and a 3-axis accelerometer on a single silicon die with Digital Motion Processor (DMP).\n\n### Characteristics\n- I2C digital output\n- 16-bit ADCs on all axes\n- User-programmable full scale ranges",
    quantity_available: 15,
    location: "box-02",
    package: 3,
    type: 2,
    barcode: "MPU6050-005",
    keywords: ["imu", "gyro", "accelerometer", "invensense"],
    packet_reference: "MPU-6050",
    date_created: "2026-02-12T16:45:00Z"
  },
  {
    id: 6,
    name: "10k Resistor 0805 1%",
    description: "Surface mount thick film chip resistor 10k ohm 1% 1/8W 0805 SMD.",
    quantity_available: 350,
    location: "box-03",
    package: 5,
    type: 3,
    barcode: "RES-10K-0805",
    keywords: ["resistor", "smd", "passive", "10k"],
    packet_reference: "RC0805FR-0710KL",
    date_created: "2026-02-15T08:00:00Z"
  },
  {
    id: 7,
    name: "100nF Ceramic Capacitor 0805",
    description: "Multilayer ceramic capacitor (MLCC) 0.1uF 50V X7R 10% 0805 SMD decoupling capacitor.",
    quantity_available: 4,
    location: "box-03",
    package: 5,
    type: 3,
    barcode: "CAP-100N-0805",
    keywords: ["capacitor", "ceramic", "decoupling", "0805"],
    packet_reference: "CC0805KRX7R9BB104",
    date_created: "2026-02-20T12:00:00Z"
  }
];

function loadDb(): MockDb {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("[Mock Directus] Error reading db file:", e);
  }

  const initialDb: MockDb = {
    boxes: defaultBoxes,
    components_types: defaultTypes,
    components_packages: defaultPackages,
    components: defaultComponents,
    components_files: [],
    components_files_1: [],
    files: []
  };

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2));
  } catch (e) {
    console.error("[Mock Directus] Error saving initial db:", e);
  }

  return initialDb;
}

let db = loadDb();

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("[Mock Directus] Error writing db:", e);
  }
}

function populateComponent(comp: any, fields?: string[]) {
  const c = { ...comp };
  const typeId = typeof c.type === "object" && c.type !== null ? c.type.id : c.type;
  const packageId = typeof c.package === "object" && c.package !== null ? c.package.id : c.package;
  const locationId = typeof c.location === "object" && c.location !== null ? c.location.id : c.location;

  const typeObj = db.components_types.find(t => t.id === Number(typeId));
  const packageObj = db.components_packages.find(p => p.id === Number(packageId));
  const boxObj = db.boxes.find(b => b.id === String(locationId));

  c.type = typeObj || { id: typeId, name: "General", subcategory: "" };
  c.package = packageObj || { id: packageId, name: "Standard" };
  c.location = boxObj || { id: locationId, name: "Main Stock", description: "", unique_id: String(locationId) };

  // Add relations for files
  c.components_files = db.components_files.filter(f => f.components_id === c.id);
  c.components_files_1 = db.components_files_1.filter(f => f.components_id === c.id);

  return c;
}

export function createMockDirectusRouter() {
  const router = express.Router();

  // Allow body parsing for Directus API
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  // GET /directus/users/me
  router.get("/users/me", (req, res) => {
    res.json({
      data: {
        id: "admin",
        first_name: "ElectroStock",
        last_name: "Admin",
        email: "admin@electrostock.local"
      }
    });
  });

  // GET /directus/assets/:id
  router.get("/assets/:id", (req, res) => {
    const { id } = req.params;
    // Return a clean SVG electronic component chip placeholder
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="100%" height="100%" fill="#1e293b"/>
        <rect x="120" y="70" width="160" height="160" rx="16" fill="#0f172a" stroke="#3b82f6" stroke-width="4"/>
        <circle cx="140" cy="90" r="8" fill="#3b82f6" opacity="0.6"/>
        <text x="200" y="155" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">ElectroStock</text>
        <text x="200" y="180" fill="#94a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">Component ID: ${id.slice(0, 12)}</text>
        <!-- IC Pins -->
        <line x1="80" y1="110" x2="120" y2="110" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
        <line x1="80" y1="150" x2="120" y2="150" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
        <line x1="80" y1="190" x2="120" y2="190" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
        <line x1="280" y1="110" x2="320" y2="110" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
        <line x1="280" y1="150" x2="320" y2="150" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
        <line x1="280" y1="190" x2="320" y2="190" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
      </svg>
    `;
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg.trim());
  });

  // POST /directus/files
  router.post("/files", (req, res) => {
    const fileId = "file-" + Math.random().toString(36).substring(2, 10);
    const fileRecord = {
      id: fileId,
      filename: "component-image.png",
      mimeType: "image/png"
    };
    db.files.push(fileRecord);
    saveDb();
    res.json({ data: fileRecord });
  });

  // GET /directus/items/:collection
  router.get("/items/:collection", (req, res) => {
    const { collection } = req.params;
    const { query, aggregate, limit, page, sort, search, filter } = req.query as any;

    const table = (db as any)[collection];
    if (!Array.isArray(table)) {
      return res.status(404).json({ error: `Collection ${collection} not found` });
    }

    let items = [...table];

    // Filter by search query
    if (search && typeof search === "string" && search.trim()) {
      const q = search.toLowerCase().trim();
      items = items.filter(item => {
        return (
          (item.name && item.name.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.barcode && item.barcode.toLowerCase().includes(q)) ||
          (item.packet_reference && item.packet_reference.toLowerCase().includes(q)) ||
          (Array.isArray(item.keywords) && item.keywords.some((k: string) => k.toLowerCase().includes(q)))
        );
      });
    }

    // Handle Directus aggregate: { count: '*' } or aggregate[count]=*
    if (aggregate || (query && typeof query === "string" && query.includes("aggregate"))) {
      return res.json({
        data: [{ count: items.length }]
      });
    }

    // Populate relations for components
    if (collection === "components") {
      items = items.map(c => populateComponent(c));
    }

    // Sorting
    if (sort) {
      const sortField = Array.isArray(sort) ? sort[0] : String(sort);
      const isDesc = sortField.startsWith("-");
      const key = isDesc ? sortField.substring(1) : sortField;
      items.sort((a, b) => {
        const valA = a[key] ?? "";
        const valB = b[key] ?? "";
        if (typeof valA === "number" && typeof valB === "number") {
          return isDesc ? valB - valA : valA - valB;
        }
        return isDesc ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
      });
    }

    // Pagination
    const numLimit = limit ? Number(limit) : -1;
    const numPage = page ? Number(page) : 1;

    if (numLimit > 0) {
      const startIndex = (numPage - 1) * numLimit;
      items = items.slice(startIndex, startIndex + numLimit);
    }

    res.json({ data: items });
  });

  // GET /directus/items/:collection/:id
  router.get("/items/:collection/:id", (req, res) => {
    const { collection, id } = req.params;
    const table = (db as any)[collection];
    if (!Array.isArray(table)) {
      return res.status(404).json({ error: `Collection ${collection} not found` });
    }

    const item = table.find(x => String(x.id) === String(id));
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (collection === "components") {
      return res.json({ data: populateComponent(item) });
    }

    res.json({ data: item });
  });

  // POST /directus/items/:collection
  router.post("/items/:collection", (req, res) => {
    const { collection } = req.params;
    const table = (db as any)[collection];
    if (!Array.isArray(table)) {
      return res.status(404).json({ error: `Collection ${collection} not found` });
    }

    const body = req.body || {};
    let newId = body.id;
    if (!newId) {
      if (collection === "boxes") {
        newId = "box-" + Math.random().toString(36).substring(2, 6);
      } else {
        const maxId = table.reduce((max, it) => Math.max(max, Number(it.id) || 0), 0);
        newId = maxId + 1;
      }
    }

    const newItem = {
      ...body,
      id: newId,
      date_created: body.date_created || new Date().toISOString()
    };

    table.push(newItem);
    saveDb();

    if (collection === "components") {
      return res.json({ data: populateComponent(newItem) });
    }

    res.json({ data: newItem });
  });

  // PATCH /directus/items/:collection/:id
  router.patch("/items/:collection/:id", (req, res) => {
    const { collection, id } = req.params;
    const table = (db as any)[collection];
    if (!Array.isArray(table)) {
      return res.status(404).json({ error: `Collection ${collection} not found` });
    }

    const index = table.findIndex(x => String(x.id) === String(id));
    if (index === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    table[index] = { ...table[index], ...req.body };
    saveDb();

    if (collection === "components") {
      return res.json({ data: populateComponent(table[index]) });
    }

    res.json({ data: table[index] });
  });

  // DELETE /directus/items/:collection/:id
  router.delete("/items/:collection/:id", (req, res) => {
    const { collection, id } = req.params;
    const table = (db as any)[collection];
    if (!Array.isArray(table)) {
      return res.status(404).json({ error: `Collection ${collection} not found` });
    }

    const index = table.findIndex(x => String(x.id) === String(id));
    if (index !== -1) {
      table.splice(index, 1);
      saveDb();
    }

    res.status(204).send();
  });

  return router;
}
