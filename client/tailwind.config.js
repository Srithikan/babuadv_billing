/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                navy: {
                    900: '#0f172a',
                    800: '#1e293b',
                    700: '#334155',
                },
                amber: {
                    500: '#f59e0b',
                    600: '#d97706',
                    700: '#b45309',
                }
            }
        },
    },
    plugins: [],
}
