import { useState } from 'react';
import { motion } from 'framer-motion';
import { ADMIN_PASSWORD, type Menu } from '../lib/data';
import { money } from '../lib/utils';

export function AdminLogin({ onLogin, onCancel }: { onLogin: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const attempt = () => (pw === ADMIN_PASSWORD ? onLogin() : setErr(true));
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-80 rounded-2xl border-2 border-brand-red bg-[#0a0000] px-7 py-8 text-center"
      >
        <div className="mb-3 text-4xl">🔐</div>
        <div className="mb-5 text-lg font-extrabold text-brand-gold">Admin Access</div>
        <input
          type="password"
          value={pw}
          autoFocus
          onChange={(e) => {
            setPw(e.target.value);
            setErr(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && attempt()}
          placeholder="Password"
          className="mb-2 w-full rounded-lg border bg-[#1a0000] px-3.5 py-3 text-white outline-none"
          style={{ borderColor: err ? '#E10600' : '#3a0000' }}
        />
        {err && <div className="mb-2.5 text-xs text-brand-red">❌ Incorrect password</div>}
        <div className="mt-1.5 flex gap-2.5">
          <button onClick={onCancel} className="flex-1 rounded-lg bg-[#1a1a1a] py-2.5 font-bold text-[#888]">
            Cancel
          </button>
          <button onClick={attempt} className="flex-1 rounded-lg bg-brand-red py-2.5 font-bold text-white">
            Login
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AdminPanel({
  menu,
  onSave,
  onExit,
}: {
  menu: Menu;
  onSave: (m: Menu) => void;
  onExit: () => void;
}) {
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [saved, setSaved] = useState(false);
  const all = Object.values(menu).flat();
  const available = all.filter((i) => i.available).length;

  const patch = (id: string | number, fn: (i: any) => any): Menu => {
    const out: Menu = {};
    for (const [cat, items] of Object.entries(menu)) out[cat] = items.map((i) => (i.id === id ? fn(i) : i));
    return out;
  };
  const toggle = (id: string | number) => {
    onSave(patch(id, (i) => ({ ...i, available: !i.available })));
    flash();
  };
  const savePrice = (id: string | number) => {
    const p = parseFloat(editPrice);
    if (isNaN(p) || p <= 0) return;
    onSave(patch(id, (i) => ({ ...i, price: p })));
    setEditingId(null);
    flash();
  };
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="ambient min-h-screen font-sans text-white">
      <div className="app-header sticky top-0 z-[100] border-b-[3px] border-brand-gold" style={{ background: 'linear-gradient(90deg,#cc0000,#aa0000)' }}>
        <div className="mx-auto flex h-[62px] max-w-[900px] items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px]">⚙️</span>
            <div>
              <div className="text-base font-extrabold text-brand-gold">ADMIN PANEL</div>
              <div className="text-[11px] text-white/70">Broast Albahr Management</div>
            </div>
          </div>
          <button onClick={onExit} className="rounded-full border border-brand-gold/40 bg-black/30 px-4 py-2 text-[13px] font-bold text-brand-gold">
            ← Back
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-4 py-6">
        <div className="mb-7 grid grid-cols-3 gap-3">
          {(
            [
              ['📋', 'Total', all.length, '#FFD400'],
              ['✅', 'Available', available, '#4caf50'],
              ['❌', 'Off', all.length - available, '#E10600'],
            ] as [string, string, number, string][]
          ).map(([ic, l, v, c]) => (
            <motion.div
              key={l}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-surface p-4"
            >
              <div className="text-[22px]">{ic}</div>
              <div className="mt-1.5 text-[26px] font-extrabold" style={{ color: c }}>
                {v}
              </div>
              <div className="text-xs text-brand-muted">{l}</div>
            </motion.div>
          ))}
        </div>

        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-[#2d7a2d] bg-[#0a2a0a] px-4 py-2.5 text-[13px] font-bold text-[#6fcf6f]"
          >
            ✅ Saved!
          </motion.div>
        )}

        {Object.entries(menu).map(([cat, items]) => (
          <div key={cat} className="mb-6">
            <div className="mb-2 border-b border-[#222] pb-1.5 text-sm font-extrabold text-brand-gold">{cat}</div>
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2.5 rounded-xl border bg-[#110000] px-3.5 py-2.5"
                  style={{ borderColor: it.available ? '#222' : '#3a0000', opacity: it.available ? 1 : 0.6 }}
                >
                  <span className="shrink-0 text-[22px]">{it.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-white">{it.name}</div>
                    <div className="font-arabic text-[11px] text-[#555]">{it.nameAr}</div>
                  </div>
                  {editingId === it.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={editPrice}
                        autoFocus
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-[68px] rounded-md border border-brand-gold bg-[#222] px-2 py-1 text-[13px] text-white"
                      />
                      <button onClick={() => savePrice(it.id)} className="rounded-md bg-brand-red px-2.5 py-1 text-xs font-bold text-white">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-md bg-[#222] px-2 py-1 text-xs text-[#aaa]">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(it.id);
                        setEditPrice(String(it.price));
                      }}
                      className="whitespace-nowrap rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1 text-xs font-bold text-brand-gold"
                    >
                      {money(it.price)} ✎
                    </button>
                  )}
                  <button
                    onClick={() => toggle(it.id)}
                    className="whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold"
                    style={{
                      background: it.available ? '#0a2a0a' : '#2a0000',
                      borderColor: it.available ? '#2d7a2d' : '#660000',
                      color: it.available ? '#4caf50' : '#E10600',
                    }}
                  >
                    {it.available ? '✅ On' : '❌ Off'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
