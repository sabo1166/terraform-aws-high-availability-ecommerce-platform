import type { ProductArt } from "../domain/types.js";

/**
 * DEMO DATA. Oriel is a fictional brand and these products do not exist. Descriptions, prices, and
 * stock levels are invented for demonstration only; there are no real customers, reviews, or sales.
 */
export const seedCategories = [
  { slug: "ceramics", name: "Ceramics", description: "Vases, bowls, and planters with a quiet, sculptural presence." },
  { slug: "lighting", name: "Lighting", description: "Table lamps that give a room a warm, low glow." },
  { slug: "textiles", name: "Textiles", description: "Throws and cushions in soft, tactile weaves." },
  { slug: "scent", name: "Candles & Scent", description: "Slow-burning candles in considered, understated scents." },
  { slug: "table", name: "Table & Kitchen", description: "Trays, mugs, and everyday pieces made to be used." },
] as const;

interface SeedVariant {
  label: string;
  options: Record<string, string>;
  price: number; // dollars with cents, converted to integer cents below
  stock: number;
}

interface SeedProduct {
  slug: string;
  name: string;
  category: (typeof seedCategories)[number]["slug"];
  art: ProductArt;
  description: string;
  highlights: string[];
  specs: Record<string, string>;
  variants: SeedVariant[];
  featured?: boolean;
}

const v = (label: string, color: string, price: number, stock: number, extra: Record<string, string> = {}): SeedVariant => ({
  label,
  options: { ...extra, Finish: color },
  price,
  stock,
});

export const seedProducts: SeedProduct[] = [
  {
    slug: "arc-vase",
    name: "Arc Vase",
    category: "ceramics",
    art: { shape: "vase", palette: ["#d9c3a5", "#b8855b", "#f4ece1"] },
    description:
      "A softly curved stoneware vase with a matte glaze. Sized for a few stems or simply left to stand on its own.",
    highlights: ["Matte glaze", "Waterproof interior", "Stands alone as sculpture"],
    specs: { Material: "Stoneware", Height: "28 cm", Care: "Wipe clean" },
    variants: [v("Sand", "Sand", 64, 14), v("Clay", "Clay", 64, 9)],
    featured: true,
  },
  {
    slug: "pebble-bowl",
    name: "Pebble Bowl",
    category: "ceramics",
    art: { shape: "bowl", palette: ["#e8dccb", "#c9a47a", "#faf5ec"] },
    description: "A wide, shallow bowl with a thumb-worn rim. Equally at home with fruit, keys, or nothing at all.",
    highlights: ["Wide, shallow form", "Dishwasher safe"],
    specs: { Material: "Stoneware", Diameter: "24 cm", Care: "Dishwasher safe" },
    variants: [v("Natural", "Natural", 42, 22)],
  },
  {
    slug: "column-vase",
    name: "Column Vase",
    category: "ceramics",
    art: { shape: "vase", palette: ["#3e4a45", "#6f8277", "#d9e1dc"] },
    description: "A tall, narrow column glazed in deep moss green. Built for single branches and dried grasses.",
    highlights: ["Tall, narrow neck", "Deep moss glaze"],
    specs: { Material: "Stoneware", Height: "40 cm" },
    variants: [v("Moss", "Moss", 78, 6)],
  },
  {
    slug: "ridge-planter",
    name: "Ridge Planter",
    category: "ceramics",
    art: { shape: "bowl", palette: ["#b8855b", "#8a5a3a", "#f0d9c0"] },
    description: "A ribbed terracotta-toned planter with a drainage hole and matching saucer.",
    highlights: ["Drainage hole and saucer", "Ribbed texture"],
    specs: { Material: "Glazed stoneware", Diameter: "18 cm" },
    variants: [v("Small", "Terracotta", 36, 18, { Size: "Small" }), v("Large", "Terracotta", 58, 0, { Size: "Large" })],
  },
  {
    slug: "dune-serving-bowl",
    name: "Dune Serving Bowl",
    category: "ceramics",
    art: { shape: "bowl", palette: ["#efe6d8", "#cdb99a", "#fffaf0"] },
    description: "A generous serving bowl with a sandy speckle. Large enough for salad, sturdy enough for daily use.",
    highlights: ["Speckled glaze", "Generous 30 cm width"],
    specs: { Material: "Stoneware", Diameter: "30 cm" },
    variants: [v("Speckled", "Speckled", 69, 11)],
  },
  {
    slug: "moon-jar",
    name: "Moon Jar",
    category: "ceramics",
    art: { shape: "vase", palette: ["#f1ede4", "#d4ccbb", "#ffffff"] },
    description: "A rounded, lidless jar inspired by traditional moon jar silhouettes, finished in a creamy white glaze.",
    highlights: ["Rounded silhouette", "Creamy white glaze"],
    specs: { Material: "Porcelain", Height: "26 cm" },
    variants: [v("White", "White", 92, 5)],
    featured: true,
  },
  {
    slug: "halo-table-lamp",
    name: "Halo Table Lamp",
    category: "lighting",
    art: { shape: "lamp", palette: ["#e8d6bd", "#b38b5d", "#fff6e6"] },
    description: "A ceramic base topped with a pleated linen shade that spreads a warm, even light across a side table.",
    highlights: ["Linen shade", "Ceramic base", "Inline dimmer switch"],
    specs: { Base: "Ceramic", Shade: "Linen", Bulb: "E27, up to 9 W LED (not included)" },
    variants: [v("Sand", "Sand", 148, 8), v("Charcoal", "Charcoal", 148, 3)],
    featured: true,
  },
  {
    slug: "ember-desk-lamp",
    name: "Ember Desk Lamp",
    category: "lighting",
    art: { shape: "lamp", palette: ["#2f2a28", "#c8643c", "#f3d9c8"] },
    description: "A compact desk lamp with an adjustable arm and a copper-toned shade for focused, warm task light.",
    highlights: ["Adjustable arm", "Copper-toned shade"],
    specs: { Material: "Powder-coated steel", Bulb: "E14, up to 6 W LED (not included)" },
    variants: [v("Black and copper", "Black", 119, 12)],
  },
  {
    slug: "lantern-lamp",
    name: "Lantern Lamp",
    category: "lighting",
    art: { shape: "lamp", palette: ["#d8cdb9", "#8c7b63", "#f9f3e6"] },
    description: "A portable, rechargeable lamp with a frosted glass shade. Move it from table to terrace.",
    highlights: ["Rechargeable", "Frosted glass shade"],
    specs: { Battery: "USB-C rechargeable", Material: "Frosted glass, metal" },
    variants: [v("Stone", "Stone", 96, 15)],
  },
  {
    slug: "oval-bedside-lamp",
    name: "Oval Bedside Lamp",
    category: "lighting",
    art: { shape: "lamp", palette: ["#efe3d0", "#a8896b", "#fff8ee"] },
    description: "A low, oval-shaped lamp in a smooth satin glaze, sized to sit comfortably beside a bed.",
    highlights: ["Low profile", "Satin glaze"],
    specs: { Base: "Ceramic", Height: "34 cm" },
    variants: [v("Oat", "Oat", 134, 7)],
  },
  {
    slug: "loom-wool-throw",
    name: "Loom Wool Throw",
    category: "textiles",
    art: { shape: "throw", palette: ["#c9b8a0", "#7c6a56", "#ece3d3"] },
    description: "A heavyweight wool-blend throw with a tonal stripe and fringed ends. Folded on a sofa or opened on a cold evening.",
    highlights: ["Wool blend", "Fringed ends", "Tonal stripe"],
    specs: { Material: "Wool blend", Size: "130 x 180 cm", Care: "Dry clean" },
    variants: [v("Oat", "Oat", 128, 10), v("Heather", "Heather", 128, 4)],
    featured: true,
  },
  {
    slug: "field-linen-throw",
    name: "Field Linen Throw",
    category: "textiles",
    art: { shape: "throw", palette: ["#b9c2a8", "#7f8a6c", "#eef0e4"] },
    description: "A light, washed-linen throw that softens with every wash. Good for warm evenings and layering.",
    highlights: ["Washed linen", "Machine washable"],
    specs: { Material: "100% linen", Size: "130 x 170 cm", Care: "Machine wash cold" },
    variants: [v("Sage", "Sage", 98, 13)],
  },
  {
    slug: "boucle-cushion",
    name: "Bouclé Cushion",
    category: "textiles",
    art: { shape: "pillow", palette: ["#f1ebe0", "#d3c7b2", "#ffffff"] },
    description: "A plump cushion in textured bouclé with a concealed zip and a feather-alternative insert.",
    highlights: ["Textured bouclé", "Insert included"],
    specs: { Material: "Polyester bouclé", Size: "50 x 50 cm" },
    variants: [v("Cream", "Cream", 58, 20), v("Mocha", "Mocha", 58, 0)],
  },
  {
    slug: "stripe-cushion",
    name: "Stripe Cushion",
    category: "textiles",
    art: { shape: "pillow", palette: ["#32404f", "#8a9bb0", "#e8edf3"] },
    description: "A cotton cushion with a woven stripe in two tones of blue. Mixes easily with solid textiles.",
    highlights: ["Woven stripe", "Cotton cover"],
    specs: { Material: "Cotton", Size: "45 x 45 cm" },
    variants: [v("Indigo", "Indigo", 48, 16)],
  },
  {
    slug: "waffle-throw",
    name: "Waffle Throw",
    category: "textiles",
    art: { shape: "throw", palette: ["#e3d9cc", "#bba98f", "#f9f5ee"] },
    description: "A cotton waffle-weave throw, breathable enough for summer and layered easily in winter.",
    highlights: ["Waffle weave", "Breathable cotton"],
    specs: { Material: "Cotton", Size: "125 x 150 cm" },
    variants: [v("Oat", "Oat", 82, 9)],
  },
  {
    slug: "fig-cedar-candle",
    name: "Fig & Cedar Candle",
    category: "scent",
    art: { shape: "candle", palette: ["#6d5a4a", "#a98a6a", "#f4e8d8"] },
    description: "A soy-wax candle scented with green fig and dry cedarwood, poured into a reusable ceramic vessel.",
    highlights: ["Soy wax", "Reusable ceramic vessel", "Cotton wick"],
    specs: { Wax: "Soy", Burn: "About 45 hours (small)" },
    variants: [v("Small", "Fig", 34, 30, { Size: "Small" }), v("Large", "Fig", 58, 17, { Size: "Large" })],
    featured: true,
  },
  {
    slug: "amber-resin-candle",
    name: "Amber Resin Candle",
    category: "scent",
    art: { shape: "candle", palette: ["#7a4a2a", "#d19a5a", "#f6e3c4"] },
    description: "A warm, resinous candle with notes of amber and sandalwood in a smoked glass jar.",
    highlights: ["Smoked glass jar", "Amber and sandalwood"],
    specs: { Wax: "Soy blend", Burn: "About 50 hours" },
    variants: [v("Standard", "Amber", 44, 21)],
  },
  {
    slug: "salt-sage-candle",
    name: "Salt & Sage Candle",
    category: "scent",
    art: { shape: "candle", palette: ["#a9b5a0", "#6f7d65", "#eef2e8"] },
    description: "A fresh, herbal candle with sea salt and sage, poured into a pale green vessel.",
    highlights: ["Sea salt and sage", "Pale green vessel"],
    specs: { Wax: "Soy blend", Burn: "About 45 hours" },
    variants: [v("Standard", "Sage", 38, 25)],
  },
  {
    slug: "hearth-tin-candle",
    name: "Hearth Tin Candle",
    category: "scent",
    art: { shape: "candle", palette: ["#3a3a3a", "#8b8b8b", "#eeeeee"] },
    description: "A travel-size candle in a lidded tin, scented with woodsmoke and vetiver.",
    highlights: ["Lidded tin", "Woodsmoke and vetiver"],
    specs: { Wax: "Soy blend", Burn: "About 20 hours" },
    variants: [v("Tin", "Graphite", 22, 40)],
  },
  {
    slug: "oak-serving-tray",
    name: "Oak Serving Tray",
    category: "table",
    art: { shape: "tray", palette: ["#c9a26c", "#9a7440", "#f0dfc0"] },
    description: "A solid oak tray with simple cut-out handles. Oiled finish, made to take the marks of daily use.",
    highlights: ["Solid oak", "Cut-out handles", "Oiled finish"],
    specs: { Material: "Oak", Size: "45 x 30 cm", Care: "Wipe clean, re-oil occasionally" },
    variants: [v("Oak", "Oak", 76, 12)],
    featured: true,
  },
  {
    slug: "walnut-tray",
    name: "Walnut Tray",
    category: "table",
    art: { shape: "tray", palette: ["#5a4030", "#3b2a1f", "#cdb59b"] },
    description: "A darker, deeper tray in walnut for the coffee table or breakfast in bed.",
    highlights: ["Solid walnut", "Raised edge"],
    specs: { Material: "Walnut", Size: "50 x 34 cm" },
    variants: [v("Walnut", "Walnut", 96, 2)],
  },
  {
    slug: "stoneware-mug-set",
    name: "Stoneware Mug Set",
    category: "table",
    art: { shape: "mug", palette: ["#d6cbb9", "#a8957a", "#f7f1e6"] },
    description: "A set of two stoneware mugs with a comfortable handle and a wide, stable base.",
    highlights: ["Set of two", "Dishwasher safe"],
    specs: { Material: "Stoneware", Capacity: "350 ml each" },
    variants: [v("Sand", "Sand", 38, 26), v("Slate", "Slate", 38, 14)],
    featured: true,
  },
  {
    slug: "everyday-mug",
    name: "Everyday Mug",
    category: "table",
    art: { shape: "mug", palette: ["#e9e1d3", "#c0b39b", "#fcf9f2"] },
    description: "A single, sturdy mug in a plain glaze. A reliable choice for coffee, tea, or soup.",
    highlights: ["Sturdy handle", "Dishwasher safe"],
    specs: { Material: "Stoneware", Capacity: "400 ml" },
    variants: [v("Cream", "Cream", 18, 50)],
  },
  {
    slug: "espresso-cup-set",
    name: "Espresso Cup Set",
    category: "table",
    art: { shape: "mug", palette: ["#29323a", "#586b7a", "#dbe3e9"] },
    description: "Four small espresso cups with a thick, heat-holding wall and a deep midnight glaze.",
    highlights: ["Set of four", "Heat-holding walls"],
    specs: { Material: "Stoneware", Capacity: "90 ml each" },
    variants: [v("Midnight", "Midnight", 44, 19)],
  },
];

export const toCents = (dollars: number): number => Math.round(dollars * 100);
