const TERMS: { en: string; ar: string }[] = [
  {
    en: 'Your order will be READY within 15 MINUTES of confirmation. Please plan accordingly.',
    ar: 'سيكون طلبك جاهزاً خلال ١٥ دقيقة من التأكيد. يُرجى التخطيط وفقاً لذلك.',
  },
  {
    en: 'If you FAIL TO PICK UP your order on time, your account may be BANNED 🚫 and loyalty points DEDUCTED.',
    ar: 'إذا لم تستلم طلبك في الوقت المحدد، قد يتم حظر حسابك 🚫 وخصم نقاط الولاء.',
  },
  {
    en: 'Please arrive at the branch on time. Repeated late pickups may result in a permanent ban.',
    ar: 'يُرجى الحضور إلى الفرع في الوقت المحدد. التأخر المتكرر قد يؤدي إلى حظر دائم.',
  },
  {
    en: 'Once an order is CONFIRMED it cannot be cancelled. Please review your cart before placing the order.',
    ar: 'بمجرد تأكيد الطلب لا يمكن إلغاؤه. يُرجى مراجعة سلتك قبل تقديم الطلب.',
  },
  {
    en: 'Prices displayed INCLUDE 15% VAT. No hidden charges will be added at pickup.',
    ar: 'الأسعار المعروضة شاملة ضريبة القيمة المضافة ١٥٪. لن يتم إضافة أي رسوم مخفية عند الاستلام.',
  },
  {
    en: 'Please treat our staff with RESPECT. Abusive behavior may result in your account being permanently banned.',
    ar: 'يُرجى معاملة موظفينا باحترام. السلوك المسيء قد يؤدي إلى حظر حسابك بشكل دائم.',
  },
];

export default function TermsFooter({ isAr }: { isAr: boolean }) {
  return (
    <div className="mx-auto mt-8 max-w-[640px] px-4 pb-24">
      <div className="rounded-3xl border-2 border-brand-red/20 bg-white p-5 shadow-soft">
        <div className="mb-3 text-center">
          <div className="text-[16px] font-black uppercase tracking-wide text-brand-red">
            ⚠️ Terms &amp; Conditions · الشروط والأحكام
          </div>
          <div className="mt-1 text-[10px] font-bold text-brand-muted">
            Please read carefully · يُرجى القراءة بعناية
          </div>
        </div>
        <div className="space-y-3">
          {TERMS.map((t, i) => (
            <div key={i} className="rounded-2xl bg-brand-cream p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-[11px] font-black text-white">
                  {i + 1}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-start text-[12px] font-black leading-snug text-brand-ink" dir="ltr">
                  {t.en}
                </div>
                <div className="text-end font-arabic text-[12px] font-black leading-snug text-brand-ink" dir="rtl">
                  {t.ar}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-brand-red/10 p-3 text-center">
          <div className="text-[11px] font-black text-brand-red">
            By placing an order you AGREE to all terms above ·{' '}
            <span className="font-arabic">بتقديم طلبك فإنك توافق على جميع الشروط أعلاه</span>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-[10px] font-bold text-brand-muted">
        Broast Al Bahr · بروست البحر · VAT Reg. No: 311459656500003
      </div>
    </div>
  );
}
