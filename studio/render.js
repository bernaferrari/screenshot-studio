// Built from https://github.com/bernaferrari/screenshot-studio (src/). Edit the source, not this file.
// src/core/layout.ts
const TAGS = {
	"*": "em",
	"~": "del",
	"[": "ins"
};
/** Headline markup shared by every app: *highlight*, ~struck out~, [inserted], and \n for a new line. */
function parseHeadline(title) {
	return title.split("\n").map((line) => line.split(/(\*[^*]+\*|~[^~]+~|\[[^\]]+\])/).filter(Boolean).map((part) => {
		const tag = TAGS[part[0]];
		return tag && part.length > 2 ? {
			text: part.slice(1, -1),
			tag
		} : { text: part };
	}));
}
/** Text with only *highlight* markup: device labels and README taglines. */
function parseHighlight(text) {
	return text.split(/(\*[^*]+\*)/).filter(Boolean).map((part) => part.startsWith("*") && part.length > 2 ? {
		text: part.slice(1, -1),
		tag: "em"
	} : { text: part });
}
/** The headline as plain words, for alt text. */
const plainHeadline = (title) => title.replace(/[*~[\]]/g, "").replaceAll("\n", " ");
/**
* Frames scale with their width: bezel and corner radius as fractions of the frame width, per frame and for
* landscape captures in a phone or tablet frame. studio.json "frames" overrides any of them; "fixed" lists layouts
* whose CSS sizes its own frames; "frames": false turns scaling off.
*/
const FRAMES = {
	phone: {
		bezel: .02,
		radius: .09
	},
	iphone: {
		bezel: .016,
		radius: .15
	},
	tablet: {
		bezel: .018,
		radius: .05
	},
	landscape: {
		bezel: .012,
		radius: .035
	},
	fixed: []
};
const HANDHELD = [
	"phone",
	"iphone",
	"tablet"
];
/** The bezel and radius in pixels for a frame this wide, or null when its CSS sizes it. */
function frameSize(config, frame, landscape, width, layoutWords) {
	if (config.frames === false || frame === "none") return null;
	const frames = {
		...FRAMES,
		...config.frames
	};
	if (layoutWords.some((word) => (frames.fixed || []).includes(word))) return null;
	const ratio = frames[HANDHELD.includes(frame) && landscape ? "landscape" : frame];
	return ratio ? {
		bezel: Math.round(width * ratio.bezel),
		radius: Math.round(width * ratio.radius)
	} : null;
}
/**
* Layouts whose device leaves the canvas by design: the README spread's tablet runs off the right, a `hang` card's
* device hangs from the top with the copy underneath, and the short feature graphic shows only a phone's top.
*/
const LAYOUT_BOUNDS = {
	spread: { right: true },
	hang: { top: true },
	feature: { visible: .3 }
};
/**
* The bounds a card's devices keep, or null when a rule turns the checks off. studio.json "bounds" sets the base and,
* under "layouts", rules per layout word; the card's own "bounds" goes last.
*/
function boundsFor(config, layoutWords, own) {
	const { layouts, ...base } = {
		margin: 0,
		visible: .6,
		...config.bounds
	};
	const byWord = {
		...LAYOUT_BOUNDS,
		...layouts
	};
	const rules = [
		base,
		...layoutWords.map((word) => byWord[word]),
		own
	].filter((rule) => rule !== void 0);
	return rules.includes(false) ? null : Object.assign({}, ...rules);
}
/** Why the device showing `raw` breaks its bounds on a W×H card, or null when it keeps them. */
function boundsProblem(box, frame, rule, W, H, raw) {
	if (frame === "none") return null;
	const m = rule.margin;
	const overRight = box.left + box.width - (W - m);
	if (!rule.sides && (box.left < m - .5 || overRight > .5 && !(rule.right === true || overRight / box.width <= (Number(rule.right) || 0)))) return `Screen leaves the side of the card: ${raw}`;
	if (!rule.top && box.top < m - .5) return `Screen leaves the top of the card: ${raw}`;
	if ((Math.min(box.top + box.height, H) - Math.max(box.top, 0)) / box.height < rule.visible) return `Too little of ${raw} is visible`;
	if (!rule.cut && HANDHELD.includes(frame) && box.width > box.height && (box.top < -.5 || box.top + box.height > H + 1)) return `Landscape tablet is cut: ${raw}`;
	return null;
}
/**
* Where a callout sits on the card and how much it is scaled: at `place` when given, otherwise centred over where
* its region lives on the screen, magnified by `mag` (1.1) and nudged by dx, dy.
*/
function calloutPlacement(region, captureWidth, screen, options) {
	if (options.place) return {
		left: options.place.left,
		top: options.place.top,
		scale: options.place.width / region.w
	};
	const fit = screen.width / captureWidth;
	const scale = fit * (options.mag || 1.1);
	return {
		left: screen.left + (region.x + region.w / 2) * fit + (options.dx || 0) - region.w * scale / 2,
		top: screen.top + (region.y + region.h / 2) * fit + (options.dy || 0) - region.h * scale / 2,
		scale
	};
}
/** A short last line ("…all\nbuilt in.") reads as a mistake at thumbnail size. Widths are the wrapped lines'. */
const isWidow = (lineWidths) => lineWidths.length > 1 && lineWidths[lineWidths.length - 1] < Math.max(...lineWidths) * .3;
/** Whether a capture keeps a real device ratio: its own profile's, or one of the configured capture sizes either way up. */
function hasDeviceRatio(width, height, ratios, expected) {
	const ratio = width / height;
	return expected ? Math.abs(ratio - expected) <= .001 : ratios.some((r) => Math.abs(ratio - r) < .001);
}

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

// src/renderer/load.ts
async function json(file, optional = false) {
	const response = await fetch(file);
	if (!response.ok) {
		if (optional) return null;
		throw new Error(`Cannot load ${file}`);
	}
	return withoutMeta(await response.json());
}
/** The card a preview.html address asks for: ?locale=de-DE&kind=phone&slide=0. */
async function loadCard(q) {
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
	const fallback = locale === defaultLocale ? {} : defaultCopy || {};
	const cards = cardsFor(galleries, kind);
	const index = Math.max(0, Math.min(cards.length - 1, Number(q.get("slide") || 0)));
	const { card: slide, missing } = withCopy(cards[index], kind, copy || {}, fallback);
	return {
		config,
		profiles,
		locale,
		defaultLocale,
		kind,
		profile,
		index,
		slide,
		theme: (await fetch("../theme.js", { method: "HEAD" })).ok ? (await import(
			/* @vite-ignore */
			"../theme.js"
)).default || {} : {},
		slides: cards.map((card) => withCopy(card, kind, copy || {}, fallback).card),
		report: {
			locale,
			missingCopy: copy ? missing : ["copy.json"],
			fallbackCaptures: [],
			movedCallouts: [],
			fixedCallouts: [],
			fit: 1
		}
	};
}

// src/renderer/callouts.ts
async function drawCallouts(callouts, scene) {
	const { main, measured, defaultLocale, load, report } = scene;
	const sources = /* @__PURE__ */ new Map();
	const sourceFor = (raw) => {
		if (!sources.has(raw)) {
			const img = new Image();
			sources.set(raw, load(img, raw).then(async (capturedIn) => {
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
	for (const [index, c] of callouts.entries()) {
		const source = c.raw ? await sourceFor(c.raw) : measured[c.device || 0];
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
		if (source.locale !== defaultLocale || c.targetMode === "element") {
			const reference = await json(`../${defaultLocale}/raw/${nodesFile(source.spec.raw)}`, true);
			const localized = source.locale === defaultLocale ? reference : await json(`../${source.locale}/raw/${nodesFile(source.spec.raw)}`, true);
			const sizeMatches = localized?.width === source.img.naturalWidth && localized?.height === source.img.naturalHeight;
			const moved = c.targetMode === "element" && !sizeMatches ? null : followCallout(box, reference, localized);
			if (moved) {
				box = {
					...box,
					...moved
				};
				if (source.locale !== defaultLocale) report.movedCallouts.push(index);
			} else if (c.targetMode === "element" && source.locale === defaultLocale) throw new Error(`The selected accessibility element is missing or incompatible in ${source.spec.raw}. Pick the element again.`);
			else report.fixedCallouts.push(index);
		}
		const { left, top, scale: k } = calloutPlacement(box, source.img.naturalWidth, source.screen || scene.screen, c);
		const el = document.createElement("div");
		el.className = `callout${c.role ? ` ${c.role}` : ""}`;
		el.dataset.checkBounds = "";
		Object.assign(el.style, {
			width: `${box.w * k}px`,
			height: `${box.h * k}px`,
			left: `${left}px`,
			top: `${top}px`,
			borderRadius: `${(c.radius || 0) * k}px`,
			backgroundImage: `url("${source.img.src}")`,
			backgroundSize: `${source.img.naturalWidth * k}px auto`,
			backgroundPosition: `${-box.x * k}px ${-box.y * k}px`
		});
		main.append(el);
	}
}

// src/renderer/text.ts
/** Append runs to an element: plain text, or an em / del / ins around it. */
function appendRuns(parent, runs) {
	for (const run of runs) parent.append(run.tag ? Object.assign(document.createElement(run.tag), { textContent: run.text }) : run.text);
}
/** The card's header: its title, one span.line per line, and its body; null when it has no title. */
function headline(slide) {
	if (!slide.title) return null;
	const header = document.createElement("header");
	const h1 = document.createElement("h1");
	for (const runs of parseHeadline(slide.title)) {
		const line = document.createElement("span");
		line.className = "line";
		appendRuns(line, runs);
		h1.append(line);
	}
	header.append(h1);
	if (slide.body) header.append(Object.assign(document.createElement("p"), { textContent: slide.body }));
	return header;
}

// src/renderer/devices.ts
/** Loads captures by name, falling back to the default language and noting each fallback in the report. */
function captureLoader(locale, defaultLocale, report) {
	/** Resolves to the language the capture came from, or null when neither has it. */
	return (img, raw) => new Promise((resolve) => {
		img.onload = () => resolve(img.dataset.fallback ? defaultLocale : locale);
		img.onerror = () => {
			if (img.dataset.fallback) return resolve(null);
			img.dataset.fallback = "true";
			report.fallbackCaptures.push(raw);
			img.src = `../${defaultLocale}/raw/${raw}`;
		};
		img.src = `../${locale}/raw/${raw}`;
	});
}
/** A frame element per capture on the card, appended to main; captures start loading. */
function createDevices(main, slide, profile, load) {
	return devicesFor(slide).map((spec, i) => {
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
			frame,
			node,
			img,
			loaded: load(img, spec.raw)
		};
	});
}
/** Wait for every capture; fail on one that is missing or not a configured device ratio. */
async function settleDevices(devices, profiles) {
	const locales = await Promise.all(devices.map((d) => d.loaded));
	devices.forEach((d, i) => {
		if (!locales[i]) throw new Error(`Missing capture ${d.spec.raw}`);
	});
	await Promise.all([...document.images].map((image) => image.decode()));
	await document.fonts.ready;
	const ratios = Object.values(profiles).filter((p) => p.captureWidth && p.captureHeight).flatMap((p) => [p.captureWidth / p.captureHeight, p.captureHeight / p.captureWidth]);
	for (const { img, spec } of devices) {
		const own = spec.profile ? profiles[spec.profile] : null;
		const expected = own?.captureWidth && own.captureHeight ? own.captureWidth / own.captureHeight : null;
		if (!hasDeviceRatio(img.naturalWidth, img.naturalHeight, ratios, expected)) throw new Error(`Recapture ${spec.raw}: ${img.naturalWidth}×${img.naturalHeight} is not a configured device ratio`);
	}
	return locales;
}
/** Mark each frame portrait or landscape, and set its bezel and radius from its width. */
function sizeFrames(devices, config, layoutWords) {
	for (const d of devices) {
		const landscape = d.img.naturalWidth > d.img.naturalHeight;
		d.node.classList.add(landscape ? "device-landscape" : "device-portrait");
		const size = frameSize(config, d.frame, landscape, d.node.clientWidth, layoutWords);
		if (!size) continue;
		d.node.style.setProperty("--bezel", `${size.bezel}px`);
		d.node.style.setProperty("--radius", `${size.radius}px`);
	}
}
/** An element's box relative to the card. */
function relative(main, element) {
	const canvas = main.getBoundingClientRect(), r = element.getBoundingClientRect();
	return {
		left: r.left - canvas.left,
		top: r.top - canvas.top,
		width: r.width,
		height: r.height
	};
}
function measure(main, devices, locales) {
	return devices.map(({ spec, node, img }, i) => ({
		spec,
		node,
		img,
		locale: locales[i] ?? null,
		box: relative(main, node),
		screen: relative(main, node.querySelector(".screen"))
	}));
}
/**
* A device may carry a label (a before/after pair, say): a caption centred above the frame, styled by the theme.
* A theme can set it under its frame instead: transform: translateY(calc(var(--device-height) + 30px)), or under
* the card's tallest frame (--tallest-device), so a row of labels lines up.
*/
function labelDevices(main, measured) {
	const tallest = Math.max(...measured.map((d) => d.box.height));
	for (const { spec, box } of measured) {
		if (!spec.label) continue;
		const label = document.createElement("div");
		label.className = `device-label${spec.role ? ` ${spec.role}` : ""}`;
		label.dataset.checkBounds = "";
		const span = document.createElement("span");
		appendRuns(span, parseHighlight(spec.label));
		label.append(span);
		Object.assign(label.style, {
			left: `${box.left}px`,
			width: `${box.width}px`,
			top: `${box.top}px`
		});
		label.style.setProperty("--device-height", `${box.height}px`);
		label.style.setProperty("--tallest-device", `${tallest}px`);
		main.append(label);
	}
}
/**
* Fail when a device leaves the card further than its layout allows. A frame keeps `margin` px from the sides and
* top, shows at least `visible` of itself, and a landscape screen in a phone or tablet frame is never cut at the top
* or bottom, unless studio.json "bounds", a layout word or the card's own "bounds" says otherwise.
*/
function checkBounds(measured, slide, profile, config, layoutWords) {
	const rule = boundsFor(config, layoutWords, slide.bounds);
	if (!rule) return;
	for (const { box, spec } of measured) {
		const problem = boundsProblem(box, spec.frame || profile.frame || "phone", rule, profile.width, profile.height, spec.raw);
		if (problem) throw new Error(problem);
	}
}

// src/renderer/fit.ts
/** The box around the header's text itself, not its element. */
function textBox(header) {
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
}
/** Shrink the header's type in 2% steps until it fits; report.fit is the scale it settled on, 0 when nothing fits. */
async function fitCopy(main, header, size, minFit, report, refit) {
	const blocks = [...main.querySelectorAll(".device:not(.device-frame-none)")].map((n) => n.getBoundingClientRect());
	const fits = () => {
		if ([...header.querySelectorAll("h1 .line")].some((line) => line.scrollWidth > line.parentElement.clientWidth + 1)) return false;
		const t = textBox(header);
		if (t.l < -.5 || t.t < -.5 || t.r > size.W + .5 || t.b > size.H + .5) return false;
		return blocks.every((d) => t.b + 16 <= d.top || t.t >= d.bottom || t.r + 16 <= d.left || t.l >= d.right);
	};
	const sizes = [...header.querySelectorAll("h1, p")].map((el) => [el, parseFloat(getComputedStyle(el).fontSize)]);
	for (let s = 1; !fits() && s > minFit - .001; s -= .02) {
		report.fit = Math.round(s * 100) / 100;
		for (const [el, px] of sizes) el.style.fontSize = `${px * s}px`;
		await refit?.();
	}
	if (!fits()) report.fit = 0;
}
/** The last two words of each headline line or body whose last wrapped line is too short. */
function findWidows(header) {
	const widows = [];
	for (const el of header.querySelectorAll("h1 .line, p")) {
		const range = document.createRange();
		range.selectNodeContents(el);
		const lines = /* @__PURE__ */ new Map();
		for (const rect of range.getClientRects()) {
			if (!rect.width) continue;
			const top = Math.round(rect.top / 4), line = lines.get(top);
			lines.set(top, line ? {
				left: Math.min(line.left, rect.left),
				right: Math.max(line.right, rect.right)
			} : {
				left: rect.left,
				right: rect.right
			});
		}
		if (isWidow([...lines.entries()].sort(([a], [b]) => a - b).map(([, l]) => l.right - l.left))) widows.push(el.textContent.trim().split(/\s+/).slice(-2).join(" "));
	}
	return widows;
}

// src/renderer/identity.ts
async function identity(slide, config) {
	const spec = {
		icon: "brand/icon.png",
		name: config.app,
		...config.identity,
		...typeof slide.identity === "object" ? slide.identity : {}
	};
	const banner = document.createElement("div");
	banner.className = "identity";
	banner.dataset.checkBounds = "";
	if ((await fetch(`../${spec.icon}`, { method: "HEAD" })).ok) banner.append(Object.assign(document.createElement("img"), {
		src: `../${spec.icon}`,
		alt: ""
	}));
	banner.append(Object.assign(document.createElement("span"), { textContent: spec.name ?? "" }));
	if (slide.tagline) {
		const small = document.createElement("small");
		appendRuns(small, parseHighlight(slide.tagline));
		banner.append(small);
	}
	return banner;
}

// src/renderer/render.ts
const q = new URLSearchParams(location.search);
const root = document.documentElement;
if (q.get("strip")) root.dataset.strip = q.get("strip");
const { config, profiles, locale, defaultLocale, kind, profile, slides, index, slide, report, theme } = await loadCard(q);
const W = profile.width;
const H = profile.height;
const layoutWords = [
	kind,
	slide.feature,
	...(slide.layout || "").split(/\s+/).filter(Boolean)
];
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
const title = slide.identity ? null : headline(slide);
if (title) main.append(title);
main.setAttribute("aria-label", slide.alt || `${slide.feature}: ${plainHeadline(slide.title || "")}`);
const load = captureLoader(locale, defaultLocale, report);
const devices = createDevices(main, slide, profile, load);
if (slide.identity) main.append(await identity(slide, config));
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
	capture: devices[0]?.img
};
if (theme.art) art.innerHTML = theme.art(context) || "";
if (theme.compose) await theme.compose(context);
const locales = await settleDevices(devices, profiles);
report.fallbackCaptures = devices.filter((d) => report.fallbackCaptures.includes(d.spec.raw)).map((d) => d.spec.raw);
sizeFrames(devices, config, layoutWords);
if (theme.layout) await theme.layout(context);
if (Array.isArray(theme.depth) ? theme.depth.includes(kind) : theme.depth) await (await import(
	/* @vite-ignore */
	"./devices3d.js"
)).renderDevices(main);
const measured = context.devices = measure(main, devices, locales);
labelDevices(main, measured);
context.device = measured[0]?.box;
context.screen = measured[0]?.screen;
await drawCallouts(slide.callouts || [], {
	main,
	measured,
	screen: context.screen,
	defaultLocale,
	load,
	report
});
if (theme.decorate) await theme.decorate(context);
checkBounds(measured, slide, profile, config, layoutWords);
report.continuous = Array.isArray(theme.continuous) ? theme.continuous.includes(kind) : !!theme.continuous;
const header = main.querySelector("header");
if (header) {
	await fitCopy(main, header, {
		W,
		H
	}, config.minFit || .72, report, theme.refit && (() => theme.refit(context)));
	const widows = findWidows(header);
	if (widows.length) report.widows = widows;
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
