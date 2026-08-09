import type { Menu, MenuItem } from './data';

/**
 * Return a copy of the menu limited to items sold at `branchId`, respecting the
 * admin-managed `branches` list and per-branch `availability` override.
 * When `branchId` is null the menu is returned unchanged.
 */
export function filterMenuForBranch(menu: Menu, branchId: string | null): Menu {
  if (!branchId) return menu;
  const out: Menu = {};
  for (const [cat, items] of Object.entries(menu)) {
    const filtered = items
      .filter((i) => {
        if (!i.branches || i.branches.length === 0) return true;
        return i.branches.includes('all') || i.branches.includes(branchId);
      })
      .map((i) => {
        const perBranchOn = i.availability && Object.prototype.hasOwnProperty.call(i.availability, branchId)
          ? !!i.availability[branchId]
          : i.available;
        return perBranchOn === i.available ? i : { ...i, available: perBranchOn };
      });
    if (filtered.length) out[cat] = filtered;
  }
  return out;
}


export type FoodKind =
  | 'chicken'
  | 'fish'
  | 'shrimp'
  | 'burger'
  | 'club'
  | 'sandwich'
  | 'fries'
  | 'nuggets'
  | 'drink'
  | 'sauce'
  | 'hotdog'
  | 'onion';

/** Classify an item into a food kind from its name/category (specific → generic). */
export function detectKind(item: { name: string; nameAr: string }, category = ''): FoodKind {
  const s = `${item.name} ${item.nameAr} ${category}`.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  if (has(/shrimp|جمبري/)) return 'shrimp';
  if (has(/fish|fillet|سمك|فيليه/)) return 'fish';
  if (has(/nugget|نجت/)) return 'nuggets';
  if (has(/hotdog|hot dog|sausage|نقانق|سجق/)) return 'hotdog';
  if (has(/onion|بصل/)) return 'onion';
  if (has(/fries|potato|wedges|twister|بطاطس|ودجس|تويستر/)) return 'fries';
  if (has(/hummus|sauce|coleslaw|garlic|cocktail|حمص|صوص|ملفوف|ثوم|كوكتيل|سلطة/)) return 'sauce';
  if (has(/pepsi|kanza|7up|mirinda|sun ?top|juice|drink|بيبسي|كنزا|ميرندا|سن توب|عصير|مشروب/)) return 'drink';
  if (has(/burger|برجر/)) return 'burger';
  if (has(/club|كلوب/)) return 'club';
  if (has(/sandwich|tortilla|kebab|wrap|سندويتش|تورتيلا|كباب/)) return 'sandwich';
  return 'chicken';
}

/** Number of pieces if present in the name. */
export function piecesOf(item: { name: string; nameAr: string }): number | null {
  const m = (item.name + ' ' + item.nameAr).match(/(\d+)\s*(pcs|pieces|قطع|قطعة)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** "What you get with it" copy per kind, bilingual. */
export function accompaniment(kind: FoodKind, isAr: boolean): string {
  const map: Record<FoodKind, [string, string]> = {
    chicken: [
      'Served with Arabic bread, coleslaw & our signature garlic sauce',
      'يُقدّم مع خبز عربي، سلطة كول سلو وصوص الثوم الخاص',
    ],
    fish: ['Served with fries, tartar sauce & fresh lemon', 'يُقدّم مع بطاطس، صوص تارتار وليمون طازج'],
    shrimp: ['Served with fries, cocktail sauce & lemon', 'يُقدّم مع بطاطس، صوص كوكتيل وليمون'],
    burger: ['Lettuce, tomato, pickles & our special sauce', 'خس، طماطم، مخلل وصوص خاص'],
    club: ['Triple-decker — served with fries & coleslaw', 'ثلاث طبقات — يُقدّم مع بطاطس وكول سلو'],
    sandwich: ['Freshly wrapped with garlic sauce & pickles', 'ملفوف طازج مع صوص الثوم والمخلل'],
    fries: ['Freshly fried — crispy & hot', 'مقلي طازج — مقرمش وساخن'],
    nuggets: ['Golden crispy nuggets with a dip', 'قطع ذهبية مقرمشة مع صوص'],
    drink: ['Served ice-cold', 'يُقدّم بارداً'],
    sauce: ['The perfect dip on the side', 'الإضافة المثالية بجانب طلبك'],
    hotdog: ['Loaded & topped, served hot', 'محشو ومغطى، يُقدّم ساخناً'],
    onion: ['Crispy golden rings with a dip', 'حلقات ذهبية مقرمشة مع صوص'],
  };
  const [en, ar] = map[kind];
  return isAr ? ar : en;
}

/** Warm gradient backdrop per kind for the detail hero. */
export function kindGradient(kind: FoodKind): string {
  const g: Record<FoodKind, string> = {
    chicken: 'linear-gradient(150deg,#FF8A00,#E10600)',
    fish: 'linear-gradient(150deg,#38BDF8,#0E7490)',
    shrimp: 'linear-gradient(150deg,#FF9E7A,#E1483C)',
    burger: 'linear-gradient(150deg,#F5A623,#B45309)',
    club: 'linear-gradient(150deg,#F5A623,#C2410C)',
    sandwich: 'linear-gradient(150deg,#FBBF24,#B45309)',
    fries: 'linear-gradient(150deg,#FF8A00,#E10600)',
    nuggets: 'linear-gradient(150deg,#F5A623,#C2410C)',
    drink: 'linear-gradient(150deg,#F87171,#B91C1C)',
    sauce: 'linear-gradient(150deg,#FBBF24,#D97706)',
    hotdog: 'linear-gradient(150deg,#F59E0B,#B45309)',
    onion: 'linear-gradient(150deg,#F5A623,#C2410C)',
  };
  return g[kind];
}

export const kindOf = (item: MenuItem, category = '') => detectKind(item, category);
