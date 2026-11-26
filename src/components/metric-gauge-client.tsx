"use client";

import { MetricGauge } from "./metric-gauge";

/** クライアントコンポーネントから使うゲージ（書式は単位で指定する）。 */
export function MetricGaugeClient({
  unit,
  ...props
}: Omit<React.ComponentProps<typeof MetricGauge>, "format"> & {
  unit: string;
}) {
  return (
    <MetricGauge {...props} tone="primary" format={(v) => `${v} ${unit}`} />
  );
}
