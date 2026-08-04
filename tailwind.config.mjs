/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#E10600',
          redDeep: '#8a0000',
          gold: '#FFD400',
          goldSoft: '#ffe875',
          amber: '#FF8C00',
          ink: '#120202',
          ink2: '#0a0000',
          panel: '#1a0606',
          panel2: '#220808',
          line: 'rgba(255,255,255,0.07)',
          muted: '#9a8a8a',
        },
      },
      fontFamily: {
        display: ["'Montserrat'", 'system-ui', 'sans-serif'],
        sans: ["'Syne'", 'system-ui', 'sans-serif'],
        arabic: ["'Cairo'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(255,212,0,.25), 0 10px 34px rgba(255,140,0,.28)',
        goldLg: '0 14px 40px rgba(255,140,0,.5), 0 0 0 1px rgba(255,212,0,.4)',
        red: '0 10px 34px rgba(214,0,0,.4)',
        card: '0 10px 26px rgba(0,0,0,.4)',
        cardHover: '0 22px 48px rgba(214,0,0,.28), 0 0 0 1px rgba(255,212,0,.18)',
      },
      keyframes: {
        drift: {
          '0%': { transform: 'translate3d(0,0,0) scale(1)' },
          '50%': { transform: 'translate3d(2%,-1.6%,0) scale(1.06)' },
          '100%': { transform: 'translate3d(-2%,1.6%,0) scale(1.03)' },
        },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-7px)' } },
        logoFloat: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-11px)' } },
        shine: { to: { backgroundPosition: '200% center' } },
        splashOrb: {
          '0%,100%': { opacity: '.65', transform: 'translateX(-50%) scale(1)' },
          '50%': { opacity: '1', transform: 'translateX(-50%) scale(1.16)' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        bounceDot: { '0%,80%,100%': { transform: 'scale(.3)', opacity: '.5' }, '40%': { transform: 'scale(1)', opacity: '1' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 0 0 rgba(255,212,0,0)' }, '50%': { boxShadow: '0 0 26px 2px rgba(255,212,0,.35)' } },
      },
      animation: {
        drift: 'drift 20s ease-in-out infinite alternate',
        floaty: 'floaty 4s ease-in-out infinite',
        logoFloat: 'logoFloat 4s ease-in-out 1s infinite',
        shine: 'shine 4s linear infinite',
        splashOrb: 'splashOrb 6s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        bounceDot: 'bounceDot 1.2s infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
