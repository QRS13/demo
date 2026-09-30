import { consumeFlashCredit, getFlashCreditStatus } from "./credit-dashboard.js";

const firmwareInput = document.querySelector("#firmware-input");
const firmwareList = document.querySelector("#firmware-list");
const rowTemplate = document.querySelector("#firmware-row-template");
const dropZone = document.querySelector("#drop-zone");
const connectButton = document.querySelector("#connect-button");
const heroConnectButton = document.querySelector("#hero-connect-button");
const disconnectButton = document.querySelector("#disconnect-button");
const flashButton = document.querySelector("#flash-button");
const statusPanel = document.querySelector("#device-status");
const statusText = document.querySelector("#status-text");
const deviceDetails = document.querySelector("#device-details");
const browserWarning = document.querySelector("#browser-warning");
const progressWrap = document.querySelector("#progress-wrap");
const progressBar = document.querySelector("#progress-bar");
const progressPercent = document.querySelector("#progress-percent");
const progressLabel = document.querySelector("#progress-label");
const progressTrack = document.querySelector(".progress-track");
const resultMessage = document.querySelector("#result-message");
const eraseCheckbox = document.querySelector("#erase-checkbox");
const baudRateSelect = document.querySelector("#baud-rate");
const fileCount = document.querySelector("#file-count");
const outputTerminal = document.querySelector("#output-terminal");
const copyOutputButton = document.querySelector("#copy-output-button");
const clearOutputButton = document.querySelector("#clear-output-text-button");
const autoscrollCheckbox = document.querySelector("#autoscroll-checkbox");
const flashConfirmDialog = document.querySelector("#flash-confirm-dialog");
const flashConfirmCopy = document.querySelector("#flash-confirm-copy");

let port = null;
let transport = null;
let loader = null;
let flashing = false;
let consoleBuffer = "";
let consoleStarted = false;

function appendConsole(message, type = "") {
  if (!message) return;
  if (!consoleStarted) {
    outputTerminal.querySelector(".terminal-line")?.remove();
    consoleStarted = true;
  }
  consoleBuffer += message;
  if (consoleBuffer.length > 100_000) {
    consoleBuffer = `[Earlier output omitted]\n${consoleBuffer.slice(-90_000)}`;
  }

  let line = outputTerminal.querySelector(".terminal-live-line");
  if (!line || type) {
    line = document.createElement("span");
    line.className = `terminal-line terminal-live-line ${type}`.trim();
    outputTerminal.append(line);
  }
  line.textContent += message;
  if (autoscrollCheckbox.checked) outputTerminal.scrollTop = outputTerminal.scrollHeight;
}

function clearConsole() {
  consoleBuffer = "";
  consoleStarted = true;
  outputTerminal.querySelectorAll(".terminal-line").forEach((line) => line.remove());
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function addFirmwareFile(file) {
  if (!file.name.toLowerCase().endsWith(".bin")) {
    showResult(`${file.name} is not a .bin firmware file.`, true);
    return;
  }

  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  const name = row.querySelector(".file-name");
  name.textContent = file.name;
  name.title = file.name;
  row.querySelector(".file-size").textContent = formatSize(file.size);
  row.querySelector(".address-input").setAttribute("aria-label", `Flash address for ${file.name}`);
  row.file = file;
  row.querySelector(".remove-file").addEventListener("click", () => {
    row.remove();
    appendConsole(`Removed ${file.name} from the flash list.\n`);
    updateFlashButton();
  });
  row.querySelector(".address-input").addEventListener("input", () => {
    clearResult();
    updateFlashButton();
  });
  firmwareList.append(row);
  appendConsole(`Added ${file.name} (${formatSize(file.size)}). Set its flash address to continue.\n`);
  clearResult();
  updateFlashButton();
}

function addFirmwareFiles(files) {
  Array.from(files).forEach(addFirmwareFile);
}

function updateFlashButton() {
  flashButton.disabled = flashing || !loader || firmwareList.children.length === 0;
  fileCount.textContent = `${firmwareList.children.length} ${firmwareList.children.length === 1 ? "FILE" : "FILES"}`;
}

function setConnectionState(connected, message = "") {
  statusPanel.classList.toggle("connected", connected);
  statusText.textContent = message || (connected ? "CONNECTED" : "DISCONNECTED");
  connectButton.hidden = connected;
  heroConnectButton.hidden = connected;
  disconnectButton.hidden = !connected;
  deviceDetails.hidden = !connected;
  updateFlashButton();
}

function showResult(message, isError = false) {
  resultMessage.textContent = message;
  resultMessage.classList.toggle("error", isError);
  resultMessage.hidden = false;
}

function clearResult() {
  resultMessage.hidden = true;
  resultMessage.classList.remove("error");
}

function parseAddress(value) {
  const normalized = value.trim();
  if (!/^(?:0x)?[0-9a-f]+$/i.test(normalized)) return null;
  const address = Number.parseInt(normalized.replace(/^0x/i, ""), 16);
  return Number.isSafeInteger(address) && address >= 0 && address <= 0x3fffffff
    ? address
    : null;
}

function getFlashFiles() {
  const rows = Array.from(firmwareList.children);
  if (rows.length === 0) throw new Error("Choose at least one .bin firmware file first.");

  const files = rows.map((row) => {
    const addressInput = row.querySelector(".address-input");
    const address = parseAddress(addressInput.value);
    if (address === null) throw new Error(`Enter a valid hexadecimal flash address for ${row.file.name}.`);
    if (row.file.size === 0) throw new Error(`${row.file.name} is empty.`);
    return { file: row.file, address };
  });

  const ranges = files
    .map(({ file, address }) => ({ file, start: address, end: address + file.size }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i].start < ranges[i - 1].end) {
      throw new Error(
        `${ranges[i - 1].file.name} and ${ranges[i].file.name} overlap in flash memory. Check their addresses.`,
      );
    }
  }

  return files;
}

async function disconnectDevice() {
  const currentTransport = transport;
  port = null;
  transport = null;
  loader = null;
  deviceDetails.textContent = "";
  setConnectionState(false);

  if (currentTransport) {
    await currentTransport.disconnect();
  }
}

async function connectDevice() {
  if (!("serial" in navigator)) {
    browserWarning.hidden = false;
    return;
  }

  connectButton.disabled = true;
  heroConnectButton.disabled = true;
  statusText.textContent = "CONNECTING...";
  appendConsole("Requesting access to an ESP32 serial port…\n");
  clearResult();
  try {
    const selectedPort = await navigator.serial.requestPort();
    const { ESPLoader, Transport } = await import(
      "https://esm.sh/esptool-js@0.7.0?bundle"
    );
    const selectedTransport = new Transport(selectedPort, false);
    const terminal = {
      clean() {
        clearConsole();
      },
      writeLine(message) {
        appendConsole(`${message}\n`);
      },
      write(message) {
        appendConsole(message);
      },
    };
    const baudRate = Number(baudRateSelect.value);
    const selectedLoader = new ESPLoader({
      transport: selectedTransport,
      baudrate: baudRate,
      terminal,
      debugLogging: false,
    });

    transport = selectedTransport;
    port = selectedPort;
    loader = selectedLoader;
    appendConsole(`Connecting at ${baudRate} baud…\n`);
    const chipName = await selectedLoader.main();
    const info = selectedPort.getInfo();
    const usbId =
      info.usbVendorId && info.usbProductId
        ? ` · USB ${info.usbVendorId.toString(16).padStart(4, "0")}:${info.usbProductId.toString(16).padStart(4, "0")}`
        : "";
    deviceDetails.textContent = `${chipName}${usbId}`;
    setConnectionState(true, `CONNECTED · ${chipName.toUpperCase()}`);
    appendConsole(`Connected to ${chipName}${usbId}.\n`);
    showResult(`${chipName} connected and ready.`);
  } catch (error) {
    if (error.name === "NotFoundError") {
      statusText.textContent = "DISCONNECTED";
      appendConsole("No serial port selected.\n");
    } else {
      statusText.textContent = "CONNECTION FAILED";
      appendConsole(`Connection failed: ${error.message || "Unknown connection error."}\n`, "error");
      showResult(error.message || "Could not connect to the ESP32.", true);
    }
    if (transport) {
      try {
        await disconnectDevice();
      } catch (disconnectError) {
        appendConsole(`Failed to close the serial port: ${disconnectError.message}\n`, "error");
        showResult(
          `${error.message || "Connection failed."} Also failed to close the serial port: ${disconnectError.message}`,
          true,
        );
      }
    }
  } finally {
    connectButton.disabled = false;
    heroConnectButton.disabled = false;
    updateFlashButton();
  }
}

connectButton.addEventListener("click", connectDevice);
heroConnectButton.addEventListener("click", connectDevice);

disconnectButton.addEventListener("click", async () => {
  disconnectButton.disabled = true;
  try {
    await disconnectDevice();
    appendConsole("Serial device disconnected.\n");
    showResult("Device disconnected.");
  } catch (error) {
    appendConsole(`Could not close serial port: ${error.message}\n`, "error");
    showResult(`Could not close the serial port: ${error.message}`, true);
  } finally {
    disconnectButton.disabled = false;
  }
});

flashButton.addEventListener("click", async () => {
  if (!loader || flashing) return;
  let creditStatus;
  try {
    creditStatus = getFlashCreditStatus();
  } catch (error) {
    appendConsole(`Cannot verify flash credits: ${error.message}\n`, "error");
    showResult(error.message, true);
    return;
  }
  if (!creditStatus.canFlash) {
    const message = "No credits remain. Submit a top-up request and wait for owner approval before flashing.";
    appendConsole(`${message}\n`, "error");
    showResult(message, true);
    return;
  }

  let files;
  try {
    files = getFlashFiles();
  } catch (error) {
    appendConsole(`Cannot flash firmware: ${error.message}\n`, "error");
    showResult(error.message, true);
    return;
  }

  const chargeMessage = creditStatus.unlimited
    ? "Your unlimited lifetime plan allows this flash at no additional credit charge."
    : `This will use 1 credit after the firmware is successfully written. Your wallet has ${creditStatus.balance} credit${creditStatus.balance === 1 ? "" : "s"} available.`;
  flashConfirmCopy.textContent = `${chargeMessage} Continue with flashing?`;
  let confirmed;
  try {
    confirmed = await new Promise((resolve) => {
      const handleClose = () => {
        flashConfirmDialog.removeEventListener("close", handleClose);
        resolve(flashConfirmDialog.returnValue === "confirm");
      };
      flashConfirmDialog.addEventListener("close", handleClose);
      flashConfirmDialog.showModal();
    });
  } catch (error) {
    appendConsole(`Could not open flash confirmation: ${error.message}\n`, "error");
    showResult(`Could not open flash confirmation: ${error.message}`, true);
    return;
  }
  if (!confirmed) {
    appendConsole("Flash cancelled. No credits were used.\n");
    return;
  }

  try {
    creditStatus = getFlashCreditStatus();
  } catch (error) {
    appendConsole(`Cannot verify flash credits: ${error.message}\n`, "error");
    showResult(error.message, true);
    return;
  }
  if (!creditStatus.canFlash) {
    const message = "No credits remain. Submit a top-up request and wait for owner approval before flashing.";
    appendConsole(`${message}\n`, "error");
    showResult(message, true);
    return;
  }

  flashing = true;
  disconnectButton.disabled = true;
  updateFlashButton();
  clearResult();
  progressWrap.hidden = false;
  progressBar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressLabel.textContent = "Reading firmware files…";
  progressTrack.setAttribute("aria-valuenow", "0");

  try {
    const fileArray = await Promise.all(
      files.map(async ({ file, address }) => ({
        data: new Uint8Array(await file.arrayBuffer()),
        address,
      })),
    );
    progressLabel.textContent = eraseCheckbox.checked ? "Erasing flash…" : "Preparing flash…";
    appendConsole(
      `${eraseCheckbox.checked ? "Erasing device flash first." : "Starting firmware write."}\n`,
    );
    let lastLoggedProgress = -1;
    await loader.writeFlash({
      fileArray,
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: eraseCheckbox.checked,
      compress: true,
      reportProgress(fileIndex, written, total) {
        const currentPercent = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
        progressBar.style.width = `${currentPercent}%`;
        progressPercent.textContent = `${currentPercent}%`;
        progressTrack.setAttribute("aria-valuenow", String(currentPercent));
        const currentFile = files[fileIndex]?.file.name;
        progressLabel.textContent = currentFile
          ? `Writing ${currentFile}…`
          : "Writing firmware…";
        if (currentPercent === 100 || currentPercent >= lastLoggedProgress + 10) {
          appendConsole(`Flash progress: ${currentPercent}%${currentFile ? ` (${currentFile})` : ""}\n`);
          lastLoggedProgress = currentPercent;
        }
      },
    });
    let creditChargeError = "";
    try {
      const remaining = consumeFlashCredit();
      appendConsole(
        remaining.unlimited
          ? "Unlimited lifetime plan: no credit used.\n"
          : `Used 1 credit. ${remaining.balance} credit${remaining.balance === 1 ? "" : "s"} remaining.\n`,
        "success",
      );
    } catch (error) {
      creditChargeError = error.message;
      appendConsole(`Firmware flashed, but credit deduction failed: ${creditChargeError}\n`, "error");
    }
    progressBar.style.width = "100%";
    progressPercent.textContent = "100%";
    progressTrack.setAttribute("aria-valuenow", "100");
    progressLabel.textContent = creditChargeError ? "Flash complete — credit update failed" : "Flash complete";
    try {
      await loader.after("hard_reset");
      appendConsole("Firmware flashed successfully. ESP32 restarted.\n", "success");
      showResult(
        creditChargeError
          ? `Firmware flashed successfully and the ESP32 restarted, but the credit could not be deducted: ${creditChargeError}`
          : "Firmware flashed successfully. Your ESP32 is restarting.",
        Boolean(creditChargeError),
      );
    } catch (error) {
      progressLabel.textContent = "Flash complete — restart failed";
      appendConsole(`Firmware was written, but restart failed: ${error.message || "Unknown reset error."}\n`, "error");
      showResult(
        `Firmware was flashed successfully, but the automatic restart failed: ${error.message || "Unknown reset error."}${creditChargeError ? ` Credit deduction also failed: ${creditChargeError}` : ""}`,
        true,
      );
    }
  } catch (error) {
    progressLabel.textContent = "Flash failed";
    appendConsole(`Flash failed: ${error.message || "Unknown flashing error."}\n`, "error");
    showResult(`Flash failed: ${error.message || "An unexpected error occurred."}`, true);
  } finally {
    flashing = false;
    disconnectButton.disabled = false;
    updateFlashButton();
  }
});

firmwareInput.addEventListener("change", (event) => {
  addFirmwareFiles(event.target.files);
  firmwareInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
}

dropZone.addEventListener("drop", (event) => {
  addFirmwareFiles(event.dataTransfer.files);
});

if (!("serial" in navigator)) {
  browserWarning.hidden = false;
  connectButton.disabled = true;
  heroConnectButton.disabled = true;
}

if ("serial" in navigator) {
  navigator.serial.addEventListener("disconnect", (event) => {
    if (event.target !== port) return;
    port = null;
    transport = null;
    loader = null;
    deviceDetails.textContent = "";
    setConnectionState(false, "USB DISCONNECTED");
    appendConsole("USB connection lost. Reconnect the ESP32 before flashing.\n", "error");
    showResult("The ESP32 was disconnected. Reconnect it before flashing.", true);
  });
}

clearOutputButton.addEventListener("click", clearConsole);

copyOutputButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(consoleBuffer);
    appendConsole("Output copied to clipboard.\n", "success");
  } catch (error) {
    appendConsole(`Could not copy output: ${error.message}\n`, "error");
    showResult(`Could not copy output: ${error.message}`, true);
  }
});

updateFlashButton();
