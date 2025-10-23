process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-key'

// Ensure global.navigator is writable/assignable for tests that mutate it
try {
	if (typeof global !== 'undefined' && typeof global.navigator !== 'undefined') {
		const desc = Object.getOwnPropertyDescriptor(global, 'navigator') || Object.getOwnPropertyDescriptor(global, 'window')
		// If navigator.userAgent is an accessor on the prototype, replace navigator with a plain object copy
		if (global.navigator && Object.getOwnPropertyDescriptor(global.navigator, 'userAgent') && !Object.getOwnPropertyDescriptor(global.navigator, 'userAgent').writable) {
			global.navigator = Object.assign({}, global.navigator)
		}
	}
} catch (e) {
	// ignore
}

// Polyfill: provide a no-op getContext for HTMLCanvasElement in jsdom tests
try {
	if (typeof global !== 'undefined') {
		if (typeof HTMLCanvasElement === 'undefined') {
			// define a minimal mock HTMLCanvasElement constructor for tests that inspect prototype
			global.HTMLCanvasElement = function() {}
			global.HTMLCanvasElement.prototype = {}
		}

		if (!HTMLCanvasElement.prototype.getContext) {
			HTMLCanvasElement.prototype.getContext = function(type) {
				// return a minimal 2D context-like object for tests that expect callability
				if (type === '2d') {
					return {
						fillRect: function() {},
						clearRect: function() {},
						getImageData: function() { return { data: [] } },
						putImageData: function() {},
						createImageData: function() { return [] },
						setTransform: function() {},
						drawImage: function() {},
						save: function() {},
						fillText: function() {},
						restore: function() {},
						measureText: function() { return { width: 0 } },
					}
				}

				// For WebGL or other types, return null to mimic lack of support
				return null
			}
		}
	}
} catch (e) {
	// ignore polyfill errors
}

// Defensive: ensure global.window and global.document exist and are plain objects for tests
try {
	if (typeof global !== 'undefined') {
		if (typeof global.window === 'undefined') global.window = {}
		if (typeof global.document === 'undefined') global.document = { createElement: function() { return new HTMLCanvasElement() } }
	}
} catch (e) {}
