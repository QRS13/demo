# QRS WEB FLASHER

A browser-based ESP32 firmware flasher. Firmware files are read locally in your browser and sent directly to your board over USB serial.

## Run it

Use Chrome or Edge on HTTPS or localhost:

1. Open PowerShell in this folder, run `py -m http.server 8000`, and visit <http://localhost:8000>.
2. Choose a serial speed and click **Connect**; select your ESP32's USB serial port.
3. Select or drop in one or more `.bin` firmware files and enter each flash address from the firmware release notes.
4. Choose **Flash firmware**. The output console displays connection and flashing progress.

The flasher uses Espressif's `esptool-js` from the `esm.sh` CDN when connecting, so an internet connection is needed for the flashing library. Firmware files are not uploaded to a server.

Check the firmware's release instructions before flashing; different projects use different addresses, and some require multiple `.bin` files. Each file needs an address before flashing. **Erase all flash** is optional and removes existing settings and data. Use the output panel's **Copy** and **Clear** buttons to manage its log.

## Client and owner credit dashboard preview

The client dashboard is on `index.html`; use its **Owner dashboard** link to open the separate password-prompted owner dashboard at `owner.html`. Demo top-up packages are 1 credit for ₱200, 5 credits for ₱700, or unlimited lifetime for ₱5,000. Flashing requires user confirmation, and one credit is deducted after each successful firmware write; cancelling or a failed write does not use a credit. An approved unlimited package does not use credits. A client can submit a GCash, Palawan Pay, GoTyme Bank, or PayMaya top-up request with a demo reference; the owner can approve or reject it, or add/remove demo credits manually. Demo balances and requests are saved in this browser's local storage and shared between the two pages in the same browser.

This preview does **not** accept or verify payments or provide secure owner authentication. The password prompt is only a client-side demo gate and must not be used to protect real credits. Do not use its balances for real purchases. Live payments and a protected owner dashboard require a server, authentication, and a payment provider API with server-side verification; never put payment secrets in this static client-side app.
