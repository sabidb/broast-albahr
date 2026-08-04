import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  const [nameErr, setNameErr] = useState(false);
  const [phoneErr, setPhoneErr] = useState(false);
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
    let valid = true;
    if (!name.trim()) {
      setNameErr(true);
      valid = false;
    }
    if (!/^05\d{8}$/.test(phone.trim())) {
      setPhoneErr(true);
      valid = false;
    }
    if (!valid) return;
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

  const inputCls = (err: boolean) =>
    `w-full rounded-xl border bg-[#1a0000] px-4 py-3 text-[15px] text-white outline-none transition focus:border-brand-gold focus:shadow-[0_0_0_3px_rgba(255,212,0,0.14)] ${
      err ? 'border-brand-red' : 'border-[#3a0000]'
    }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.9, 0.28, 1] }}
      className="mx-auto max-w-[420px] px-5 py-10"
    >
      <div className="mb-7 text-center">
        <motion.div
          key={phase}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="mb-2 text-5xl"
        >
          {phase === 'form' ? '👋' : '📱'}
        </motion.div>
        <h2 className="text-[22px] font-extrabold text-brand-gold">
          {phase === 'form'
            ? isAr
              ? 'أهلاً بك!'
              : 'Welcome!'
            : isAr
              ? 'تحقق من رقمك'
              : 'Verify Your Number'}
        </h2>
        <p className="mt-1.5 text-[13px] text-brand-muted">
          {phase === 'form'
            ? isAr
              ? 'أدخل اسمك ورقم جوالك للمتابعة'
              : 'Enter your name and mobile number to continue'
            : isAr
              ? `تم إرسال رمز التحقق إلى ${phone}`
              : `OTP sent to ${phone}`}
        </p>
        {demoCode && phase === 'otp' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3 inline-block w-full rounded-2xl border-2 border-brand-gold bg-brand-gold/10 px-6 py-4"
          >
            <div className="mb-1.5 text-[11px] font-semibold text-brand-muted">
              {isAr ? 'رمز التحقق الخاص بك' : 'Your verification code'}
            </div>
            <div className="font-display text-[28px] font-black tracking-[8px] text-brand-gold">
              {demoCode}
            </div>
          </motion.div>
        )}
      </div>

      {phase === 'form' ? (
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-xs text-brand-muted">
              {isAr ? 'الاسم الكامل' : 'Full Name'}
            </label>
            <input
              className={inputCls(nameErr)}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameErr(false);
              }}
              placeholder={isAr ? 'مثال: محمد علي' : 'e.g. Mohammed Ali'}
            />
            {nameErr && (
              <div className="mt-1 text-[11px] text-brand-red">
                ⚠ {isAr ? 'الاسم مطلوب' : 'Name is required'}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-brand-muted">
              {isAr ? 'رقم الجوال' : 'Mobile Number'}
            </label>
            <input
              className={inputCls(phoneErr)}
              value={phone}
              type="tel"
              maxLength={10}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneErr(false);
              }}
              placeholder="05XXXXXXXX"
            />
            {phoneErr && (
              <div className="mt-1 text-[11px] text-brand-red">
                ⚠ {isAr ? 'أدخل رقماً سعودياً صحيحاً (05XXXXXXXX)' : 'Enter a valid Saudi number (05XXXXXXXX)'}
              </div>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={sendOtp}
            disabled={loading}
            className="sheen mt-1.5 rounded-xl border-2 border-brand-gold py-3.5 text-base font-extrabold text-brand-gold shadow-red"
            style={{ background: 'linear-gradient(135deg,#E10600,#8a0000)' }}
          >
            {loading ? (isAr ? 'جاري الإرسال...' : 'Sending...') : isAr ? 'إرسال رمز التحقق →' : 'Send OTP →'}
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="flex gap-2.5">
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
                className="h-[50px] w-[44px] rounded-[10px] border-2 border-[#3a0000] bg-[#1a0000] text-center font-display text-xl font-extrabold text-white outline-none transition focus:-translate-y-0.5 focus:border-brand-gold focus:shadow-[0_0_0_3px_rgba(255,212,0,0.18),0_0_18px_rgba(255,212,0,0.25)]"
              />
            ))}
          </div>
          {error && <div className="text-[13px] font-bold text-brand-red">❌ {error}</div>}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={verify}
            disabled={otp.join('').length < 6}
            className="sheen w-full rounded-xl border-2 border-brand-gold py-3.5 text-base font-extrabold text-brand-gold disabled:opacity-40"
            style={{
              background:
                otp.join('').length < 6 ? '#1a0000' : 'linear-gradient(135deg,#E10600,#8a0000)',
            }}
          >
            {isAr ? 'تحقق الآن ✓' : 'Verify Now ✓'}
          </motion.button>
          <div className="text-[13px] text-brand-muted">
            {countdown > 0 ? (
              <span className="animate-pulse">
                {isAr ? `إعادة إرسال بعد ${countdown}ث` : `Resend in ${countdown}s`}
              </span>
            ) : (
              <button
                onClick={() => {
                  setOtp(['', '', '', '', '', '']);
                  const code = generateOTP();
                  otpRef.current = code;
                  setDemoCode(code);
                  startCountdown();
                }}
                className="font-bold text-brand-red"
              >
                {isAr ? 'إعادة إرسال الرمز' : 'Resend OTP'}
              </button>
            )}
          </div>
          <button onClick={() => setPhase('form')} className="text-xs text-[#666]">
            ← {isAr ? 'تغيير الرقم' : 'Change number'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
