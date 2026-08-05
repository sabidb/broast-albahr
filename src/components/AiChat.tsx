import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

const SYSTEM =
  'You are a helpful assistant for Broast Al Bahr restaurant in Makkah. Be brief and friendly. Answer only restaurant questions. Respond in the same language as the customer. Hours: Sat-Thu 11AM-4AM, Fri 1PM-4AM. Three branches: Kakkiyah (0500959394), Subhani (0508379339), Waliy Al Ahd (0550061771). 100% Halal. Payment: Cash, Mada, Apple Pay, Visa, Samsung Pay. No cancellations.';

export default function AiChat({ isAr }: { isAr: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: isAr ? 'مرحباً! كيف أقدر أساعدك؟ 😊' : 'Hi! How can I help you? 😊' },
  ]);
  const [inp, setInp] = useState('');
  const [loading, setLoading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);

  const send = async () => {
    if (!inp.trim() || loading) return;
    const msg = inp.trim();
    setInp('');
    const next = [...msgs, { role: 'user' as const, text: msg }];
    setMsgs(next);
    setLoading(true);
    try {
      const apiMsgs = next.slice(1).map((m) => ({ role: m.role, content: m.text }));
      if (apiMsgs.length === 0) apiMsgs.push({ role: 'user', content: msg });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'anthropic-dangerous-direct-browser-calls': 'true' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: SYSTEM,
          messages: apiMsgs,
        }),
      });
      const data = await res.json();
      const reply = data?.content?.[0]?.text || (isAr ? 'عذراً، حاول مجدداً' : 'Sorry, please try again.');
      setMsgs((p) => [...p, { role: 'assistant', text: reply }]);
    } catch {
      setMsgs((p) => [
        ...p,
        { role: 'assistant', text: isAr ? 'عذراً، حدث خطأ في الاتصال' : 'Sorry, a connection error occurred.' },
      ]);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col">
      <div className="mb-3 flex flex-1 flex-col gap-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed"
              style={{
                background: m.role === 'user' ? '#E10600' : '#FFFFFF',
                color: m.role === 'user' ? '#fff' : '#1E1206',
                border: m.role === 'user' ? 'none' : '1px solid rgba(30,18,6,0.08)',
              }}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex w-fit gap-1 rounded-2xl border border-brand-line bg-white px-3.5 py-2.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounceDot rounded-full bg-brand-red" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="flex gap-2 border-t border-brand-line pt-3">
        <input
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={isAr ? 'اكتب سؤالك...' : 'Ask a question...'}
          className="flex-1 rounded-2xl border-2 border-brand-line bg-white px-3.5 py-2.5 text-[13px] font-bold text-brand-ink outline-none focus:border-brand-red"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={send}
          disabled={loading}
          className="rounded-2xl bg-brand-red px-4 text-lg font-black text-white shadow-red"
        >
          →
        </motion.button>
      </div>
    </div>
  );
}
