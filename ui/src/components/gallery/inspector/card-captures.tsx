import { useState } from "react";
import { Status } from "@/components/common";
import { useMediaViewer } from "@/components/viewer/media-viewer";
import { asset } from "@/lib/api";
import { language } from "@/lib/format";
import { devicesFor, type ProjectModel } from "@/lib/project";
import type { Callout, Card } from "@/lib/types";
import { Section } from "./section";

/** The card's captures in this language (the reference's where one is missing), and its callouts. */
export function CardCaptures({
  model,
  card,
  locale,
}: {
  model: ProjectModel;
  card: Card;
  locale: string;
}) {
  const devices = devicesFor(card);
  return (
    <Section
      title={devices.length === 1 ? "Capture" : `Captures · ${devices.length}`}
    >
      {devices.length ? (
        <div className="grid grid-cols-3 gap-3">
          {devices.map((device, i) => (
            <Capture
              key={`${locale}:${device.raw}:${i}`}
              model={model}
              locale={locale}
              raw={device.raw}
              role={device.role}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Art only: this card shows no capture.
        </p>
      )}
      {(card.callouts || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Callouts</p>
          <ul className="space-y-1.5">
            {card.callouts!.map((callout, i) => (
              <CalloutRow key={i} callout={callout} />
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Capture({
  model,
  locale,
  raw,
  role,
}: {
  model: ProjectModel;
  locale: string;
  raw: string;
  role?: string;
}) {
  const openViewer = useMediaViewer();
  const [from, setFrom] = useState<string | null>(locale);
  const src = from ? asset(model.base, `../${from}/raw/${raw}`) : null;
  return (
    <figure className="min-w-0 space-y-1.5">
      <button
        type="button"
        aria-label={`Show capture ${raw}`}
        disabled={!src}
        onClick={(event) =>
          src &&
          openViewer(
            {
              items: [
                {
                  id: src,
                  type: "image",
                  src,
                  title: raw,
                  description: `${language(from || locale)} capture`,
                  filename: raw.split("/").at(-1),
                },
              ],
            },
            event.currentTarget,
          )
        }
        className="block aspect-[9/16] w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-default"
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className="size-full object-contain"
            onError={() =>
              setFrom(from !== model.reference ? model.reference : null)
            }
          />
        ) : (
          <span className="grid size-full place-items-center p-2 text-center text-[11px] text-muted-foreground">
            Missing
          </span>
        )}
      </button>
      <figcaption className="space-y-0.5 text-[11px] leading-tight">
        <span className="block truncate font-mono" title={raw}>
          {raw.split("/").at(-1)}
        </span>
        {(role || (from && from !== locale)) && (
          <span className="block truncate text-muted-foreground">
            {[role, from && from !== locale ? `${from} fallback` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function CalloutRow({ callout }: { callout: Callout }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
      <span className="font-mono tabular-nums">
        {callout.w}×{callout.h} at {callout.x},{callout.y}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {callout.mag ? `×${callout.mag}` : null}
        {callout.target ? (
          <Status tone="info" className="text-[10px]">
            {callout.targetMode === "element" ? "Element" : "Anchored"}
          </Status>
        ) : (
          <Status className="text-[10px]">Box</Status>
        )}
      </span>
    </li>
  );
}
