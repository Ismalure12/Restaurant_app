/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
    './src/app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Maqaaxi Pos monochrome-maroon tokens (Goodir brand #850D33).
        // Key names blue/green kept so existing utility classes still resolve;
        // both map onto maroon shades.
        blue: {
          DEFAULT: '#850D33',
          deep: '#6E0B2A',
          soft: '#FBE9EF',
        },
        green: {
          DEFAULT: '#A31743',
          deep: '#7A0F30',
          soft: '#F7E4EB',
          mint: '#E9B9C8',
        },
        cream: {
          DEFAULT: '#FAFAF8',
          2: '#f3f2ec',
        },
        ink: {
          DEFAULT: '#15172b',
          2: '#4a4d63',
        },
        muted: '#8a8c9e',
        spicy: {
          DEFAULT: '#b54a2f',
          bg: '#fbe9e2',
        },
        line: {
          DEFAULT: 'rgba(133,13,51,0.10)',
          soft: 'rgba(21,23,43,0.06)',
        },
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Cormorant Garamond', 'Times New Roman', 'serif'],
        ui: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(110,11,42,.05), 0 10px 30px -12px rgba(110,11,42,.18)',
        lift: '0 18px 50px -18px rgba(21,23,43,.18)',
        float: '0 14px 40px -10px rgba(133,13,51,.45)',
        shell: '0 30px 80px -20px rgba(110,11,42,.35)',
        'shell-lg': '0 40px 100px -30px rgba(110,11,42,.45)',
        'fab-green': '0 14px 30px -8px rgba(163,23,67,.5)',
        'add-blue': '0 8px 18px -8px rgba(133,13,51,.6)',
        'show-more': '0 10px 24px -12px rgba(133,13,51,.5)',
        'show-more-hover': '0 14px 30px -10px rgba(133,13,51,.55)',
        'swipe-next': '0 16px 36px -10px rgba(110,11,42,.32)',
        'swipe-hint': '0 18px 40px -10px rgba(110,11,42,.5)',
        'icon-btn': '0 6px 16px -4px rgba(0,0,0,.18)',
        'icon-light': '0 4px 12px -2px rgba(0,0,0,.12)',
        'add-mini': '0 4px 10px -2px rgba(110,11,42,.35)',
        'pricebadge': '0 10px 24px -6px rgba(0,0,0,.25)',
      },
      maxWidth: {
        shell: '440px',
      },
      screens: {
        // Custom breakpoints matching the design's mobile-first sizes
        xs: '380px',     // small phones (iPhone SE 2nd gen)
        sm: '640px',
        shell: '760px',  // tablet / shell-floats threshold from v2
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      keyframes: {
        menuFadeIn: {
          from: { opacity: '0', transform: 'translate3d(24px,0,0)' },
          to: { opacity: '1', transform: 'translate3d(0,0,0)' },
        },
        menuFadeBack: {
          from: { opacity: '0', transform: 'translate3d(-24px,0,0)' },
          to: { opacity: '1', transform: 'translate3d(0,0,0)' },
        },
        menuPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(163,23,67,.6)' },
          '70%': { boxShadow: '0 0 0 8px rgba(163,23,67,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(163,23,67,0)' },
        },
        menuBannerSlow: {
          from: { transform: 'scale(1.0)' },
          to: { transform: 'scale(1.1)' },
        },
        menuCatIn: { to: { transform: 'scale(1)' } },
        menuRise: { to: { opacity: '1', transform: 'translateY(0)' } },
        menuBump: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.45)' },
          '60%': { transform: 'scale(.92)' },
          '100%': { transform: 'scale(1)' },
        },
        menuSwArr: {
          '0%,100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(4px)' },
        },
        menuHand: {
          '0%,100%': { transform: 'translateX(0) rotate(0)' },
          '30%': { transform: 'translateX(-6px) rotate(-8deg)' },
          '60%': { transform: 'translateX(0) rotate(0)' },
        },
        menuSlideIn: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        menuFloaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
      animation: {
        'menu-fade-in': 'menuFadeIn .45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'menu-fade-back': 'menuFadeBack .45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'menu-pulse': 'menuPulse 2.2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'menu-banner-slow': 'menuBannerSlow 14s linear infinite alternate',
        'menu-cat-in': 'menuCatIn 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'menu-rise': 'menuRise .7s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'menu-bump': 'menuBump .6s cubic-bezier(0.22, 1, 0.36, 1)',
        'menu-sw-arr': 'menuSwArr 1.6s cubic-bezier(0.76, 0, 0.24, 1) infinite',
        'menu-hand': 'menuHand 1.6s cubic-bezier(0.76, 0, 0.24, 1) infinite',
        'menu-slide-in': 'menuSlideIn .5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'menu-floaty': 'menuFloaty 4s cubic-bezier(0.76, 0, 0.24, 1) infinite',
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
};
