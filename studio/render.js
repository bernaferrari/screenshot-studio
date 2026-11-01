// Built from https://github.com/bernaferrari/screenshot-studio (src/). Edit the source, not this file.
// src/core/gallery.ts
/**
* The parsed contents of a studio file, without editor metadata. Files may carry a "$schema" key (for autocomplete
* and checks in editors); it isn't a gallery, a profile or a card's words, so every reader drops it.
*/
function withoutMeta(value) {
	if (!value || typeof value !== "object" || Array.isArray(value) || !("$schema" in value)) return value;
	const { $schema: _schema, ...rest } = value;
	return rest;
}
/**
* A device gallery is either a list of cards, or {"inherits": "phone", "cards": [...]}: each card is
* merged over the inherited card at the same position, so a tablet only swaps its captures and composition.
*/
function cardsFor(galleries, kind, seen = /* @__PURE__ */ new Set()) {
	const gallery = galleries[kind];
	if (!gallery) throw new Error(`Unknown gallery: ${kind}`);
	if (Array.isArray(gallery)) return gallery;
	if (seen.has(kind)) throw new Error(`Gallery ${kind} inherits from itself`);
	seen.add(kind);
	const base = cardsFor(galleries, gallery.inherits, seen);
	if (gallery.cards.length !== base.length) throw new Error(`${kind} must override all ${base.length} cards of ${gallery.inherits}`);
	return gallery.cards.map((card, i) => ({
		...base[i],
		...card
	}));
}
/** Words for one card: the locale's copy over the default locale's, kind-specific entries over shared ones. */
function withCopy(card, kind, copy = {}, fallback = {}) {
	const keys = card.sharedCopy === false ? [`${kind}/${card.feature}`] : [card.feature, `${kind}/${card.feature}`];
	const own = Object.assign({}, ...keys.map((k) => copy[k] || {}));
	const base = Object.assign({}, ...keys.map((k) => fallback[k] || {}));
	const empty = (value) => typeof value === "string" && !value.trim();
	const missing = Object.keys(base).filter((field) => !(field in own) || empty(own[field]));
	const translated = Object.fromEntries(Object.entries(own).filter(([, value]) => !empty(value)));
	return {
		card: {
			...card,
			...base,
			...translated
		},
		missing
	};
}
/** Devices on a card: `devices` when several, otherwise the single `raw` capture; none for art-only cards. */
const devicesFor = (card) => card.devices || (card.raw ? [{
	raw: card.raw,
	...card.frame ? { frame: card.frame } : {}
}] : []);
/** The layout sidecar written next to a capture: the app's UI tree with bounds, in capture pixels. */
const nodesFile = (raw) => raw.replace(/\.[a-z]+$/i, ".nodes.json");
/** Resolve a pinned element. Prefer a unique resource ID; paths require the recorded class to agree. */
function pinnedNode(box, tree) {
	if (!tree?.nodes || !box.target) return null;
	let node;
	if (box.targetId) {
		const matches = tree.nodes.filter((n) => n.id === box.targetId);
		if (matches.length !== 1) return null;
		node = matches[0];
	} else node = tree.nodes.find((n) => n.path === box.target);
	if (!node || box.targetClass && node.cls !== box.targetClass) return null;
	return node;
}
/**
* Follow a capture's UI element into another locale. Element-mode selections use its exact bounds;
* hand-drawn crops keep their offsets from the reference anchor. Unpinned legacy crops find an
* anchor by overlap. Missing, ambiguous or incompatible elements return null for strict reporting.
*/
function followCallout(box, reference, localized) {
	if (!reference?.nodes || !localized?.nodes || box.targetMode === "element" && !box.target) return null;
	const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
	const overlap = ([l, t, r, b]) => {
		const w = Math.max(0, Math.min(r, box.x + box.w) - Math.max(l, box.x)), h = Math.max(0, Math.min(b, box.y + box.h) - Math.max(t, box.y));
		return w * h / ((r - l) * (b - t) + box.w * box.h - w * h);
	};
	const candidates = reference.nodes.filter((n) => n.b[0] <= cx && cx <= n.b[2] && n.b[1] <= cy && cy <= n.b[3] && n.b[2] > n.b[0] && n.b[3] > n.b[1]);
	const anchor = box.target ? pinnedNode(box, reference) : candidates.sort((a, b) => overlap(b.b) - overlap(a.b))[0];
	if (!anchor || !box.target && overlap(anchor.b) < .2) return null;
	const target = box.target ? pinnedNode(box, localized) : localized.nodes.find((n) => n.path === anchor.path);
	if (!target || anchor.cls && target.cls && anchor.cls !== target.cls) return null;
	const [l, t, r, b] = anchor.b, [L, T, R, B] = target.b;
	const moved = box.targetMode === "element" ? {
		x: L,
		y: T,
		w: R - L,
		h: B - T,
		path: target.path
	} : {
		x: L + box.x - l,
		y: T + box.y - t,
		w: R - L + box.w - (r - l),
		h: B - T + box.h - (b - t),
		path: target.path
	};
	if (![
		moved.x,
		moved.y,
		moved.w,
		moved.h
	].every(Number.isFinite) || moved.w <= 0 || moved.h <= 0 || moved.x < 0 || moved.y < 0) return null;
	if (localized.width && moved.x + moved.w > localized.width || localized.height && moved.y + moved.h > localized.height) return null;
	return moved;
}
// src/renderer/render.ts
const q = new URLSearchParams(location.search);
if (q.get("strip")) document.documentElement.dataset.strip = q.get("strip");
async function json(file, optional = false) {
	const response = await fetch(file);
	if (!response.ok) {
		if (optional) return null;
		throw new Error(`Cannot load ${file}`);
	}
	return withoutMeta(await response.json());
}
const config = await json("../studio.json");
const defaultLocale = config.defaultLocale || "en-US";
const locale = q.get("locale") || defaultLocale;
const [galleries, profiles, copy, defaultCopy] = await Promise.all([
	json("../gallery.json"),
	json("../profiles.json"),
	json(`../${locale}/copy.json`, true),
	json(`../${defaultLocale}/copy.json`, true)
]);
const kind = q.get("kind") || Object.keys(galleries)[0];
const profile = profiles[kind];
if (!profile) throw new Error(`No profile for ${kind}`);
const words = (cards) => cards.map((card) => withCopy(card, kind, copy || {}, locale === defaultLocale ? {} : defaultCopy || {}).card);
const slides = words(cardsFor(galleries, kind));
const index = Math.max(0, Math.min(slides.length - 1, Number(q.get("slide") || 0)));
const { card: slide, missing } = withCopy(cardsFor(galleries, kind)[index], kind, copy || {}, locale === defaultLocale ? {} : defaultCopy || {});
const report = {
	locale,
	missingCopy: copy ? missing : ["copy.json"],
	fallbackCaptures: [],
	movedCallouts: [],
	fixedCallouts: [],
	fit: 1
};
const W = profile.width;
const H = profile.height;
const theme = (await import(
	/* @vite-ignore */
	"../theme.js"
)).default || {};
const root = document.documentElement;
root.lang = locale;
root.dir = (config.rtl || []).includes(locale) ? "rtl" : "ltr";
root.classList.add(kind, `frame-${profile.frame || "phone"}`, W > H ? "landscape" : "portrait");
root.style.setProperty("--canvas-width", `${W}px`);
root.style.setProperty("--canvas-height", `${H}px`);
for (const [name, value] of Object.entries(slide.vars || {})) root.style.setProperty(name, value);
const main = document.createElement("main");
main.className = `campaign ${slide.feature} ${slide.layout || ""}`.trim();
main.innerHTML = "<svg class=\"art\" aria-hidden=\"true\"></svg>";
document.body.append(main);
if (slide.title) {
	const header = document.createElement("header");
	header.innerHTML = "<h1></h1><p></p>";
	const h1 = header.querySelector("h1");
	for (const text of slide.title.split("\n")) {
		const line = document.createElement("span");
		line.className = "line";
		for (const part of text.split(/(\*[^*]+\*|~[^~]+~|\[[^\]]+\])/).filter(Boolean)) {
			const tag = {
				"*": "em",
				"~": "del",
				"[": "ins"
			}[part[0]];
			if (tag && part.length > 2) {
				const node = document.createElement(tag);
				node.textContent = part.slice(1, -1);
				line.append(node);
			} else line.append(part);
		}
		h1.append(line);
	}
	if (slide.body) header.querySelector("p").textContent = slide.body;
	else header.querySelector("p").remove();
	main.append(header);
}
main.setAttribute("aria-label", slide.alt || `${slide.feature}: ${(slide.title || "").replace(/[*~[\]]/g, "").replaceAll("\n", " ")}`);
const loadCapture = (img, raw) => new Promise((resolve) => {
	img.onload = () => resolve(img.dataset.fallback ? defaultLocale : locale);
	img.onerror = () => {
		if (img.dataset.fallback) return resolve(null);
		img.dataset.fallback = "true";
		report.fallbackCaptures.push(raw);
		img.src = `../${defaultLocale}/raw/${raw}`;
	};
	img.src = `../${locale}/raw/${raw}`;
});
const devices = devicesFor(slide).map((spec, i) => {
	const frame = spec.frame || profile.frame || "phone";
	const node = document.createElement("div");
	node.className = `device ${spec.role || (i === 0 ? "primary" : `device-${i + 1}`)} device-frame-${frame}`;
	node.innerHTML = "<div class=\"screen\"><img data-app-capture alt=\"\"></div>";
	if (frame === "browser") node.insertAdjacentHTML("beforeend", "<div class=\"dots\"><i></i><i></i><i></i></div>");
	const img = node.querySelector("img");
	img.alt = spec.alt || `${slide.feature}: the real app with example data`;
	main.append(node);
	return {
		spec,
		node,
		img,
		loaded: loadCapture(img, spec.raw)
	};
});
const capture = devices[0]?.img;
const highlighted = (parent, text) => text.split(/(\*[^*]+\*)/).filter(Boolean).forEach((part) => parent.append(part.startsWith("*") ? Object.assign(document.createElement("em"), { textContent: part.slice(1, -1) }) : document.createTextNode(part)));
if (slide.identity) {
	const spec = {
		icon: "brand/icon.png",
		name: config.app,
		...config.identity,
		...typeof slide.identity === "object" ? slide.identity : {}
	};
	main.querySelector("header")?.remove();
	const id = document.createElement("div");
	id.className = "identity";
	id.dataset.checkBounds = "";
	const name = Object.assign(document.createElement("span"), { textContent: spec.name ?? "" });
	id.append(Object.assign(document.createElement("img"), {
		src: `../${spec.icon}`,
		alt: ""
	}), name);
	if (slide.tagline) {
		const small = document.createElement("small");
		highlighted(small, slide.tagline);
		id.append(small);
	}
	main.append(id);
}
const art = main.querySelector(".art");
art.setAttribute("viewBox", `0 0 ${W} ${H}`);
const context = {
	W,
	H,
	kind,
	locale,
	defaultLocale,
	index,
	slide,
	slides,
	profile,
	profiles,
	config,
	main,
	art,
	capture
};
if (theme.art) art.innerHTML = theme.art(context) || "";
if (theme.compose) await theme.compose(context);
const captureLocales = await Promise.all(devices.map((d) => d.loaded));
devices.forEach((d, i) => {
	d.locale = captureLocales[i];
	if (!d.locale) throw new Error(`Missing capture ${d.spec.raw}`);
});
await Promise.all([...document.images].map((image) => image.decode()));
await document.fonts.ready;
const ratios = Object.values(profiles).filter((p) => p.captureWidth && p.captureHeight).flatMap((p) => [p.captureWidth / p.captureHeight, p.captureHeight / p.captureWidth]);
for (const { img, spec } of devices) {
	const ratio = img.naturalWidth / img.naturalHeight;
	const own = spec.profile ? profiles[spec.profile] : null;
	const expected = own?.captureWidth && own.captureHeight ? own.captureWidth / own.captureHeight : null;
	if (expected ? Math.abs(ratio - expected) > .001 : !ratios.some((r) => Math.abs(ratio - r) < .001)) throw new Error(`Recapture ${spec.raw}: ${img.naturalWidth}×${img.naturalHeight} is not a configured device ratio`);
}
const relative = (element) => {
	const canvas = main.getBoundingClientRect(), r = element.getBoundingClientRect();
	return {
		left: r.left - canvas.left,
		top: r.top - canvas.top,
		width: r.width,
		height: r.height
	};
};
const layoutWords = [
	kind,
	slide.feature,
	...(slide.layout || "").split(/\s+/).filter(Boolean)
];
const frames = config.frames === false ? null : {
	phone: {
		bezel: .02,
		radius: .09
	},
	tablet: {
		bezel: .018,
		radius: .05
	},
	landscape: {
		bezel: .012,
		radius: .035
	},
	fixed: [],
	...config.frames
};
for (const d of devices) {
	const frame = d.spec.frame || profile.frame || "phone";
	const landscape = d.img.naturalWidth > d.img.naturalHeight;
	d.node.classList.add(landscape ? "device-landscape" : "device-portrait");
	const ratio = frames && !layoutWords.some((w) => frames.fixed.includes(w)) && frames[["phone", "tablet"].includes(frame) && landscape ? "landscape" : frame];
	if (!ratio || frame === "none") continue;
	const width = d.node.clientWidth;
	d.node.style.setProperty("--bezel", `${Math.round(width * ratio.bezel)}px`);
	d.node.style.setProperty("--radius", `${Math.round(width * ratio.radius)}px`);
}
if (theme.layout) await theme.layout(context);
const measured = devices.map((d) => ({
	...d,
	locale: d.locale ?? null,
	box: relative(d.node),
	screen: relative(d.node.querySelector(".screen"))
}));
context.devices = measured;
for (const { spec, box } of measured) {
	if (!spec.label) continue;
	const label = document.createElement("div");
	label.className = `device-label${spec.role ? ` ${spec.role}` : ""}`;
	label.dataset.checkBounds = "";
	const span = document.createElement("span");
	highlighted(span, spec.label);
	label.append(span);
	Object.assign(label.style, {
		left: `${box.left}px`,
		width: `${box.width}px`,
		top: `${box.top}px`
	});
	label.style.setProperty("--device-height", `${box.height}px`);
	label.style.setProperty("--tallest-device", `${Math.max(...measured.map((d) => d.box.height))}px`);
	main.append(label);
}
context.device = measured[0]?.box;
context.screen = measured[0]?.screen;
const sources = /* @__PURE__ */ new Map();
const sourceFor = async (raw) => {
	if (!sources.has(raw)) {
		const img = new Image();
		sources.set(raw, loadCapture(img, raw).then(async (capturedIn) => {
			if (!capturedIn) throw new Error(`Missing callout capture ${raw}`);
			await img.decode();
			return {
				img,
				spec: { raw },
				locale: capturedIn
			};
		}));
	}
	return sources.get(raw);
};
for (const [ci, c] of (slide.callouts || []).entries()) {
	const d = c.raw ? await sourceFor(c.raw) : measured[c.device || 0];
	let box = {
		x: c.x,
		y: c.y,
		w: c.w,
		h: c.h,
		target: c.target,
		targetId: c.targetId,
		targetClass: c.targetClass,
		targetMode: c.targetMode
	};
	if (d.locale !== defaultLocale || c.targetMode === "element") {
		const reference = await json(`../${defaultLocale}/raw/${nodesFile(d.spec.raw)}`, true);
		const localized = d.locale === defaultLocale ? reference : await json(`../${d.locale}/raw/${nodesFile(d.spec.raw)}`, true);
		const sizeMatches = localized?.width === d.img.naturalWidth && localized?.height === d.img.naturalHeight;
		const moved = c.targetMode === "element" && !sizeMatches ? null : followCallout(box, reference, localized);
		if (moved) {
			box = {
				...box,
				...moved
			};
			if (d.locale !== defaultLocale) report.movedCallouts.push(ci);
		} else if (c.targetMode === "element" && d.locale === defaultLocale) throw new Error(`The selected accessibility element is missing or incompatible in ${d.spec.raw}. Pick the element again.`);
		else report.fixedCallouts.push(ci);
	}
	let k, left, top;
	if (c.place) {
		k = c.place.width / box.w;
		left = c.place.left;
		top = c.place.top;
	} else {
		const screen = d.screen || context.screen;
		const scale = screen.width / d.img.naturalWidth;
		k = scale * (c.mag || 1.1);
		left = screen.left + (box.x + box.w / 2) * scale + (c.dx || 0) - box.w * k / 2;
		top = screen.top + (box.y + box.h / 2) * scale + (c.dy || 0) - box.h * k / 2;
	}
	const el = document.createElement("div");
	el.className = `callout${c.role ? ` ${c.role}` : ""}`;
	el.dataset.checkBounds = "";
	Object.assign(el.style, {
		width: `${box.w * k}px`,
		height: `${box.h * k}px`,
		left: `${left}px`,
		top: `${top}px`,
		borderRadius: `${(c.radius || 0) * k}px`,
		backgroundImage: `url("${d.img.src}")`,
		backgroundSize: `${d.img.naturalWidth * k}px auto`,
		backgroundPosition: `${-box.x * k}px ${-box.y * k}px`
	});
	main.append(el);
}
if (theme.decorate) await theme.decorate(context);
{
	const { layouts: own, ...base } = {
		margin: 0,
		visible: .6,
		...config.bounds
	};
	const layouts = {
		spread: { right: true },
		...own
	};
	const rules = [
		base,
		...layoutWords.map((w) => layouts[w]).filter((r) => r !== void 0),
		slide.bounds
	].filter((r) => r !== void 0);
	if (!rules.includes(false)) {
		const rule = Object.assign({}, ...rules);
		const m = rule.margin;
		for (const { box, spec } of measured) {
			const frame = spec.frame || profile.frame || "phone";
			if (frame === "none") continue;
			const overRight = box.left + box.width - (W - m);
			if (!rule.sides && (box.left < m - .5 || overRight > .5 && !(rule.right === true || overRight / box.width <= (Number(rule.right) || 0)))) throw new Error(`Screen leaves the side of the card: ${spec.raw}`);
			if (!rule.top && box.top < m - .5) throw new Error(`Screen leaves the top of the card: ${spec.raw}`);
			if ((Math.min(box.top + box.height, H) - Math.max(box.top, 0)) / box.height < rule.visible) throw new Error(`Too little of ${spec.raw} is visible`);
			if (!rule.cut && ["phone", "tablet"].includes(frame) && box.width > box.height && (box.top < -.5 || box.top + box.height > H + 1)) throw new Error(`Landscape tablet is cut: ${spec.raw}`);
		}
	}
}
report.continuous = Array.isArray(theme.continuous) ? theme.continuous.includes(kind) : !!theme.continuous;
const header = main.querySelector("header");
if (header) {
	const textBox = () => {
		const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
		let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
		for (let node; node = walker.nextNode();) {
			const range = document.createRange();
			range.selectNodeContents(node);
			for (const rect of range.getClientRects()) {
				l = Math.min(l, rect.left);
				t = Math.min(t, rect.top);
				r = Math.max(r, rect.right);
				b = Math.max(b, rect.bottom);
			}
		}
		return {
			l,
			t,
			r,
			b
		};
	};
	const blocks = [...main.querySelectorAll(".device:not(.device-frame-none)")].map((n) => n.getBoundingClientRect());
	const fits = () => {
		if ([...header.querySelectorAll("h1 .line")].some((line) => line.scrollWidth > line.parentElement.clientWidth + 1)) return false;
		const t = textBox();
		if (t.l < -.5 || t.t < -.5 || t.r > W + .5 || t.b > H + .5) return false;
		return blocks.every((d) => t.b + 16 <= d.top || t.t >= d.bottom || t.r + 16 <= d.left || t.l >= d.right);
	};
	const sizes = [...header.querySelectorAll("h1, p")].map((el) => [el, parseFloat(getComputedStyle(el).fontSize)]);
	const minFit = config.minFit || .72;
	for (let s = 1; !fits() && s > minFit - .001; s -= .02) {
		report.fit = Math.round(s * 100) / 100;
		for (const [el, size] of sizes) el.style.fontSize = `${size * s}px`;
		if (theme.refit) await theme.refit(context);
	}
	if (!fits()) report.fit = 0;
}
if (q.has("fit")) {
	root.classList.add("fit-scene");
	const fit = () => {
		const s = Math.min(innerWidth / W, innerHeight / H);
		Object.assign(main.style, {
			transformOrigin: "0 0",
			transform: `scale(${s})`,
			left: `${(innerWidth - W * s) / 2}px`,
			top: `${(innerHeight - H * s) / 2}px`
		});
	};
	fit();
	addEventListener("resize", fit);
}
root.dataset.report = JSON.stringify(report);
root.dataset.ready = "true";
