/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        card: 'hsl(var(--card))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        info: 'hsl(var(--info))',
        /* 着色标签上的文字：随主题预设与深浅色自动取可读的明度 */
        tint: {
          primary: 'hsl(var(--tint-primary))',
          success: 'hsl(var(--success-text))',
          warning: 'hsl(var(--warning-text))',
          danger: 'hsl(var(--danger-text))',
          info: 'hsl(var(--info-text))'
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))'
        }
      },
      /* 简约风：整体收紧圆角。具体数值走主题变量，风格主题（直角 / 大圆角）才能整体生效 */
      borderRadius: {
        '2xl': 'var(--r-2xl, 12px)',
        xl: 'var(--r-xl, 10px)',
        lg: 'var(--r-lg, 8px)',
        md: 'var(--r-md, 6px)',
        sm: 'var(--r-sm, 4px)'
      },
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.985)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' }
        },
        'flip-in': {
          '0%': { opacity: '0', transform: 'rotateX(88deg) translateY(-22%) scale(0.96)', filter: 'brightness(0.45) blur(1px)' },
          '45%': { opacity: '1', transform: 'rotateX(-16deg) translateY(3%) scale(1.02)', filter: 'brightness(1.3) blur(0px)' },
          '75%': { transform: 'rotateX(6deg) translateY(-1%) scale(0.995)', filter: 'brightness(0.95)' },
          '100%': { opacity: '1', transform: 'rotateX(0deg) translateY(0) scale(1)', filter: 'brightness(1) blur(0px)' }
        },
        // 编辑模式：模块微微颤动，提示「可以拖动」
        jiggle: {
          '0%, 100%': { transform: 'rotate(-0.55deg) scale(1)' },
          '50%': { transform: 'rotate(0.55deg) scale(1.004)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'scale-in': 'scale-in 140ms ease-out',
        shimmer: 'shimmer 1.4s linear infinite',
        'flip-in': 'flip-in 460ms cubic-bezier(0.22, 0.9, 0.32, 1.04)',
        jiggle: 'jiggle 620ms ease-in-out infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
