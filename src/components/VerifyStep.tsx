import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Field from './Field';
import { LOGO_SRC } from '../lib/logo';
import { generateOTP } from '../lib/utils';
import { FB } from '../lib/fb';

interface Props {
  onVerified: (u: { name: string; phone: string }) => void;
  isAr: boolean;
}

export default function VerifyStep({ onVerified, isAr }: Props) {
  const [phase, setPhase] = useState<'form' | 'otp'>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoCode, setDemoCode] = useState('');
  const otpRef = useRef('');
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendOtp = () => {
    let ok = true;
    if (!name.trim()) {
      setNameErr(isAr ? 'الاسم مطلوب' : 'Name is required');
      ok = false;
    }
    if (!/^05\d{8}$/.test(phone.trim())) {
      setPhoneErr(isAr ? 'أدخل رقماً سعودياً صحيحاً' : 'Enter a valid Saudi number');
      ok = false;
    }
    if (!ok) return;
    setLoading(true);
    const code = generateOTP();
    otpRef.current = code;
    setDemoCode(code);
    setPhase('otp');
    startCountdown();
    setLoading(false);
  };

  const handleOtp = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) refs[i + 1].current?.focus();
    if (!val && i > 0) refs[i - 1].current?.focus();
  };

  const verify = () => {
    const entered = otp.join('');
    if (entered.length < 6) return;
    if (entered === otpRef.current) {
      const u = { name: name.trim(), phone: phone.trim() };
      FB.saveCustomer({ ...u, firstSeen: new Date().toISOString() });
      onVerified(u);
    } else {
      setError(isAr ? 'رمز التحقق غير صحيح' : 'Incorrect OTP code');
      setOtp(['', '', '', '', '', '']);
      refs[0].current?.focus();
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-6 py-10">
      {/* brand */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div style={{ perspective: 800 }} className="mx-auto mb-4 w-fit">
          <motion.img
            src={LOGO_SRC}
            alt="Broast Al Bahr"
            initial={{ rotateY: -120, scale: 0.7, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.2, 0.9, 0.25, 1] }}
            className="h-24 w-24 rounded-[26px] object-cover ring-4 ring-white"
            style={{ boxShadow: '0 20px 44px rgba(225,6,0,0.28)' }}
          />
        </div>
        <h1 className="text-[26px] font-black text-brand-ink">
          {phase === 'form'
            ? isAr
              ? 'أهلاً بك في بروست البحر'
              : 'Welcome to Broast Al Bahr'
            : isAr
              ? 'تحقق من رقمك'
              : 'Verify Your Number'}
        </h1>
        <p className="mt-1.5 text-[14px] font-semibold text-brand-muted">
          {phase === 'form'
            ? isAr
              ? 'سجّل دخولك لتبدأ الطلب وتجمع النقاط 🎁'
              : 'Sign in to start ordering & earning points 🎁'
            : isAr
              ? `تم إرسال الرمز إلى ${phone}`
              : `Code sent to ${phone}`}
        </p>
      </motion.div>

      {phase === 'form' ? (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <Field
            value={name}
            onChange={(v) => {
              setName(v);
              setNameErr('');
            }}
            label={isAr ? 'الاسم الكامل' : 'Full Name'}
            icon="🙂"
            placeholder={isAr ? 'مثال: محمد علي' : 'e.g. Mohammed Ali'}
            error={nameErr}
          />
          <Field
            value={phone}
            onChange={(v) => {
              setPhone(v);
              setPhoneErr('');
            }}
            label={isAr ? 'رقم الجوال' : 'Mobile Number'}
            icon="📱"
            type="tel"
            inputMode="tel"
            maxLength={10}
            placeholder="05XXXXXXXX"
            error={phoneErr}
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            onClick={sendOtp}
            disabled={loading}
            className="sheen mt-2 rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red"
          >
            {loading ? (isAr ? '...' : '...') : isAr ? 'إرسال رمز التحقق →' : 'Send OTP →'}
          </motion.button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
          {demoCode && (
            <div className="w-full rounded-2xl border-2 border-dashed border-brand-red/40 bg-brand-red/5 px-5 py-3 text-center">
              <div className="text-[11px] font-black uppercase tracking-wide text-brand-muted">
                {isAr ? 'رمزك (تجريبي)' : 'Your code (demo)'}
              </div>
              <div className="text-[26px] font-black tracking-[8px] text-brand-red">{demoCode}</div>
            </div>
          )}
          <div className="flex gap-2.5" dir="ltr">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={refs[i]}
                value={d}
                maxLength={1}
                inputMode="numeric"
                onChange={(e) => handleOtp(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !otp[i] && i > 0) refs[i - 1].current?.focus();
                }}
                className="h-[58px] w-[48px] rounded-2xl border-2 border-brand-line bg-white text-center text-2xl font-black text-brand-ink outline-none transition focus:-translate-y-0.5 focus:border-brand-red focus:shadow-[0_0_0_4px_rgba(225,6,0,0.12)]"
              />
            ))}
          </div>
          {error && <div className="text-[13px] font-black text-brand-red">❌ {error}</div>}
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            onClick={verify}
            disabled={otp.join('').length < 6}
            className="sheen w-full rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red disabled:opacity-40 disabled:shadow-none"
          >
            {isAr ? 'تحقق الآن ✓' : 'Verify Now ✓'}
          </motion.button>
          <div className="text-[13px] font-bold text-brand-muted">
            {countdown > 0 ? (
              <span>{isAr ? `إعادة إرسال بعد ${countdown}ث` : `Resend in ${countdown}s`}</span>
            ) : (
              <button
                onClick={() => {
                  setOtp(['', '', '', '', '', '']);
                  const code = generateOTP();
                  otpRef.current = code;
                  setDemoCode(code);
                  startCountdown();
                }}
                className="font-black text-brand-red"
              >
                {isAr ? 'إعادة إرسال الرمز' : 'Resend OTP'}
              </button>
            )}
          </div>
          <button onClick={() => setPhase('form')} className="text-xs font-bold text-brand-muted">
            ← {isAr ? 'تغيير الرقم' : 'Change number'}
          </button>
        </motion.div>
      )}
    </div>
  );
}
