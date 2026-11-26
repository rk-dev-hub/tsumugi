/** プロジェクトの色（globals.css の --p0〜--p11） */
export function projectColor(index: number) {
  const i = ((index % 12) + 12) % 12;
  return {
    solid: `var(--p${i})`,
    soft: `var(--p${i}-soft)`,
    ink: `var(--p${i}-ink)`,
    gradient: `linear-gradient(160deg, var(--p${i}-soft), color-mix(in oklch, var(--p${i}-soft) 70%, var(--p${i}) 30%))`,
  };
}
