import { bestTextOn, simulateCB, type CBMode } from "@/lib/color";

export function colorSvg(colors: string[], width = 180, height = 180) {
  const sliceWidth = Math.max(1, Math.floor(width / Math.max(colors.length, 1)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${colors
    .map(
      (color, index) =>
        `<rect x="${index * sliceWidth}" y="0" width="${sliceWidth}" height="${height}" fill="${color}" />`,
    )
    .join("")}</svg>`;
}

export function colorPng(colors: string[], labels: string[] = []) {
  const canvas = document.createElement("canvas");
  const width = 240 * Math.max(colors.length, 1);
  const height = 320;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  colors.forEach((color, index) => {
    const x = index * 240;
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 240, height - 70);
    ctx.fillStyle = bestTextOn(color);
    ctx.font = "20px Inter, 'Noto Sans SC', system-ui, sans-serif";
    ctx.fillText(labels[index] ?? color, x + 18, height - 28);
  });
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  });
}

export function gradientCss(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const stopList = stops
    .map((stop) => `${simulateCB(stop.hex, "none" as CBMode)} ${Math.round(stop.pos)}%`)
    .join(", ");
  if (config.type === "radial")
    return `background: radial-gradient(circle at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  if (config.type === "conic")
    return `background: conic-gradient(from ${config.angle}deg at ${config.center.x}% ${config.center.y}%, ${stopList});`;
  return `background: linear-gradient(${config.angle}deg, ${stopList});`;
}

export function gradientSvg(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  if (config.type === "radial") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><radialGradient id="gradient" cx="${config.center.x}%" cy="${config.center.y}%">${stops
      .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
      .join(
        "",
      )}</radialGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><defs><linearGradient id="gradient" gradientTransform="rotate(${config.angle})">${stops
    .map((stop) => `<stop offset="${Math.round(stop.pos)}%" stop-color="${stop.hex}" />`)
    .join(
      "",
    )}</linearGradient></defs><rect width="100%" height="100%" fill="url(#gradient)"/></svg>`;
}

export function gradientPng(
  config: { type: string; angle: number; center: { x: number; y: number } },
  stops: { hex: string; pos: number }[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (config.type === "radial") {
    const gradient = ctx.createRadialGradient(
      config.center.x * 10,
      config.center.y * 10,
      10,
      500,
      500,
      700,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  if (config.type === "conic" && "createConicGradient" in ctx) {
    const gradient = (
      ctx as CanvasRenderingContext2D & { createConicGradient: typeof ctx.createConicGradient }
    ).createConicGradient(
      (config.angle * Math.PI) / 180,
      config.center.x * 10,
      config.center.y * 10,
    );
    stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 1000);
    return canvas;
  }

  const gradient = ctx.createLinearGradient(0, 0, 1000, 0);
  stops.forEach((stop) => gradient.addColorStop(stop.pos / 100, stop.hex));
  ctx.fillStyle = gradient;
  ctx.save();
  ctx.translate(500, 500);
  ctx.rotate((config.angle * Math.PI) / 180);
  ctx.translate(-500, -500);
  ctx.fillRect(0, 0, 1000, 1000);
  ctx.restore();
  return canvas;
}
