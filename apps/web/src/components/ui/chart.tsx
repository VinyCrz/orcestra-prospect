'use client';
import * as React from 'react';
import * as Recharts from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<string, { label: string; color?: string }>;

/** Container responsivo no estilo shadcn: expõe `--color-<chave>` a partir de tokens do tema (--chart-N). */
function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof Recharts.ResponsiveContainer>['children'];
}) {
  const style = Object.fromEntries(
    Object.entries(config).map(([k, v], i) => [`--color-${k}`, v.color ?? `var(--chart-${(i % 6) + 1})`]),
  ) as React.CSSProperties;
  return (
    <div
      data-slot="chart"
      style={style}
      className={cn(
        'w-full text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:outline-hidden',
        className,
      )}
      {...props}
    >
      <Recharts.ResponsiveContainer width="100%" height="100%">
        {children}
      </Recharts.ResponsiveContainer>
    </div>
  );
}

const ChartTooltip = Recharts.Tooltip;

interface PayloadItem {
  name?: string | number;
  value?: string | number;
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  formatter,
}: {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
  config: ChartConfig;
  formatter?: (valor: number, item: PayloadItem) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const titulo = (payload[0]?.payload?.nome as string | undefined) ?? label;
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-xl">
      {titulo !== undefined && <div className="font-medium">{titulo}</div>}
      {payload.map((p) => {
        const k = String(p.dataKey ?? p.name);
        return (
          <div key={k} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: `var(--color-${k})` }}
              aria-hidden
            />
            <span className="text-muted-foreground">{config[k]?.label ?? k}</span>
            <span className="ml-auto font-mono font-medium tabular-nums">
              {formatter ? formatter(Number(p.value), p) : Number(p.value).toLocaleString('pt-BR')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };
