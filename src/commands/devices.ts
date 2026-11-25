import { listInputDevices } from "../audio/MicSource.js";
import * as ConfigManager from "../config/ConfigManager.js";

export async function devicesCommand(): Promise<void> {
  const devices = await listInputDevices();
  if (devices.length === 0) {
    console.log("\n  No audio input devices found.\n");
    return;
  }
  const selected = ConfigManager.get("deviceIndex");
  console.log("\n  Audio input devices:\n");
  console.log(`  [-1] System default${selected === -1 ? "  ← selected" : ""}`);
  devices.forEach((device, index) => {
    console.log(`  [${index}] ${device}${selected === index ? "  ← selected" : ""}`);
  });
  console.log("\n  Use one:  vibetalk --device <index>     Save it:  vibetalk config set device <index>\n");
}
