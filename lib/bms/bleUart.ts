/* eslint-disable @typescript-eslint/no-explicit-any */
// cspell:words Uart NUS FFF0 FFF1 FFF2 dcca9e
// BLE UART auto-detection for Daly-like modules via @abandonware/noble.
// Lazy-load noble to avoid bundler resolving optional native deps at build time.

export type DeviceInfo = {
  address: string;
  id: string;
  name: string;
  flavor: string;
};

export interface BleUartConnection {
  deviceInfo: DeviceInfo;
  onData: (fn: (b: Buffer) => void) => void;
  onDisconnect: (fn: () => void) => void;
  write: (buf: Buffer) => Promise<void>;
  disconnect: () => Promise<void>;
}

type Noble = typeof import("@abandonware/noble");

// Lazy-load bluetooth-hci-socket and attach to global to satisfy noble on Linux
let hciLoaded = false;
async function ensureHciSocketLoaded() {
  if (hciLoaded) return;
  hciLoaded = true; // prevent repeated attempts/log spam

  const isNode =
    typeof process !== "undefined" && !!(process as any).versions?.node;
  if (!isNode) return; // browser/edge runtimes cannot load native modules

  if (process.platform !== "linux") return; // macOS/Windows don't need HCI socket

  const g: any = globalThis as any;
  if (g.BluetoothHciSocket) return;

  try {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);

    let mod: any;
    try {
      mod = req("@abandonware/bluetooth-hci-socket");
    } catch {
      // Fallback to legacy name if abandonware fork isn't installed
      mod = req("bluetooth-hci-socket");
    }
    g.BluetoothHciSocket = mod?.default || mod;
  } catch (err) {
    // Don't throw; noble will report 'unsupported' later. Just warn clearly.
    // This avoids bundlers failing on native module resolution paths.
    // To fix on Linux: ensure @abandonware/bluetooth-hci-socket is installed and built
    // (node-gyp), or run in a Node environment where native modules are available.
    console.warn(
      "BLE: Failed to load @abandonware/bluetooth-hci-socket; BLE may not work on Linux.",
      err
    );
  }
}

// Defer loading noble until runtime
let nobleMod: Noble | null = null;
async function getNoble(): Promise<Noble> {
  if (nobleMod) return nobleMod;
  await ensureHciSocketLoaded();

  // Try ESM dynamic import first, then fall back to CJS require via createRequire
  try {
    const m: any = await import("@abandonware/noble");
    nobleMod = (m?.default || m) as Noble;
  } catch {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const m = req("@abandonware/noble");
    nobleMod = ((m as any)?.default || m) as Noble;
  }
  return nobleMod!;
}

// Correct UUIDs (32 hex chars, end with ...dcca9e):
// - NUS Service: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
// - RX (write):  6e400002-b5a3-f393-e0a9-e50e24dcca9e
// - TX (notify): 6e400003-b5a3-f393-e0a9-e50e24dcca9e
const UUIDS = {
  HM10_SERVICE: "ffe0",
  HM10_CHAR: "ffe1",

  NUS_SERVICE: "6e400001b5a3f393e0a9e50e24dcca9e",
  NUS_RX: "6e400002b5a3f393e0a9e50e24dcca9e", // write
  NUS_TX: "6e400003b5a3f393e0a9e50e24dcca9e", // notify

  FFF0_SERVICE: "fff0",
  FFF1: "fff1", // often notify
  FFF2: "fff2", // often write
};

// On macOS, CoreBluetooth prefers dashed 128-bit UUIDs.
// Convert a 32-hex string to 8-4-4-4-12 dashed form.
function dash128(hex32: string) {
  const h = hex32.replace(/-/g, "").toLowerCase();
  if (h.length !== 32) return hex32; // fall back if not 32 hex chars
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

function platformUuid(u: string) {
  if (u.length <= 6) return u.toLowerCase(); // keep 16-bit short UUIDs as-is
  return process.platform === "darwin" ? dash128(u) : u.toLowerCase();
}

function matchesTarget(
  p: any,
  { addr, namePart }: { addr: string; namePart: string }
) {
  if (addr) {
    const mac = (p.address || "").toLowerCase();
    if (mac === addr) return true;
  }
  if (namePart) {
    const ln = (p.advertisement?.localName || "").toLowerCase();
    if (ln.includes(namePart)) return true;
  }
  return false;
}

async function discoverUart(peripheral: any) {
  // HM-10 FFE1
  try {
    const { characteristics } =
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [platformUuid(UUIDS.HM10_SERVICE)],
        [platformUuid(UUIDS.HM10_CHAR)]
      );
    const ch = characteristics.find(
      (c: any) =>
        c.uuid === UUIDS.HM10_CHAR || c.uuid === platformUuid(UUIDS.HM10_CHAR)
    );
    if (ch) {
      await ch.subscribeAsync();
      return { writeChar: ch, notifyChar: ch, flavor: "HM-10 FFE1" };
    }
  } catch {}

  // Nordic NUS
  try {
    const { characteristics } =
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [platformUuid(UUIDS.NUS_SERVICE)],
        [platformUuid(UUIDS.NUS_RX), platformUuid(UUIDS.NUS_TX)]
      );
    const rx = characteristics.find(
      (c: any) =>
        c.uuid === UUIDS.NUS_RX || c.uuid === platformUuid(UUIDS.NUS_RX)
    );
    const tx = characteristics.find(
      (c: any) =>
        c.uuid === UUIDS.NUS_TX || c.uuid === platformUuid(UUIDS.NUS_TX)
    );
    if (rx && tx) {
      await tx.subscribeAsync();
      return { writeChar: rx, notifyChar: tx, flavor: "Nordic NUS" };
    }
  } catch {}

  // Generic FFF0/1/2
  try {
    const { characteristics } =
      await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [platformUuid(UUIDS.FFF0_SERVICE)],
        [platformUuid(UUIDS.FFF1), platformUuid(UUIDS.FFF2)]
      );
    const c1 = characteristics.find(
      (c: any) => c.uuid === UUIDS.FFF1 || c.uuid === platformUuid(UUIDS.FFF1)
    );
    const c2 = characteristics.find(
      (c: any) => c.uuid === UUIDS.FFF2 || c.uuid === platformUuid(UUIDS.FFF2)
    );
    let notifyChar, writeChar;
    for (const c of [c1, c2]) {
      if (!c) continue;
      if (!notifyChar && c.properties.includes("notify")) notifyChar = c;
      if (
        !writeChar &&
        (c.properties.includes("write") ||
          c.properties.includes("writeWithoutResponse"))
      )
        writeChar = c;
    }
    if (notifyChar && writeChar) {
      await notifyChar.subscribeAsync();
      return { writeChar, notifyChar, flavor: "Generic FFF0/1/2" };
    }
  } catch {}

  // Fallback: any service with notify+write
  const services = await peripheral.discoverServicesAsync([]);
  for (const s of services) {
    const characteristics = await s.discoverCharacteristicsAsync([]);
    let notifyChar: any, writeChar: any;
    for (const c of characteristics) {
      if (!notifyChar && c.properties.includes("notify")) notifyChar = c;
      if (
        !writeChar &&
        (c.properties.includes("write") ||
          c.properties.includes("writeWithoutResponse"))
      )
        writeChar = c;
    }
    if (notifyChar && writeChar) {
      await notifyChar.subscribeAsync();
      return { writeChar, notifyChar, flavor: `Heuristic service ${s.uuid}` };
    }
  }

  throw new Error(
    "No UART-like BLE characteristics found; device may need pairing or is proprietary."
  );
}

async function waitForPoweredOn() {
  const noble = await getNoble();
  // Runtime exposes "state"
  const currentState = (noble as any).state ?? (noble as any)._state;
  if (currentState === "poweredOn") return;
  await new Promise<void>((resolve, reject) => {
    const onState = (state: string) => {
      if (state === "poweredOn") {
        (noble as any).removeListener("stateChange", onState);
        resolve();
      } else if (state === "unauthorized" || state === "unsupported") {
        (noble as any).removeListener("stateChange", onState);
        reject(new Error(`Bluetooth state: ${state}`));
      }
    };
    (noble as any).on("stateChange", onState);
  });
}

export async function connectBleUart({
  addr = "",
  namePart = "",
}: {
  addr?: string;
  namePart?: string;
}): Promise<BleUartConnection> {
  const noble = await getNoble();

  await waitForPoweredOn();
  await (noble as any).startScanningAsync([], true);

  const periph = await new Promise<any>((resolve, reject) => {
    const onDiscover = (p: any) => {
      if (
        matchesTarget(p, {
          addr: addr.toLowerCase(),
          namePart: namePart.toLowerCase(),
        })
      ) {
        clearTimeout(timer);
        (noble as any).removeListener("discover", onDiscover as any);
        resolve(p);
      }
    };
    const timer = setTimeout(() => {
      (noble as any).removeListener("discover", onDiscover as any);
      reject(
        new Error(
          "Target not found while scanning. Check ADDR/NAME and device advertising."
        )
      );
    }, 30000);
    (noble as any).on("discover", onDiscover as any);
  }).finally(async () => {
    try {
      await (noble as any).stopScanningAsync();
    } catch {}
  });

  await periph.connectAsync();
  const io = await discoverUart(periph);

  const listeners = {
    data: [] as ((b: Buffer) => void)[],
    disconnect: [] as (() => void)[],
  };
  io.notifyChar.on("data", (buf: Buffer) =>
    listeners.data.forEach((fn) => fn(buf))
  );
  periph.once("disconnect", () => listeners.disconnect.forEach((fn) => fn()));

  const supportsWrite = io.writeChar.properties.includes("write");
  const supportsWriteNoResp = io.writeChar.properties.includes(
    "writeWithoutResponse"
  );

  async function write(buf: Buffer) {
    if (supportsWrite) return io.writeChar.writeAsync(buf, false);
    if (supportsWriteNoResp) return io.writeChar.writeAsync(buf, true);
    throw new Error("Characteristic does not support write.");
  }

  return {
    deviceInfo: {
      address: periph.address,
      id: periph.id,
      name: periph.advertisement?.localName || "",
      flavor: io.flavor,
    },
    onData: (fn: (b: Buffer) => void) => listeners.data.push(fn),
    onDisconnect: (fn: () => void) => listeners.disconnect.push(fn),
    write,
    disconnect: () => periph.disconnectAsync(),
  };
}
