import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ADMIN_PASSWORD, type Menu, type MenuItem } from '../lib/data';
import { money, formatDate } from '../lib/utils';
import { FB } from '../lib/fb';
import ItemImage from './ItemImage';

export function AdminLogin({ onLogin, onCancel }: { onLogin: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const attempt = () => (pw === ADMIN_PASSWORD ? onLogin() : setErr(true));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] flex items-center justify-center bg-brand-ink/50 p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-80 rounded-3xl bg-white px-7 py-8 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-red/10 text-4xl">🔐</div>
        <div className="mb-5 text-lg font-black text-brand-ink">Admin Access</div>
        <input type="password" value={pw} autoFocus onChange={(e) => { setPw(e.target.value); setErr(false); }} onKeyDown={(e) => e.key === 'Enter' && attempt()} placeholder="Password" className="mb-2 w-full rounded-2xl border-2 bg-white px-4 py-3 font-bold text-brand-ink outline-none focus:border-brand-red" style={{ borderColor: err ? '#E10600' : 'rgba(30,18,6,0.10)' }} />
        {err && <div className="mb-2.5 text-xs font-bold text-brand-red">❌ Incorrect password</div>}
        <div className="mt-1.5 flex gap-2.5">
          <button onClick={onCancel} className="flex-1 rounded-2xl bg-brand-cream2 py-3 font-black text-brand-ink2">Cancel</button>
          <button onClick={attempt} className="flex-1 rounded-2xl bg-brand-red py-3 font-black text-white shadow-red">Login</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  menu: Menu;
  isOpen: boolean;
  onToggleOpen: (open: boolean) => void;
  onSave: (m: Menu) => void;
  onExit: () => void;
}

type Editing = { item: MenuItem; category: string; isNew: boolean } | null;

export default function AdminPanel({ menu, isOpen, onToggleOpen, onSave, onExit }: Props) {
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const all = Object.values(menu).flat();
  const available = all.filter((i) => i.available).length;
  const q = query.trim().toLowerCase();

  useEffect(() => FB.onOrdersChange(setOrders), []);
  const activeOrders = orders.filter((o) => o.status !== 'done').length;

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1600); };

  // ── category management ──
  const addCategory = () => {
    const name = window.prompt('New category name (add an emoji if you like, e.g. "🥗 Salads"):', '');
    if (!name || !name.trim() || menu[name.trim()]) return;
    onSave({ ...menu, [name.trim()]: [] });
    flash();
  };
  const renameCategory = (oldName: string) => {
    const name = window.prompt('Rename category:', oldName);
    if (!name || !name.trim() || (name.trim() !== oldName && menu[name.trim()])) return;
    const out: Menu = {};
    for (const [c, items] of Object.entries(menu)) out[c === oldName ? name.trim() : c] = items;
    onSave(out);
    flash();
  };
  const deleteCategory = (cat: string) => {
    if (!confirm(`Delete category "${cat}" and all its items?`)) return;
    const out: Menu = {};
    for (const [c, items] of Object.entries(menu)) if (c !== cat) out[c] = items;
    onSave(out);
    flash();
  };
  const setStatus = (o: any, status: string) => {
    if (o.fbId) FB.updateOrderStatus(o.fbId, status);
    setOrders((prev) => prev.map((x) => (x.fbId === o.fbId ? { ...x, status } : x)));
  };

  const toggle = (id: string | number) => {
    const out: Menu = {};
    for (const [c, items] of Object.entries(menu)) out[c] = items.map((i) => (i.id === id ? { ...i, available: !i.available } : i));
    onSave(out);
    flash();
  };
  const saveItem = (category: string, item: MenuItem, isNew: boolean) => {
    const out: Menu = {};
    for (const [c, items] of Object.entries(menu)) {
      if (c === category) out[c] = isNew ? [...items, item] : items.map((i) => (i.id === item.id ? item : i));
      else out[c] = items.filter((i) => i.id !== item.id); // in case category changed (not used here)
    }
    onSave(out);
    setEditing(null);
    flash();
  };
  const deleteItem = (category: string, id: string | number) => {
    const out: Menu = {};
    for (const [c, items] of Object.entries(menu)) out[c] = c === category ? items.filter((i) => i.id !== id) : items;
    onSave(out);
    setEditing(null);
    flash();
  };
  const addNew = (category: string) =>
    setEditing({ category, isNew: true, item: { id: Date.now(), name: '', nameAr: '', price: 0, emoji: '🍽️', cal: '', available: true } });

  return (
    <div className="ambient min-h-screen font-sans text-brand-ink">
      <div className="sticky top-0 z-[100] bg-brand-red shadow-red">
        <div className="mx-auto flex h-[62px] max-w-[900px] items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px]">⚙️</span>
            <div>
              <div className="text-base font-black text-white">ADMIN PANEL</div>
              <div className="text-[11px] font-bold text-white/80">Broast Al Bahr Management</div>
            </div>
          </div>
          <button onClick={onExit} className="rounded-full bg-white/20 px-4 py-2 text-[13px] font-black text-white">← Back</button>
        </div>
        {/* tabs */}
        <div className="mx-auto flex max-w-[900px] gap-1 px-4 pb-2">
          {(['menu', 'orders'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative rounded-full px-4 py-1.5 text-[13px] font-black"
              style={{ color: tab === t ? '#E10600' : 'rgba(255,255,255,0.85)', background: tab === t ? '#fff' : 'rgba(255,255,255,0.15)' }}
            >
              {t === 'menu' ? '🍔 Menu' : '🧾 Orders'}
              {t === 'orders' && activeOrders > 0 && (
                <span className="ms-1 rounded-full bg-brand-gold px-1.5 text-[10px] text-brand-ink">{activeOrders}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'orders' ? (
        <OrdersManage orders={orders} setStatus={setStatus} />
      ) : (
      <div className="mx-auto max-w-[900px] px-4 py-6">
        {/* open / closed master switch */}
        <div className="mb-4 flex items-center justify-between rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-line">
          <div>
            <div className="text-[15px] font-black text-brand-ink">{isOpen ? '🟢 Restaurant Open' : '🔴 Restaurant Closed'}</div>
            <div className="text-[12px] font-bold text-brand-muted">Syncs live to all customers</div>
          </div>
          <button
            onClick={() => onToggleOpen(!isOpen)}
            className="relative h-9 w-16 rounded-full transition-colors"
            style={{ background: isOpen ? '#11845B' : '#C4C0BA' }}
          >
            <motion.span layout className="absolute top-1 h-7 w-7 rounded-full bg-white shadow" style={{ [isOpen ? 'right' : 'left']: 4 } as any} />
          </button>
        </div>

        {/* stats */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {([['📋', 'Total', all.length, '#1E1206'], ['✅', 'Available', available, '#11845B'], ['❌', 'Off', all.length - available, '#E10600']] as [string, string, number, string][]).map(([ic, l, v, c]) => (
            <div key={l} className="card-surface p-4">
              <div className="text-[22px]">{ic}</div>
              <div className="mt-1.5 text-[26px] font-black" style={{ color: c }}>{v}</div>
              <div className="text-xs font-bold text-brand-muted">{l}</div>
            </div>
          ))}
        </div>

        {/* search */}
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-soft ring-1 ring-brand-line">
          <span>🔍</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="flex-1 bg-transparent text-[14px] font-bold text-brand-ink outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-brand-muted">✕</button>}
        </div>

        {saved && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-2xl border-2 border-brand-green/25 bg-brand-green/8 px-4 py-2.5 text-[13px] font-black text-brand-green">
            ✅ Saved & synced to customers
          </motion.div>
        )}

        {Object.entries(menu).map(([cat, items]) => {
          const shown = q ? items.filter((i) => (i.name + i.nameAr).toLowerCase().includes(q)) : items;
          if (q && shown.length === 0) return null;
          return (
            <div key={cat} className="mb-6">
              <div className="mb-2 flex items-center justify-between border-b-2 border-brand-line pb-1.5">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-black text-brand-red">{cat}</div>
                  <button onClick={() => renameCategory(cat)} className="text-[13px] text-brand-muted" title="Rename">✎</button>
                  <button onClick={() => deleteCategory(cat)} className="text-[13px] text-brand-muted" title="Delete category">🗑</button>
                </div>
                <button onClick={() => addNew(cat)} className="rounded-full bg-brand-red px-3 py-1 text-[11px] font-black text-white shadow-red">+ Add item</button>
              </div>
              <div className="flex flex-col gap-2">
                {shown.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setEditing({ item: it, category: cat, isNew: false })}
                    className="flex items-center gap-3 rounded-2xl border-2 bg-white px-3 py-2.5 text-start"
                    style={{ borderColor: it.available ? 'rgba(30,18,6,0.08)' : 'rgba(225,6,0,0.25)', opacity: it.available ? 1 : 0.6 }}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-brand-line">
                      <ItemImage item={it} category={cat} iconSize={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-black text-brand-ink">{it.name || '—'}</div>
                      <div className="font-arabic text-[11px] font-bold text-brand-muted">{it.nameAr}</div>
                    </div>
                    <span className="whitespace-nowrap rounded-lg bg-brand-cream px-2.5 py-1 text-xs font-black text-brand-red">{money(it.price)}</span>
                    <span
                      onClick={(e) => { e.stopPropagation(); toggle(it.id); }}
                      className="whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-black text-white"
                      style={{ background: it.available ? '#11845B' : '#E10600' }}
                    >
                      {it.available ? 'On' : 'Off'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {!q && (
          <button onClick={addCategory} className="mt-2 w-full rounded-2xl border-2 border-dashed border-brand-line py-3 text-[14px] font-black text-brand-red">
            + Add category
          </button>
        )}
      </div>
      )}

      <AnimatePresence>
        {editing && (
          <ItemEditor
            key={String(editing.item.id)}
            editing={editing}
            onClose={() => setEditing(null)}
            onSave={(item) => saveItem(editing.category, item, editing.isNew)}
            onDelete={() => deleteItem(editing.category, editing.item.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemEditor({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSave: (item: MenuItem) => void;
  onDelete: () => void;
}) {
  const [item, setItem] = useState<MenuItem>(editing.item);
  const [uploading, setUploading] = useState(false);
  const set = (f: Partial<MenuItem>) => setItem((p) => ({ ...p, ...f }));

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await FB.uploadItemImage(item.id, file);
      set({ img: url });
    } catch {
      alert('Upload failed — Firebase Storage may be disabled or rules block writes.\nPaste an image URL (🔗) instead, e.g. a GitHub raw link.');
    } finally {
      setUploading(false);
    }
  };
  const promptUrl = () => {
    const u = window.prompt('Paste image URL (blank to remove):', item.img || '');
    if (u !== null) set({ img: u.trim() || undefined });
  };

  const field = 'w-full rounded-2xl border-2 border-brand-line bg-white px-4 py-3 text-[15px] font-bold text-brand-ink outline-none focus:border-brand-red';
  const canSave = item.name.trim() && item.price > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[500] flex items-end justify-center bg-brand-ink/50 backdrop-blur-sm">
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 34 }} className="flex max-h-[94vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[28px] bg-brand-cream">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="text-lg font-black text-brand-ink">{editing.isNew ? 'Add item' : 'Edit item'}</div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-lg shadow-soft">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
          {/* image */}
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-brand-line">
              <ItemImage item={item} category={editing.category} iconSize={40} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-xl bg-brand-red px-4 py-2 text-center text-[13px] font-black text-white shadow-red">
                {uploading ? 'Uploading…' : '📷 Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </label>
              <div className="flex gap-2">
                <button onClick={promptUrl} className="rounded-xl bg-white px-3 py-1.5 text-[12px] font-black text-brand-red ring-1 ring-brand-line">🔗 URL</button>
                {item.img && <button onClick={() => set({ img: undefined })} className="rounded-xl bg-white px-3 py-1.5 text-[12px] font-black text-brand-muted ring-1 ring-brand-line">✕ Remove</button>}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-black uppercase text-brand-muted">Name (English)</label>
            <input className={field} value={item.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Broast 4 Pcs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase text-brand-muted">Name (Arabic)</label>
            <input dir="rtl" className={`${field} font-arabic`} value={item.nameAr} onChange={(e) => set({ nameAr: e.target.value })} placeholder="مثال: بروست 4 قطع" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase text-brand-muted">Price (SR)</label>
              <input type="number" className={field} value={item.price || ''} onChange={(e) => set({ price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase text-brand-muted">Calories</label>
              <input className={field} value={item.cal} onChange={(e) => set({ cal: e.target.value })} placeholder="750 kcal" />
            </div>
          </div>
          <button
            onClick={() => set({ available: !item.available })}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-brand-line"
          >
            <span className="text-[14px] font-black text-brand-ink">Available</span>
            <span className="rounded-lg px-3 py-1 text-xs font-black text-white" style={{ background: item.available ? '#11845B' : '#E10600' }}>
              {item.available ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        <div className="flex gap-2 border-t border-brand-line bg-white/80 px-5 py-4 backdrop-blur">
          {!editing.isNew && (
            <button onClick={() => { if (confirm('Delete this item?')) onDelete(); }} className="rounded-2xl bg-brand-red/10 px-4 py-3.5 text-[14px] font-black text-brand-red">🗑</button>
          )}
          <motion.button whileTap={{ scale: 0.97 }} disabled={!canSave} onClick={() => onSave(item)} className="flex-1 rounded-2xl bg-brand-red py-3.5 text-[15px] font-black text-white shadow-red disabled:opacity-40">
            {editing.isNew ? 'Add & sync' : 'Save & sync'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: '#E10600' },
  preparing: { label: 'Preparing', color: '#DE8A00' },
  ready: { label: 'Ready', color: '#11845B' },
  done: { label: 'Done', color: '#8C7A64' },
};
const NEXT: Record<string, string> = { new: 'preparing', preparing: 'ready', ready: 'done' };
const NEXT_LABEL: Record<string, string> = { new: '▶ Start preparing', preparing: '✅ Mark ready', ready: '📦 Complete' };

function OrdersManage({ orders, setStatus }: { orders: any[]; setStatus: (o: any, s: string) => void }) {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">
      <div className="mb-4 flex items-center gap-2 text-[13px] font-black text-brand-muted">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-green opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-green" />
        </span>
        Live · updates in real time
      </div>

      {orders.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mb-3 text-6xl">🧾</div>
          <div className="font-black text-brand-ink">No orders yet</div>
          <p className="mt-1 text-[13px] font-semibold text-brand-muted">New orders will appear here automatically.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {orders.map((o) => {
              const st = STATUS[o.status] || STATUS.new;
              const total = o.total ?? o.totals?.total ?? 0;
              return (
                <motion.div
                  key={o.fbId || o.orderNo}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-3xl bg-white p-4 shadow-soft ring-1 ring-brand-line"
                  style={{ borderInlineStart: `4px solid ${st.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-black text-brand-ink">#{o.orderNo}</span>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-black text-white" style={{ background: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-brand-muted">
                    {o.userName || '—'} · {o.userPhone || ''} · 🏃 Pickup
                    {o.date ? ` · ${formatDate(o.date)}` : ''}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(o.items || []).map((it: any, k: number) => (
                      <span key={k} className="flex items-center gap-1 rounded-lg bg-brand-cream px-2 py-1 text-[12px] font-bold text-brand-ink2">
                        <span className="inline-block h-4 w-4 overflow-hidden rounded">
                          <ItemImage item={it} iconSize={11} />
                        </span>
                        {it.name} ×{it.qty}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-3">
                    <span className="text-[16px] font-black text-brand-red">{money(total)}</span>
                    <div className="flex gap-2">
                      {NEXT[o.status] && (
                        <button onClick={() => setStatus(o, NEXT[o.status])} className="rounded-xl bg-brand-red px-3.5 py-2 text-[12px] font-black text-white shadow-red">
                          {NEXT_LABEL[o.status]}
                        </button>
                      )}
                      {o.status === 'done' && <span className="text-[12px] font-black text-brand-muted">✔ Completed</span>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
