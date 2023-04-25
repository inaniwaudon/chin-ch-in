import { Hono } from 'hono';
import { html } from 'hono/html';
import { decode as punycodeDecode } from 'punycode';
import * as url from 'url';
import satori, { init } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import yogaWasm from './yoga.wasm';
import resvgWasm from './index_bg.wasm';

interface Env {
	Bindings: {
		BUCKET: any;
		USER: string;
		PASS: string;
	};
}

const app = new Hono<Env>();
let fontBuffer: ArrayBuffer | undefined = undefined;

(async () => {
	init(await initYoga(yogaWasm));
	await initWasm(resvgWasm);
})();

const getSubdomain = (urlStr: string) => {
	const host = url.parse(urlStr).hostname;
	if (!host) {
		return '';
	}
	const list = host
		.split('.')
		.slice(0, -2)
		.map(item => (item.startsWith('xn--') ? punycodeDecode(item.replace('xn--', '')) : item));
	return list.join('');
};

const getHtml = (text: string, host: string, pageUrl: string) => {
	const siteUrl = html`https://${host}/`.toString();
	return html`<!DOCTYPE html>
		<html style="margin: 0; padding: 0;">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1.0" />
				<title>${text}</title>
				<link rel="shortcut icon" href="/ogp.png" type="image/x-icon" />
				<meta property="og:type" content="website" />
				<meta property="og:title" content="${text}" />
				<meta property="og:description" content="びろーん" />
				<meta property="og:url" content="${siteUrl}" />
				<meta property="og:site_name" content="chin-ch.in" />
				<meta property="og:image" content="${siteUrl}ogp.png" />
				<meta name="twitter:card" content="summary" />
				<meta name="twitter:image" content="${siteUrl}ogp.png" />
				<script>
					function copyUrl() {
						navigator.clipboard.writeText("${pageUrl}");
					}
				</script>
			</head>
			<body style="margin: 0 24px;">
				<h1>${text}</h1>
				<p>びろーん</p>
				<div style="display: flex; gap: 16px;">
					<a href="#" onclick="copyUrl()" />リンクを共有</a>
					<div style="margin-top: 2px">
						<a
							href="https://twitter.com/share?ref_src=twsrc%5Etfw"
							class="twitter-share-button"
							data-show-count="false"
						>Tweet</a>
					</div>
				</div>
				<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
			</body>
		</html>`;
};

const createImage = async (text: string) => {
	const size = 256;
	const textLength = text
		.split('')
		.reduce((previous, char) => previous + (char.match(/^[\x20-\x7e]*$/) ? 0.5 : 1.0), 0);
	const defaultFontLength = 4;
	const ratioX = defaultFontLength / textLength;

	const element = (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				background: '#fff',
			}}
		>
			<div
				style={{
					width: '1000%',
					height: '50%',
					marginTop: 10,
					fontSize: size / defaultFontLength,
					display: 'flex',
					transform: `scaleX(${ratioX}) scaleY(1.5)`,
					transformOrigin: 'left',
				}}
			>
				{text}
			</div>
			<div
				style={{
					width: '100%',
					height: '50%',
					fontSize: size / defaultFontLength,
					display: 'flex',
					transform: `scaleY(1.5)`,
				}}
			>
				ちんちん
			</div>
		</div>
	);
	const svg = await satori(element, {
		width: size,
		height: size,
		fonts: [
			{
				name: 'Line Seed JP',
				data: fontBuffer,
				style: 'normal',
			},
		],
	});
	return new Resvg(svg).render().asPng();
};

app.get('/ogp.png', async c => {
	if (!fontBuffer) {
		const font = await c.env.BUCKET.get('LINESeedJP_OTF_Bd.otf');
		fontBuffer = await font.arrayBuffer();
	}
	const subdomain = getSubdomain(c.req.url);

	// return the cached image if it exists
	const fileName = `ogp/${subdomain}.png`;
	const cachedImage = await c.env.BUCKET.get(fileName);
	if (cachedImage) {
		return c.body(await cachedImage.arrayBuffer());
	}

	const image = await createImage(subdomain);
	await c.env.BUCKET.put(`ogp/${subdomain}.png`, image);
	return c.body(image);
});

app.get('*', c => {
	const subdomain = getSubdomain(c.req.url);
	const host = url.parse(c.req.url).host;
	return c.html(getHtml(subdomain + 'ちんちん' + decodeURI(c.req.path.slice(1)), host, c.req.url));
});

export default app;
