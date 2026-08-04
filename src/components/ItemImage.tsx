import FoodIcon from './FoodIcon';
import { detectKind, kindGradient } from '../lib/items';
import type { MenuItem } from '../lib/data';

/**
 * Product visual: shows the uploaded photo (item.img) when available,
 * otherwise a device-consistent SVG icon on a kind-colored gradient.
 * Fills its parent — give the parent a fixed size + rounded + overflow-hidden.
 */
export default function ItemImage({
  item,
  category = '',
  iconSize = 44,
  className = '',
}: {
  item: MenuItem;
  category?: string;
  iconSize?: number;
  className?: string;
}) {
  const kind = detectKind(item, category);
  if (item.img) {
    return (
      <img
        src={item.img}
        alt={item.name}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center ${className}`} style={{ background: kindGradient(kind) }}>
      <FoodIcon kind={kind} size={iconSize} />
    </div>
  );
}
