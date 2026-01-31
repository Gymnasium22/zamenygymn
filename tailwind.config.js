/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  safelist: [
    // Success colors
    'bg-success-50', 'bg-success-100', 'bg-success-500', 'bg-success-600', 'bg-success-700', 'bg-success-800', 'bg-success-900',
    'text-success-200', 'text-success-800', 'text-success-700',
    'border-success-200', 'border-success-800',
    // Warning colors
    'bg-warning-50', 'bg-warning-100', 'bg-warning-500', 'bg-warning-600', 'bg-warning-700', 'bg-warning-800', 'bg-warning-900',
    'text-warning-200', 'text-warning-800', 'text-warning-700',
    'border-warning-200', 'border-warning-800',
    // Danger colors
    'bg-danger-50', 'bg-danger-100', 'bg-danger-500', 'bg-danger-600', 'bg-danger-700', 'bg-danger-800', 'bg-danger-900',
    'text-danger-200', 'text-danger-800', 'text-danger-700',
    'border-danger-200', 'border-danger-800',
    // Primary colors
    'bg-primary-50', 'bg-primary-100', 'bg-primary-200', 'bg-primary-300', 'bg-primary-500', 'bg-primary-600', 'bg-primary-700', 'bg-primary-800', 'bg-primary-900',
    'text-primary-200', 'text-primary-800', 'text-primary-700',
    'border-primary-200', 'border-primary-300', 'border-primary-800', 'hover:border-primary-300',
    // Utility classes
    'animate-fade-in', 'animate-fade-out', 'animate-slide-in', 'animate-scale-in', 'animate-bounce-in', 'animate-skeleton',
    'btn-primary', 'btn-secondary', 'btn-success', 'btn-danger', 'btn-ripple',
    'modern-card', 'skeleton', 'badge-success', 'badge-warning', 'badge-danger',
    'focus-ring', 'mobile-optimized', 'tablet-optimized', 'mobile-grid', 'tablet-grid',
    // Dark theme colors
    'bg-dark-800', 'border-slate-600', 'text-slate-200', 'placeholder-slate-400',
    'dark:bg-dark-800', 'dark:border-slate-600', 'dark:text-slate-200', 'dark:placeholder-slate-400'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', 'Manrope', 'system-ui', 'sans-serif'],
        display: ['Cal Sans', 'Inter var', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      colors: {
        primary: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81'
        },
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
          500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d'
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f'
        },
        danger: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
          500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d'
        },
        dark: { 800: '#1e293b', 900: '#0f172a', 950: '#020617' }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'fade-out': 'fadeOut 0.3s ease-in forwards',
        'slide-in': 'slideIn 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'skeleton': 'skeletonLoading 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(5px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        skeletonLoading: {
          '0%': { 'background-position': '200% 0' },
          '100%': { 'background-position': '-200% 0' },
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-10px) scale(0.95)' },
        },
      }
    },
  },
  plugins: [],
}