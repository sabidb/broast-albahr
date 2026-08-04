import { useState } from 'react';
import { motion } from 'framer-motion';
import { ADMIN_PASSWORD, type Menu } from '../lib/data';
import { money } from '../lib/utils';
import { FB } from '../lib/fb';
import ItemImage from './ItemImage';

export function AdminLogin({ onLogin, onCancel }: { onLogin: () => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const attempt = () => (pw === ADMIN_PASSWORD ? onLogin() : setErr(true));
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-brand-ink/50 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-80 rounded-3xl bg-white px-7 py-8 text-center shadow-card"
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-red/10 text-4xl">🔐</div>
        <div className="mb-5 text-lg font-black text-brand-ink">Admin Access</div>
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
          className="mb-2 w-full rounded-2xl border-2 bg-white px-4 py-3 font-bold text-brand-ink outline-none focus:border-brand-red"
          style={{ borderColor: err ? '#E10600' : 'rgba(30,18,6,0.10)' }}
        />
        {err && <div className="mb-2.5 text-xs font-bold text-brand-red">❌ Incorrect password</div>}
        <div className="mt-1.5 flex gap-2.5">
          <button onClick={onCancel} className="flex-1 rounded-2xl bg-brand-cream2 py-3 font-black text-brand-ink2">
            Cancel
          </button>
          <button onClick={attempt} className="flex-1 rounded-2xl bg-brand-red py-3 font-black text-white shadow-red">
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
  const [uploadingId, setUploadingId] = useState<string | number | null>(null);
  const all = Object.values(menu).flat();
  const available = all.filter((i) => i.available).length;

  const patch = (id: string | number, fn: (i: any) => any): Menu => {
    const out: Menu = {};
    for (const [cat, items] of Object.entries(menu)) out[cat] = items.map((i) => (i.id === id ? fn(i) : i));
    return out;
  };

  const setImage = (id: string | number, url?: string) => {
    onSave(patch(id, (i) => ({ ...i, img: url && url.trim() ? url.trim() : undefined })));
    flash();
  };
  const handleFile = async (id: string | number, file: File) => {
    setUploadingId(id);
    try {
      const url = await FB.uploadItemImage(id, file);
      setImage(id, url);
    } catch {
      alert(
        'Upload failed. Firebase Storage may be disabled or its rules block writes.\n\n' +
          'Tip: paste an image URL instead (🔗) — e.g. a GitHub raw link.',
      );
    } finally {
      setUploadingId(null);
    }
  };
  const promptUrl = (id: string | number, current?: string) => {
    const u = window.prompt('Paste image URL (e.g. GitHub raw link). Leave blank to remove:', current || '');
    if (u !== null) setImage(id, u);
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
          <button onClick={onExit} className="rounded-full bg-white/20 px-4 py-2 text-[13px] font-black text-white">
            ← Back
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-4 py-6">
        <div className="mb-7 grid grid-cols-3 gap-3">
          {(
            [
              ['📋', 'Total', all.length, '#1E1206'],
              ['✅', 'Available', available, '#11845B'],
              ['❌', 'Off', all.length - available, '#E10600'],
            ] as [string, string, number, string][]
          ).map(([ic, l, v, c]) => (
            <motion.div key={l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card-surface p-4">
              <div className="text-[22px]">{ic}</div>
              <div className="mt-1.5 text-[26px] font-black" style={{ color: c }}>
                {v}
              </div>
              <div className="text-xs font-bold text-brand-muted">{l}</div>
            </motion.div>
          ))}
        </div>

        {saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border-2 border-brand-green/25 bg-brand-green/8 px-4 py-2.5 text-[13px] font-black text-brand-green"
          >
            ✅ Saved!
          </motion.div>
        )}

        {Object.entries(menu).map(([cat, items]) => (
          <div key={cat} className="mb-6">
            <div className="mb-2 border-b-2 border-brand-line pb-1.5 text-sm font-black text-brand-red">{cat}</div>
            <div className="flex flex-col gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2.5 rounded-2xl border-2 bg-white px-3.5 py-2.5"
                  style={{ borderColor: it.available ? 'rgba(30,18,6,0.08)' : 'rgba(225,6,0,0.25)', opacity: it.available ? 1 : 0.6 }}
                >
                  <label className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-brand-line">
                    <ItemImage item={it} iconSize={22} />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(it.id, f);
                        e.target.value = '';
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100">
                      {uploadingId === it.id ? '…' : '📷'}
                    </span>
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-black text-brand-ink">{it.name}</div>
                    <div className="font-arabic text-[11px] font-bold text-brand-muted">{it.nameAr}</div>
                    <div className="mt-0.5 flex gap-2 text-[10px] font-black">
                      <button onClick={() => promptUrl(it.id, it.img)} className="text-brand-red">
                        🔗 URL
                      </button>
                      {it.img && (
                        <button onClick={() => setImage(it.id, undefined)} className="text-brand-muted">
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {editingId === it.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={editPrice}
                        autoFocus
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-[70px] rounded-lg border-2 border-brand-red bg-white px-2 py-1 text-[13px] font-bold text-brand-ink"
                      />
                      <button onClick={() => savePrice(it.id)} className="rounded-lg bg-brand-red px-2.5 py-1 text-xs font-black text-white">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg bg-brand-cream2 px-2 py-1 text-xs font-bold text-brand-ink2">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(it.id);
                        setEditPrice(String(it.price));
                      }}
                      className="whitespace-nowrap rounded-lg border-2 border-brand-line bg-brand-cream px-2.5 py-1 text-xs font-black text-brand-red"
                    >
                      {money(it.price)} ✎
                    </button>
                  )}
                  <button
                    onClick={() => toggle(it.id)}
                    className="whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-black text-white"
                    style={{ background: it.available ? '#11845B' : '#E10600' }}
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
