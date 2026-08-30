/**
 * Hardware capability probe for local model inference.
 *
 * Replaces `'gpu' in navigator`, which was the app's entire WebGPU check.
 * That property is true on every current Chrome, Edge, Firefox and Safari 26
 * — INCLUDING devices where `requestAdapter()` returns null (blocklisted
 * drivers, software rendering, many Android GPUs). Users were told WebGPU was
 * supported and only discovered otherwise after a gigabyte of download.
 *
 * The probe is also the source of the performance warnings shown before any
 * download starts.
 */

import { DeviceProfile, DeviceTier } from '../types';
import { WebGPUModelSpec, WEBGPU_MODELS, formatSize } from './models';

let cached: Promise<DeviceProfile> | null = null;

/** Runs once per page load; the result is stable for the session. */
export function probeDevice(): Promise<DeviceProfile> {
  if (!cached) cached = runProbe();
  return cached;
}

async function runProbe(): Promise<DeviceProfile> {
  const nav = navigator as any;
  const ua = navigator.userAgent || '';

  // iPadOS 13+ reports itself as a Mac; the touch-point count gives it away.
  const isIOS =
    /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid;

  // Chromium-only APIs. Absent on Safari and Firefox, so never default these
  // to an optimistic value — null means "unknown", not "fine".
  const deviceMemoryGiB: number | null =
    typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const hardwareConcurrency: number | null =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;

  const connection = nav.connection;
  const isMetered =
    connection?.saveData === true ||
    ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);

  let storageFreeBytes: number | null = null;
  try {
    if (navigator.storage?.estimate) {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      storageFreeBytes = Math.max(0, quota - usage);
    }
  } catch {
    /* Storage estimation is best-effort. */
  }

  const base = {
    hasF16: false,
    maxBufferSize: 0,
    maxStorageBufferBindingSize: 0,
    gpuVendor: '',
    deviceMemoryGiB,
    hardwareConcurrency,
    storageFreeBytes,
    isMetered,
    isMobile,
    isIOS,
    isAndroid,
  };

  if (!('gpu' in navigator)) {
    return { ...base, tier: 'no-webgpu' };
  }

  let adapter: any = null;
  try {
    adapter = await nav.gpu.requestAdapter();
  } catch {
    adapter = null;
  }
  if (!adapter) {
    return { ...base, tier: 'no-adapter' };
  }

  const hasF16 = adapter.features?.has?.('shader-f16') === true;
  const maxBufferSize = adapter.limits?.maxBufferSize ?? 0;
  const maxStorageBufferBindingSize = adapter.limits?.maxStorageBufferBindingSize ?? 0;
  // `adapter.info` is synchronous (Chrome 127+). The old async
  // `requestAdapterInfo()` was removed in Chrome 131 — do not call it.
  const gpuVendor = String(adapter.info?.vendor ?? '').toLowerCase();

  let tier: DeviceTier;
  if (isMobile) {
    tier = 'mobile-low';
  } else if (
    hasF16 &&
    maxBufferSize >= 1024 * 1024 * 1024 &&
    (deviceMemoryGiB === null || deviceMemoryGiB >= 8)
  ) {
    tier = 'desktop-high';
  } else {
    tier = 'desktop-mid';
  }

  return {
    ...base,
    tier,
    hasF16,
    maxBufferSize,
    maxStorageBufferBindingSize,
    gpuVendor,
  };
}

/**
 * Headroom rule: weights land in Cache Storage AND in GPU memory during load,
 * so require noticeably more free storage than the model's runtime footprint.
 */
const STORAGE_HEADROOM = 1.6;

export interface ModelAvailability {
  /** False means the model cannot run here at all — hide or disable it. */
  usable: boolean;
  /** Show this model first. */
  recommended: boolean;
  /** Advisories to display before the user commits to a download. */
  warnings: string[];
  /** Present when `usable` is false. */
  blockedReason?: string;
}

/** Decide whether a given model should be offered on this device. */
export function assessModel(model: WebGPUModelSpec, device: DeviceProfile): ModelAvailability {
  const warnings: string[] = [];

  if (device.tier === 'no-webgpu') {
    return {
      usable: false,
      recommended: false,
      warnings,
      blockedReason:
        'This browser has no WebGPU support, so local models cannot run. Use the built-in pattern rules, or Gemini with your own API key.',
    };
  }

  if (device.tier === 'no-adapter') {
    return {
      usable: false,
      recommended: false,
      warnings,
      blockedReason:
        'Your browser supports WebGPU but could not get a usable GPU adapter — usually a blocklisted driver or software rendering. Local models cannot run here.',
    };
  }

  if (model.needsF16 && !device.hasF16) {
    const vendor = device.gpuVendor ? ` (${device.gpuVendor})` : '';
    return {
      usable: false,
      recommended: false,
      warnings,
      blockedReason:
        `Your GPU${vendor} does not support 16-bit shaders, which this build requires. ` +
        'Qualcomm chips — so most Android phones — cannot provide it. Pick the f32 model instead.',
    };
  }

  const needBytes = model.vramMB * 1024 * 1024 * STORAGE_HEADROOM;
  if (device.storageFreeBytes !== null && device.storageFreeBytes < needBytes) {
    return {
      usable: false,
      recommended: false,
      warnings,
      blockedReason:
        `Needs about ${formatSize(model.vramMB * STORAGE_HEADROOM)} of free browser storage, ` +
        `but only ${formatSize(device.storageFreeBytes / (1024 * 1024))} is available.`,
    };
  }

  if (device.deviceMemoryGiB !== null && model.vramMB > device.deviceMemoryGiB * 1024 * 0.4) {
    warnings.push(
      `This model needs roughly ${formatSize(model.vramMB)} of GPU memory and this device ` +
        `reports about ${device.deviceMemoryGiB} GB of RAM in total. It may fail partway ` +
        'through loading, or crash the tab.',
    );
  }

  if (device.isMobile) {
    warnings.push(
      'Local models on phones and tablets are slow — expect 30 to 90 seconds per generation, ' +
        'and the browser may reclaim memory mid-run. Gemini with your own key is a better fit here.',
    );
  }

  if (device.isIOS) {
    warnings.push(
      'Safari can evict cached model weights at any time, so you may have to download again later.',
    );
  }

  if (device.isMetered) {
    warnings.push(
      `This looks like a metered or slow connection. The download is roughly ` +
        `${formatSize(model.vramMB)} and will not resume if it is interrupted.`,
    );
  }

  return { usable: true, recommended: false, warnings };
}

/**
 * Assess every model and mark the single best pick for this device — the
 * largest usable model that carries no warnings, falling back to the smallest
 * usable one.
 */
export function assessAllModels(
  device: DeviceProfile,
): Array<{ model: WebGPUModelSpec; availability: ModelAvailability }> {
  const rows = WEBGPU_MODELS.map((model) => ({
    model,
    availability: assessModel(model, device),
  }));

  const clean = rows.filter((r) => r.availability.usable && r.availability.warnings.length === 0);
  const usable = rows.filter((r) => r.availability.usable);

  const pick =
    clean.length > 0
      ? clean.reduce((best, r) => (r.model.vramMB > best.model.vramMB ? r : best))
      : usable.length > 0
        ? usable.reduce((best, r) => (r.model.vramMB < best.model.vramMB ? r : best))
        : null;

  if (pick) pick.availability.recommended = true;
  return rows;
}
