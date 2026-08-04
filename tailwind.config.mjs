/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // accents
          red: '#E10600',
          redDeep: '#B00000',
          redSoft: '#FF5A4D',
          gold: '#F5A623',
          goldDeep: '#DE8A00',
          green: '#11845B',
          // light surfaces
          cream: '#FFF6EA',
          cream2: '#FBEBD7',
          card: '#FFFFFF',
          // text
          ink: '#1E1206',
          ink2: '#3A2A18',
          muted: '#8C7A64',
          line: 'rgba(30,18,6,0.10)',
        },
      },
      fontFamily: {
        display: ["'Montserrat'", 'system-ui', 'sans-serif'],
        sans: ["'Syne'", 'system-ui', 'sans-serif'],
        arabic: ["'Cairo'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(180,60,0,0.08)',
        card: '0 10px 30px rgba(180,60,0,0.08), 0 1px 0 rgba(255,255,255,0.6) inset',
        cardHover: '0 20px 44px rgba(225,6,0,0.16)',
        red: '0 12px 30px rgba(225,6,0,0.32)',
        gold: '0 12px 30px rgba(245,166,35,0.35)',
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
          '0%,100%': { opacity: '.5', transform: 'translateX(-50%) scale(1)' },
          '50%': { opacity: '.85', transform: 'translateX(-50%) scale(1.16)' },
        },
        bounceDot: { '0%,80%,100%': { transform: 'scale(.3)', opacity: '.5' }, '40%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        drift: 'drift 20s ease-in-out infinite alternate',
        floaty: 'floaty 4s ease-in-out infinite',
        logoFloat: 'logoFloat 4s ease-in-out 1s infinite',
        shine: 'shine 3s linear infinite',
        splashOrb: 'splashOrb 6s ease-in-out infinite',
        bounceDot: 'bounceDot 1.2s infinite',
      },
    },
  },
  plugins: [],
};
