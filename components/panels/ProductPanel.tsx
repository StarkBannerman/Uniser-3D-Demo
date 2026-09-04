"use client";

/**
 * Product attribution.
 *
 * The commercial heart of the tool. Ambiance is what makes a client lean
 * forward; a part number is what lets them buy it. Every control on the stage
 * links here, so "I like what that does" turns into "that is a Magneto Series
 * head on a SmartSpaces Wired dimmer" without the salesperson reaching for a
 * catalogue.
 *
 * Unverified specs are badged, loudly and on purpose — see the header comment
 * in `lib/catalog/products.ts`.
 */

import type { Device, Product } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { getProduct } from "@/lib/catalog/products";
import { SectionLabel } from "@/components/ui/Primitives";

function UnverifiedBadge() {
  return (
    <span
      title="Specifications are placeholder figures, not from a Uniser datasheet. Do not quote these."
      className="shrink-0 rounded border border-warn-500/50 bg-warn-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warn-500"
    >
      Unverified
    </span>
  );
}

function ProductDetail({
  product,
  device,
}: {
  product: Product;
  device?: Device;
}) {
  return (
    <div className="rounded-xl border border-brass-600/40 bg-shell-850 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-brass-500">
            {product.family}
          </div>
          <h3 className="text-sm font-semibold text-shell-100">{product.name}</h3>
        </div>
        {!product.verified && <UnverifiedBadge />}
      </div>

      <p className="mt-2 text-[12px] leading-snug text-shell-300">
        {product.summary}
      </p>

      {device?.pitch && (
        <p className="mt-2 border-l-2 border-brass-600/50 pl-2 text-[12px] italic leading-snug text-shell-400">
          {device.pitch}
        </p>
      )}

      <dl className="mt-3 space-y-1">
        {Object.entries(product.specs).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-[11px]">
            <dt className="w-[42%] shrink-0 text-shell-500">{key}</dt>
            <dd className="font-mono text-shell-200">{value}</dd>
          </div>
        ))}
      </dl>

      {device?.kind === "light" && (
        <div className="mt-3 border-t border-shell-800 pt-2 text-[11px] text-shell-400">
          As installed here:{" "}
          <span className="font-mono text-shell-200">
            {device.fixtures} × {device.wattsEach} W
          </span>{" "}
          ={" "}
          <span className="font-mono text-shell-200">
            {device.fixtures * device.wattsEach} W
          </span>{" "}
          connected load
        </div>
      )}
    </div>
  );
}

export function ProductPanel() {
  const space = useSim((s) => s.space);
  const selectedDeviceId = useSim((s) => s.selectedDeviceId);
  const touched = useSim((s) => s.touchedProductIds);
  const select = useSim((s) => s.select);

  if (!space) return null;

  const selectedDevice = space.devices.find((d) => d.id === selectedDeviceId);
  const selectedProduct = selectedDevice
    ? getProduct(selectedDevice.productId)
    : undefined;

  // One row per product, listing every device it appears as, so a strip used in
  // three places reads as one line item rather than three.
  const byProduct = new Map<string, Device[]>();
  for (const device of space.devices) {
    const list = byProduct.get(device.productId) ?? [];
    list.push(device);
    byProduct.set(device.productId, list);
  }

  return (
    <div className="space-y-3">
      {selectedProduct ? (
        <ProductDetail product={selectedProduct} device={selectedDevice} />
      ) : (
        <p className="rounded-xl border border-dashed border-shell-800 p-3 text-[12px] leading-snug text-shell-500">
          Select any control, or a line below, to show the client exactly which
          Uniser product is doing the work.
        </p>
      )}

      <div>
        <SectionLabel>Specified in this space</SectionLabel>
        <ul className="space-y-1">
          {[...byProduct.entries()].map(([productId, devices]) => {
            const product = getProduct(productId);
            if (!product) return null;
            const isSelected = selectedDevice?.productId === productId;
            const shown = touched.includes(productId);

            return (
              <li key={productId}>
                <button
                  type="button"
                  onClick={() => select(devices[0].id)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-brass-600/60 bg-shell-850"
                      : "border-shell-800 bg-shell-900/40 hover:border-shell-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      title={
                        shown
                          ? "Shown during this demo"
                          : "Not yet shown during this demo"
                      }
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        shown ? "bg-brass-500" : "bg-shell-700"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-shell-100">
                      {product.name}
                    </span>
                    {!product.verified && <UnverifiedBadge />}
                  </div>
                  <div className="mt-0.5 truncate pl-3.5 text-[10px] text-shell-500">
                    {devices.map((d) => d.name).join(" · ")}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 px-1 text-[10px] leading-snug text-shell-600">
          A filled dot marks a product actually demonstrated in this session.
          This list becomes the client&apos;s spec sheet in phase 3.
        </p>
      </div>
    </div>
  );
}
