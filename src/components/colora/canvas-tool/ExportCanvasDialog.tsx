import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * 画布导出弹窗。参考 Excalidraw ImageExportDialog：
 * 预览 + 设置项（含背景开关、缩放倍率）+ 底部导出按钮（PNG / SVG / JSON）。
 * 每个设置项左侧标签、右侧控件，视觉统一。
 */
export type ExportOptions = {
  withBackground: boolean;
  scale: number;
};

export function ExportCanvasDialog({
  open,
  onOpenChange,
  preview,
  options,
  onOptionsChange,
  onExportPng,
  onExportSvg,
  onExportJson,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview?: React.ReactNode;
  options: ExportOptions;
  onOptionsChange: (next: Partial<ExportOptions>) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
}) {
  const { withBackground, scale } = options;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-base">导出画布</DialogTitle>
          <DialogDescription className="text-xs">选择格式与选项，导出整张画布。</DialogDescription>
        </DialogHeader>

        {/* 预览区 */}
        {preview && (
          <div className="mx-5 mt-4 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
            {preview}
          </div>
        )}

        {/* 设置项：每项一行，左标签 + 右控件，参考 Excalidraw ExportSetting */}
        <div className="mx-5 mt-4 space-y-3">
          <SettingRow label="含背景">
            <Switch
              checked={withBackground}
              onCheckedChange={(checked) => onOptionsChange({ withBackground: checked })}
            />
          </SettingRow>
          <SettingRow label="缩放">
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onOptionsChange({ scale: s })}
                  className={cn(
                    "h-7 min-w-9 rounded-md border px-2 text-xs font-medium transition-colors",
                    scale === s
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </SettingRow>
        </div>

        <DialogFooter className="gap-2 px-5 pb-5 pt-5 sm:flex-col sm:space-x-0">
          <Button type="button" className="h-9 w-full gap-1.5 text-xs" onClick={onExportPng}>
            <Download className="size-4" /> 导出 PNG ({scale}×)
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full gap-1.5 text-xs"
              onClick={onExportSvg}
            >
              <Download className="size-4" /> SVG
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full gap-1.5 text-xs"
              onClick={onExportJson}
            >
              <Download className="size-4" /> JSON
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 设置行：左侧标签 + 右侧控件，两端对齐。 */
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
