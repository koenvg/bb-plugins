import type { Page } from "@playwright/test";

export type Layout = {
  width: number;
  overflow: boolean;
  chartWidth?: number;
  x: string[];
  y: string[];
  body: string;
  axisSpacing: { gap: number; contained: boolean } | null;
  tooltipContained: boolean;
  tooltipTheme: {
    background: string;
    backgroundAlpha: number;
    opacity: number;
    textContrast: { color: string; ratio: number }[];
  };
};
export function layout(page: Page): Promise<Layout> {
  return page.evaluate(`(() => {
    const s = document.querySelector('.recharts-surface');
    const y = [...document.querySelectorAll('.recharts-yAxis-tick-labels text')].map(e => e.textContent);
    const x = [...document.querySelectorAll('.recharts-xAxis-tick-labels text')].map(e => e.textContent);
    const label = document.querySelector('.recharts-label')?.getBoundingClientRect();
    const ticks = [...document.querySelectorAll('.recharts-yAxis-tick-labels text')].map(e => e.getBoundingClientRect());
    const bounds = s?.getBoundingClientRect();
    const tip = document.querySelector('.recharts-tooltip-wrapper [role=tooltip]')?.getBoundingClientRect();
    const tooltipContained = tip && bounds ? tip.left >= bounds.left && tip.right <= bounds.right && tip.top >= 0 && tip.bottom <= innerHeight : false;
    const tooltip = document.querySelector('.recharts-tooltip-wrapper [role=tooltip]');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const luminance = channels => channels.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const background = tooltip ? getComputedStyle(tooltip).backgroundColor : 'transparent';
    const backgroundRgba = rgba(background);
    const textColors = new Set();
    const walker = tooltip ? document.createTreeWalker(tooltip, NodeFilter.SHOW_TEXT) : null;
    while (walker?.nextNode()) {
      if (walker.currentNode.textContent.trim()) textColors.add(getComputedStyle(walker.currentNode.parentElement).color);
    }
    const textContrast = [...textColors].map(color => {
      const foreground = rgba(color);
      const composite = foreground.slice(0, 3).map((value, index) => value * foreground[3] / 255 + backgroundRgba[index] * (1 - foreground[3] / 255));
      const a = luminance(composite), b = luminance(backgroundRgba);
      return {color, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)};
    });
    let opacity = 1;
    for (let node = tooltip; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const tooltipTheme = {background, backgroundAlpha: backgroundRgba[3] / 255, opacity, textContrast};
    const axisSpacing = label && ticks.length && bounds ? {
      gap: Math.min(...ticks.map(r => r.left)) - label.right,
      contained: label.left >= bounds.left && ticks.every(r => r.left >= bounds.left)
    } : null;
    return {width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      axisSpacing, tooltipContained, tooltipTheme, chartWidth: s?.getBoundingClientRect().width, x, y,
      body: document.body.innerText};
  })()`);
}
