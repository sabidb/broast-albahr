import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ConfirmationResult } from 'firebase/auth';
import Field from './Field';
import { LOGO_SRC } from '../lib/logo';
import { FB } from '../lib/fb';

interface Props {
  onVerified: (u: { name: string; phone: string }) => void;
  isAr: boolean;
}

type Phase = 'form' | 'otp';

export default function VerifyStep({ onVerified, isAr }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
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

  const humanErr = (code: string): string => {
    if (code.includes('invalid-phone-number')) return isAr ? 'رقم غير صالح' : 'Invalid phone number';
    if (code.includes('too-many-requests')) return isAr ? 'محاولات كثيرة، حاول لاحقاً' : 'Too many attempts, try later';
    if (code.includes('quota-exceeded')) return isAr ? 'حصة الرسائل اليومية انتهت' : 'Daily SMS quota reached';
    if (code.includes('invalid-verification-code')) return isAr ? 'رمز التحقق غير صحيح' : 'Incorrect code';
    if (code.includes('code-expired')) return isAr ? 'انتهت صلاحية الرمز' : 'Code expired — resend';
    if (code.includes('captcha-check-failed')) return isAr ? 'فشل التحقق من الأمان' : 'Security check failed';
    return isAr ? 'حدث خطأ، حاول مجدداً' : 'Something went wrong — try again';
  };

  const sendOtp = async () => {
    if (!name.trim()) {
      setNameErr(isAr ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    if (!/^05\d{8}$/.test(phone.trim())) {
      setPhoneErr(isAr ? 'أدخل رقماً سعودياً صحيحاً' : 'Enter a valid Saudi number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const conf = await FB.startPhoneSignIn(phone.trim(), 'recaptcha-container');
      confirmationRef.current = conf;
      setPhase('otp');
      startCountdown();
    } catch (e: any) {
      setError(humanErr(String(e?.code || e?.message || '')));
    } finally {
      setLoading(false);
    }
  };

  const handleOtp = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) refs[i + 1].current?.focus();
    if (!val && i > 0) refs[i - 1].current?.focus();
  };

  const verify = async () => {
    const entered = otp.join('');
    if (entered.length < 6) return;
    if (!confirmationRef.current) {
      setError(isAr ? 'ابدأ من جديد' : 'Please restart');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmationRef.current.confirm(entered);
      // Auth state change now fires in App.tsx via onAuth. Persist name + first-seen for this phone.
      const cleanName = name.trim();
      const cleanPhone = phone.trim();
      FB.saveCustomer({ name: cleanName, phone: cleanPhone, firstSeen: new Date().toISOString() });
      onVerified({ name: cleanName, phone: cleanPhone });
    } catch (e: any) {
      setError(humanErr(String(e?.code || e?.message || '')));
      setOtp(['', '', '', '', '', '']);
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setOtp(['', '', '', '', '', '']);
    setError('');
    setLoading(true);
    try {
      const conf = await FB.startPhoneSignIn(phone.trim(), 'recaptcha-container');
      confirmationRef.current = conf;
      startCountdown();
    } catch (e: any) {
      setError(humanErr(String(e?.code || e?.message || '')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-6 py-10">
      {/* Invisible reCAPTCHA container — required by Firebase phone auth. */}
      <div id="recaptcha-container" />

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
              ? `أرسلنا رمزاً إلى ${phone}`
              : `We sent a code to ${phone}`}
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
          {error && <div className="text-[13px] font-black text-brand-red">❌ {error}</div>}
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            onClick={sendOtp}
            disabled={loading}
            className="sheen mt-2 rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red disabled:opacity-60"
          >
            {loading ? (isAr ? 'جاري الإرسال...' : 'Sending...') : isAr ? 'إرسال رمز التحقق →' : 'Send OTP →'}
          </motion.button>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-5">
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
            disabled={otp.join('').length < 6 || loading}
            className="sheen w-full rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (isAr ? 'جاري التحقق...' : 'Verifying...') : isAr ? 'تحقق الآن ✓' : 'Verify Now ✓'}
          </motion.button>
          <div className="text-[13px] font-bold text-brand-muted">
            {countdown > 0 ? (
              <span>{isAr ? `إعادة إرسال بعد ${countdown}ث` : `Resend in ${countdown}s`}</span>
            ) : (
              <button onClick={resend} disabled={loading} className="font-black text-brand-red disabled:opacity-60">
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
