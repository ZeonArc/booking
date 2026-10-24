import { defineConfig } from 'vite';
// Never inline assets as data: URLs; the server CSP only allows same-origin fonts.
export default defineConfig({server:{proxy:{'/api':'http://127.0.0.1:3000'}},build:{outDir:'dist',assetsInlineLimit:0}});
