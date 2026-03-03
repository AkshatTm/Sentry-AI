/**
 * bluetooth.d.ts
 * --------------
 * Ambient type augmentations for the Web Bluetooth API.
 *
 * The `@types/web-bluetooth` package provides full type coverage for:
 *   - navigator.bluetooth.requestDevice()
 *   - BluetoothDevice (watchAdvertisements, gatt, forget, etc.)
 *   - BluetoothAdvertisingEvent (rssi, txPower, manufacturerData, etc.)
 *   - BluetoothRemoteGATTServer (connect, disconnect, getPrimaryService)
 *   - WatchAdvertisementsOptions ({ signal?: AbortSignal })
 *
 * This file exists solely as a safety net for edge-case experimental
 * members that may be absent from the published type package, and to
 * re-export the reference so `tsc` always resolves Bluetooth types
 * regardless of `lib` or `typeRoots` configuration.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
 * @see https://www.npmjs.com/package/@types/web-bluetooth
 */

/// <reference types="web-bluetooth" />

/**
 * Augment BluetoothDevice with `unwatchAdvertisements()` which is present
 * in the spec draft but missing from @types/web-bluetooth as of v0.0.21.
 * This method is the cleanup counterpart to watchAdvertisements().
 *
 * @see https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothdevice-unwatchadvertisements
 */
interface BluetoothDevice {
  /**
   * Stops watching for advertisements from this device.
   * Safe to call even if not currently watching — it will no-op.
   */
  unwatchAdvertisements?(): void;
}
