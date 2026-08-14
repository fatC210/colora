import type { ReactNode } from "react";
import { FileJson } from "lucide-react";
import { CopyButton } from "../primitives";

export function CodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="w-28 shrink-0 text-sm font-medium">{label}</span>
      <span className="flex-1 break-all font-mono text-xs text-muted-foreground">{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

export function SectionShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileJson;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.6} />
        {title}
      </div>
      {children}
    </section>
  );
}
