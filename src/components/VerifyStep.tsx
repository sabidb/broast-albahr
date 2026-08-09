import { useState } from 'react';
import { motion } from 'framer-motion';
import Field from './Field';
import { LOGO_SRC } from '../lib/logo';
import { FB } from '../lib/fb';

interface Props {
  onVerified: (u: { uid: string; name: string; phone: string }) => void;
  isAr: boolean;
}

export default function VerifyStep({ onVerified, isAr }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
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
      const cleanName = name.trim();
      const cleanPhone = phone.trim();
      const au = await FB.signInAnon();
      if (!au) throw new Error('anon-signin-failed');
      await FB.setDisplayName(cleanName);
      await FB.saveCustomer({
        uid: au.uid,
        name: cleanName,
        phone: cleanPhone,
        firstSeen: new Date().toISOString(),
      });
      onVerified({ uid: au.uid, name: cleanName, phone: cleanPhone });
    } catch (e: any) {
      setError(isAr ? 'حدث خطأ، حاول مجدداً' : 'Something went wrong — try again');
      // eslint-disable-next-line no-console
      console.error('[VerifyStep] sign-in failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-6 py-10">
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
          {isAr ? 'أهلاً بك في بروست البحر' : 'Welcome to Broast Al Bahr'}
        </h1>
        <p className="mt-1.5 text-[14px] font-semibold text-brand-muted">
          {isAr ? 'سجّل دخولك لتبدأ الطلب وتجمع النقاط 🎁' : 'Sign in to start ordering & earning points 🎁'}
        </p>
      </motion.div>

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
          onClick={submit}
          disabled={loading}
          className="sheen mt-2 rounded-2xl bg-brand-red py-4 text-base font-black text-white shadow-red disabled:opacity-60"
        >
          {loading ? (isAr ? 'جاري الدخول...' : 'Signing in...') : isAr ? 'ابدأ الطلب →' : 'Start Ordering →'}
        </motion.button>
      </motion.div>
    </div>
  );
}
