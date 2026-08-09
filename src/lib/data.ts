// ── Core data & config, ported from the legacy Broast Al Bahr app ──

export interface MenuItem {
  id: number | string;
  name: string;
  nameAr: string;
  price: number;
  emoji: string;
  cal: string;
  available: boolean;
  qty?: number;
  /** Uploaded product photo URL (Firebase Storage or any URL, e.g. GitHub raw). */
  img?: string;
  /** Optional per-item note from the customer (e.g. "no onions"). Displays everywhere. */
  note?: string;
  /** Branches the item is sold at. ["all"] or a list of branchIds. Admin-managed. */
  branches?: string[];
  /** Per-branch on/off override; missing branchId key = follow `available`. Admin-managed. */
  availability?: Record<string, boolean>;
}
export type Menu = Record<string, MenuItem[]>;
export interface Branch {
  id: string;
  nameEn: string;
  nameAr: string;
  whatsapp: string;
  lat: number;
  lng: number;
  // Phase 4 additions — all optional so existing/hardcoded rows stay valid.
  phone?: string;
  address?: string;
  active?: boolean;
  hours?: { open?: string; close?: string };
  menuOverrides?: string[];
  prepMinutesPickup?: number;
  prepMinutesDelivery?: number;
}
export interface Coupon { discount: number; type: 'percent' | 'fixed'; label: string; }

export const WHATSAPP_NUMBER = '966500959394';
export const VAT_RATE = 0.15;

// Fallback list — used only when the live `branches` Firestore collection is empty.
// Once the admin panel adds branches in Phase 4 this list becomes dead code.
export const BRANCHES: Branch[] = [
  { id: 'kakkiyah', nameEn: 'Broast Al Bahr (Kakkiyah)', nameAr: 'بروست البحر (فرع الكعكية)', whatsapp: '966500959394', lat: 21.3765717, lng: 39.8037236 },
  { id: 'subhani', nameEn: 'Broast Al Bahr (Subhani)', nameAr: 'بروست البحر (فرع السبهاني)', whatsapp: '966508379339', lat: 21.3525607, lng: 39.7843825 },
  { id: 'waliy', nameEn: 'Broast Al Bahr (Waliy Al Ahd)', nameAr: 'بروست البحر (فرع ولي العهد)', whatsapp: '966550061771', lat: 21.3395794, lng: 39.6925430 },
];

export const VALID_COUPONS: Record<string, Coupon> = {
  ALBAHR10: { discount: 10, type: 'percent', label: '10% off' },
  WELCOME5: { discount: 5, type: 'fixed', label: 'SR 5 off' },
  BROAST15: { discount: 15, type: 'percent', label: '15% off' },
};

export const PAYMENT_METHODS: [string, string, string][] = [
  ['cash', '💵', 'Cash'],
];

export const PICKUP_SLOTS = ['ASAP', '15 min', '30 min', '45 min', '1 hour'];

export const DEFAULT_MENU: Menu = {
    "🍗 Broast": [
        { id: 1, name: "Broast 4 Pcs Normal / Spicy", nameAr: "بروست 4 قطع عادي / حراق", price: 18, emoji: "🍗", cal: "750 kcal", available: true },
        { id: 2, name: "Broast 8 Pcs Normal / Spicy", nameAr: "بروست 8 قطع عادي / حراق", price: 35, emoji: "🍗", cal: "2500 kcal", available: true },
        { id: 3, name: "Chicken Mushab Plate 6 Pcs Spicy/Normal", nameAr: "صحن مسحب دجاج 6 قطع عادي / حراق", price: 15, emoji: "🍗", cal: "400 kcal", available: true },
        { id: 4, name: "Chicken Mushab Plate 8 Pcs Spicy/Normal", nameAr: "صحن مسحب دجاج 8 قطع عادي / حراق", price: 19, emoji: "🍗", cal: "580 kcal", available: true },
        { id: 5, name: "Zinger Plate 4 Pcs", nameAr: "صحن زنجر 4 قطع", price: 22, emoji: "🍗", cal: "820 kcal", available: true },
        { id: 6, name: "Chicken Crispy", nameAr: "دجاج كرسبي", price: 17, emoji: "🍗", cal: "1100 kcal", available: true },
    ],
    "🐟 Seafood": [
        { id: 7, name: "Shrimp Plate 10 Pcs", nameAr: "صحن جمبري 10 قطع", price: 22, emoji: "🦐", cal: "750 kcal", available: true },
        { id: 8, name: "Fish Fillet Plate 6 Pcs", nameAr: "صحن سمك فيليه 6 قطع", price: 16, emoji: "🐟", cal: "640 kcal", available: true },
        { id: 9, name: "Fish Fillet Plate 8 Pcs Spicy/Normal", nameAr: "صحن سمك فيليه 8 قطع عادي / حراق", price: 20, emoji: "🐟", cal: "840 kcal", available: true },
        { id: 10, name: "Nuggets Plate 10 Pcs", nameAr: "صحن نجت 10 قطع", price: 15, emoji: "🍗", cal: "375 kcal", available: true },
    ],
    "🍔 Burgers": [
        { id: 11, name: "Chicken Burger / With Cheese", nameAr: "برجر دجاج / مع جن", price: 6, emoji: "🍔", cal: "490 kcal", available: true },
        { id: 12, name: "Chicken Double Burger With Cheese", nameAr: "برجر دجاج دبل مع جن", price: 13, emoji: "🍔", cal: "580 kcal", available: true },
        { id: 13, name: "Beef Burger / With Cheese", nameAr: "برجر لحم / مع جن", price: 5, emoji: "🍔", cal: "445 kcal", available: true },
        { id: 14, name: "Beef Double Burger With Cheese", nameAr: "برجر لحم دبل مع جن", price: 11, emoji: "🍔", cal: "600 kcal", available: true },
        { id: 15, name: "Fish Burger / With Cheese", nameAr: "برجر سمك / مع جن", price: 7, emoji: "🍔", cal: "500 kcal", available: true },
        { id: 16, name: "Fish Double Burger With Cheese", nameAr: "برجر سمك دبل مع جن", price: 15, emoji: "🍔", cal: "580 kcal", available: true },
        { id: 17, name: "Zinger Burger / With Cheese", nameAr: "برجر زنجر / مع جن", price: 7, emoji: "🍔", cal: "500 kcal", available: true },
        { id: 18, name: "Zinger Double Burger With Cheese", nameAr: "برجر زنجر دبل مع جن", price: 15, emoji: "🍔", cal: "630 kcal", available: true },
        { id: 19, name: "Broast Sandwich / With Cheese", nameAr: "سندويتش بروست / مع جن", price: 8, emoji: "🍔", cal: "580 kcal", available: true },
    ],
    "🥪 Clubs": [
        { id: 20, name: "Hotdog Club", nameAr: "كلوب نقانق", price: 16, emoji: "🥪", cal: "390 kcal", available: true },
        { id: 21, name: "Beef Club", nameAr: "كلوب لحم بقر", price: 13, emoji: "🥪", cal: "490 kcal", available: true },
        { id: 22, name: "Emirates Club", nameAr: "كلوب الإمارات", price: 13, emoji: "🥪", cal: "380 kcal", available: true },
        { id: 23, name: "Zinger Club", nameAr: "كلوب زنجر", price: 14, emoji: "🥪", cal: "368 kcal", available: true },
        { id: 24, name: "Shrimp Club", nameAr: "كلوب جمبري", price: 15, emoji: "🥪", cal: "668 kcal", available: true },
        { id: 25, name: "Fish Club", nameAr: "كلوب سمك", price: 15, emoji: "🥪", cal: "520 kcal", available: true },
        { id: 26, name: "Zinger Club Large", nameAr: "كلوب زنجر كبير", price: 20, emoji: "🥪", cal: "658 kcal", available: true },
        { id: 27, name: "Zinger Sandwich Large", nameAr: "سندويتش زنجر كبير", price: 10, emoji: "🥪", cal: "490 kcal", available: true },
        { id: 28, name: "Zinger Arabi Sandwich", nameAr: "سندويتش زنجر عربي", price: 16, emoji: "🥪", cal: "510 kcal", available: true },
    ],
    "🌯 Sandwiches": [
        { id: 29, name: "Crispy Sandwich", nameAr: "سندويتش كرسبي", price: 10, emoji: "🌯", cal: "550 kcal", available: true },
        { id: 30, name: "Chicken Tortilla Sandwich Normal / Spicy", nameAr: "سندويتش تورتيلا دجاج عادي / حراق", price: 8, emoji: "🌯", cal: "390 kcal", available: true },
        { id: 31, name: "Chicken Kebab Sandwich / With Cheese", nameAr: "سندويتش كباب دجاج / مع جن", price: 6, emoji: "🌯", cal: "278 kcal", available: true },
        { id: 32, name: "Meat Kebab Sandwich / With Cheese", nameAr: "سندويتش كباب لحم / مع جن", price: 6, emoji: "🌯", cal: "280 kcal", available: true },
        { id: 33, name: "Zinger Sandwich / With Cheese", nameAr: "سندويتش زنجر / مع جن", price: 7, emoji: "🌯", cal: "390 kcal", available: true },
        { id: 34, name: "Shrimp Sandwich / With Cheese", nameAr: "سندويتش جمبري / مع جن", price: 7, emoji: "🌯", cal: "230 kcal", available: true },
        { id: 35, name: "Fish Sandwich / With Cheese", nameAr: "سندويتش سمك / مع جن", price: 6, emoji: "🌯", cal: "222 kcal", available: true },
        { id: 36, name: "Mushab Sandwich / With Cheese", nameAr: "سندويتش مسحب / مع جن", price: 5, emoji: "🌯", cal: "245 kcal", available: true },
        { id: 37, name: "Sausage Sandwich / With Cheese", nameAr: "سندويتش سجق / مع جن", price: 5, emoji: "🌯", cal: "266 kcal", available: true },
    ],
    "🍟 Sides": [
        { id: 38, name: "French Fries Small", nameAr: "صحن بطاطس صغير", price: 4, emoji: "🍟", cal: "380 kcal", available: true },
        { id: 39, name: "French Fries Medium", nameAr: "صحن بطاطس وسط", price: 6, emoji: "🍟", cal: "380 kcal", available: true },
        { id: 40, name: "French Fries Large", nameAr: "صحن بطاطس كبير", price: 12, emoji: "🍟", cal: "380 kcal", available: true },
        { id: 41, name: "Crispy Potatoes", nameAr: "كرسبي بطاطس", price: 6, emoji: "🥔", cal: "165 kcal", available: true },
        { id: 42, name: "Wedges", nameAr: "ودجس", price: 6, emoji: "🥔", cal: "136 kcal", available: true },
        { id: 43, name: "Onion Rings", nameAr: "حلقات بصل", price: 6, emoji: "🧅", cal: "130 kcal", available: true },
        { id: 44, name: "Twister Potatoes", nameAr: "بطاطس تويستر", price: 6, emoji: "🍟", cal: "144 kcal", available: true },
        { id: 45, name: "Hotdog Loaded Fries", nameAr: "نقانق فرايز", price: 20, emoji: "🌭", cal: "480 kcal", available: true },
        { id: 46, name: "Shrimp Loaded Fries", nameAr: "جمبري فرايز", price: 26, emoji: "🦐", cal: "720 kcal", available: true },
        { id: 47, name: "Chicken Loaded Fries", nameAr: "دجاج فرايز", price: 22, emoji: "🍗", cal: "640 kcal", available: true },
        { id: 48, name: "Hummus", nameAr: "حمص", price: 3, emoji: "🫘", cal: "88 kcal", available: true },
        { id: 49, name: "Cocktail Sauce / Coleslaw", nameAr: "كوكتيل / سلطة ملفوف", price: 3, emoji: "🥗", cal: "88 kcal", available: true },
        { id: 50, name: "Garlic Normal / Spicy / Green Pepper", nameAr: "ثوم عادي / حراق / فلفل أخضر", price: 2, emoji: "🧄", cal: "66 kcal", available: true },
    ],
    "🥤 Drinks": [
        { id: 51, name: "Pepsi / Kanza 500ml", nameAr: "بيبسي / كنزا 500مل", price: 5, emoji: "🥤", cal: "190 kcal", available: true },
        { id: 52, name: "Pepsi / Kanza 1.5L", nameAr: "بيبسي / كنزا 1.5 لتر", price: 9, emoji: "🥤", cal: "190 kcal", available: true },
        { id: 53, name: "7UP / Mirinda", nameAr: "7UP / ميرندا", price: 2, emoji: "🥤", cal: "41 kcal", available: true },
        { id: 54, name: "Sun Top", nameAr: "سن توب", price: 2, emoji: "🧃", cal: "44 kcal", available: true },
    ],
};
