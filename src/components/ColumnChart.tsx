"use client";

import { useId, useState } from "react";

/** Clean axis maximum: 1, 2, 5, 10, 20, 50… at or above `value`. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

const HEIGHT = 150;
const TOP = 18; // room for the value label on the tallest column
const BOTTOM = 22; // x labels

/**
 * Single-series column chart: thin columns with a rounded top, a hairline
 * grid, the tallest column labeled, a tooltip per column (hover or focus) and
 * a table view, so nothing depends on seeing the color.
 */
export function ColumnChart({
  title,
  values,
  labels,
  fullLabels,
  format,
  tableLabel,
  columnLabel,
}: {
  title: string;
  values: number[];
  /** Short x-axis labels (shown sparsely). */
  labels: string[];
  /** Full labels for the tooltip and table. */
  fullLabels: string[];
  format: (value: number) => string;
  tableLabel: string;
  columnLabel: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const plot = HEIGHT - TOP - BOTTOM;
  const max = niceMax(Math.max(...values));
  const band = width / values.length;
  const barWidth = Math.min(24, band * 0.62);
  const top = values.indexOf(Math.max(...values));
  const labelEvery = values.length > 10 ? Math.ceil(values.length / 7) : 1;
  const y = (value: number) => TOP + plot - (value / max) * plot;

  return (
    <figure className="rounded-2xl border border-border bg-surface p-4">
      <figcaption className="mb-2 font-semibold" id={`${id}-title`}>
        {title}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="w-full overflow-visible" role="img" aria-labelledby={`${id}-title`}>
          {[0, ...(Number.isInteger(max / 2) ? [max / 2] : []), max].map((tick) => (
            <g key={tick}>
              <line x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth={1} />
              <text x={width} y={y(tick) - 3} textAnchor="end" className="fill-muted text-[9px]">
                {tick === 0 ? "" : tick}
              </text>
            </g>
          ))}
          {values.map((value, i) => {
            const x = i * band + (band - barWidth) / 2;
            const h = Math.max(0, (value / max) * plot);
            const r = Math.min(4, h, barWidth / 2);
            const base = TOP + plot;
            return (
              <g key={i}>
                {h > 0 && (
                  <path
                    d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barWidth - r} Q${x + barWidth},${base - h} ${x + barWidth},${base - h + r} V${base} Z`}
                    fill="var(--chart)"
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {i === top && value > 0 && (
                  <text x={x + barWidth / 2} y={base - h - 5} textAnchor="middle" className="fill-text text-[10px] font-semibold">
                    {format(value)}
                  </text>
                )}
                {i % labelEvery === 0 || i === values.length - 1 ? (
                  <text x={x + barWidth / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[9px]">
                    {labels[i]}
                  </text>
                ) : null}
                {/* Hit target: the whole column band, bigger than the mark. */}
                <rect
                  x={i * band}
                  y={TOP}
                  width={band}
                  height={plot}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${fullLabels[i]}: ${format(value)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="outline-none focus-visible:stroke-[var(--chart)]"
                />
              </g>
            );
          })}
        </svg>
        {active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-border bg-bg px-2 py-1 text-xs whitespace-nowrap shadow"
            style={{ left: `${((active + 0.5) / values.length) * 100}%` }}
          >
            <strong>{format(values[active])}</strong> <span className="text-muted">{fullLabels[active]}</span>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-start">
          <thead>
            <tr className="text-muted">
              <th className="text-start font-medium">{columnLabel}</th>
              <th className="text-end font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, i) => (
              <tr key={i}>
                <td>{fullLabels[i]}</td>
                <td className="text-end tabular-nums">{format(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
