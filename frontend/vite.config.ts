import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 3002,
		host: '0.0.0.0'
	},
	build: {
		target: 'esnext',
		minify: 'esbuild',
		cssMinify: true,
		rollupOptions: {
			output: {
				manualChunks: {
					'svelte-vendor': ['svelte'],
					'socket-vendor': ['socket.io-client'],
					'signal-vendor': ['@signalapp/libsignal-client']
				}
			}
		}
	}
});
