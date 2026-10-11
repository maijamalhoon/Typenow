export function relativeLuminance(hex: string): number {
  if (!/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(hex)) {
    throw new Error(`Expected a three- or six-digit hex color, received "${hex}".`);
  }

  const normalized = /^#[\da-f]{3}$/i.test(hex)
    ? `#${[...hex.slice(1)].map((channel) => `${channel}${channel}`).join("")}`
    : hex;
  const channels = normalized
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

  if (!channels || channels.length !== 3) throw new Error(`Could not parse color "${hex}".`);

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(foreground: string, background: string): number {
  const lightest = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darkest = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lightest + 0.05) / (darkest + 0.05);
}
