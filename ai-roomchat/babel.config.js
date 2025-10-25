// Minimal Babel config to enable JSX parsing with automatic runtime.
// Kept minimal to reduce differences from SWC behavior.
module.exports = {
	presets: [
		[
			'@babel/preset-react',
			{
				runtime: 'automatic',
				development: process.env.NODE_ENV === 'development',
			},
		],
	],
};
