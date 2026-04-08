import {
  TriangleAlert,
  Wine,
  Package,
  BedDouble,
  Armchair,
  Sofa,
  Lamp,
  Shirt,
  Plug,
  Layers,
  type LucideIcon,
} from "lucide-react";

export const LABEL_COLORS: Record<string, string> = {
  rubbish_pile: "#EF4444",
  bottle: "#22C55E",
  carton: "#EAB308",
  mattress: "#3B82F6",
  chair: "#A855F7",
  couch: "#EC4899",
  furniture: "#14B8A6",
  clothes: "#F97316",
  electrical_goods: "#06B6D4",
  rug: "#84CC16",
};

export const LABEL_ICONS: Record<string, LucideIcon> = {
  rubbish_pile: TriangleAlert,
  bottle: Wine,
  carton: Package,
  mattress: BedDouble,
  chair: Armchair,
  couch: Sofa,
  furniture: Lamp,
  clothes: Shirt,
  electrical_goods: Plug,
  rug: Layers,
};

export const LABEL_DISPLAY_NAMES: Record<string, string> = {
  rubbish_pile: "Rubbish",
  bottle: "Bottle",
  carton: "Carton",
  mattress: "Mattress",
  chair: "Chair",
  couch: "Couch",
  furniture: "Furniture",
  clothes: "Clothes",
  electrical_goods: "Electronics",
  rug: "Rug",
};

export function getLabelColor(label: string): string {
  return LABEL_COLORS[label] || "#9CA3AF";
}

export function getLabelIcon(label: string): LucideIcon {
  return LABEL_ICONS[label] || TriangleAlert;
}

export function getLabelDisplayName(label: string): string {
  return LABEL_DISPLAY_NAMES[label] || label;
}
