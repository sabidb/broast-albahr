/** Turn a phone number into a stable, human-typeable 6-char referral code. */
export function referralCodeFor(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-8) || '00000000';
  const seed = digits.split('').reduce((a, c) => a * 31 + Number(c), 7);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/1/I/L/O to avoid confusion
  let n = Math.abs(seed);
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return 'BA' + out; // "BA" prefix = Broast Al Bahr
}

export function shareCopy(code: string, isAr: boolean): { title: string; text: string; url: string } {
  const url = typeof window !== 'undefined' ? window.location.origin + `/?ref=${code}` : `https://broastalbahr.app/?ref=${code}`;
  return {
    title: isAr ? 'انضم بروست البحر واحصل على خصم' : 'Join Broast Al Bahr — SR 20 off',
    text: isAr
      ? `استعمل رمزي ${code} عند طلبك الأول في تطبيق بروست البحر واحصل على خصم ٢٠ ريال 🍗`
      : `Use my code ${code} on your first Broast Al Bahr order and get SR 20 off 🍗`,
    url,
  };
}
