/** Each feature has its own colour, used in nav, headers and cards. */
export const FEATURES = {
  preflight: {
    href: "/preflight/new",
    label: "Preflight",
    emoji: "🎬",
    color: "var(--lime)",
    soft: "bg-lime-soft",
    solid: "bg-lime",
  },
  rights: {
    href: "/rights",
    label: "Rights",
    emoji: "🗂️",
    color: "var(--violet)",
    soft: "bg-violet-soft",
    solid: "bg-violet",
  },
  brands: {
    href: "/brands",
    label: "Brands",
    emoji: "💖",
    color: "var(--pink)",
    soft: "bg-pink-soft",
    solid: "bg-pink",
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
