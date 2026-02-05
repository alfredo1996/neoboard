export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        'apple-blue': '#007aff',
        'page-bg': '#f5f5f7',
        'card-bg': 'rgba(255, 255, 255, 0.95)',
        'header-bg': 'rgba(245, 245, 245, 0.8)',
        'text-primary': '#1c1c1e',
      },
      boxShadow: {
        'card': '0 10px 25px rgba(0,0,0,0.1)',
      },
      borderRadius: {
        'card': '15px',
        'tab': '10px',
      },
    },
  },
  plugins: [],
}
