#!/usr/bin/env node
// Built from https://github.com/bernaferrari/screenshot-studio (src/). Edit the source, not this file.
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
let node_fs = require("node:fs");
node_fs = __toESM(node_fs, 1);
let node_path = require("node:path");
node_path = __toESM(node_path, 1);
let node_os = require("node:os");
node_os = __toESM(node_os, 1);
let node_http = require("node:http");
node_http = __toESM(node_http, 1);
let node_crypto = require("node:crypto");
let node_child_process = require("node:child_process");
let node_util = require("node:util");
let node_url = require("node:url");
let node_readline = require("node:readline");
node_readline = __toESM(node_readline, 1);
// src/core/validate.ts
/** Validate `value` against `schema`; an empty list means valid. */
function validate(value, schema, root = schema, path = "") {
	if (schema.$ref) {
		const name = schema.$ref.replace(/^#\/\$defs\//, "");
		const target = root.$defs?.[name];
		if (!target) return [{
			path,
			message: `unknown schema reference ${schema.$ref}`
		}];
		return validate(value, target, root, path);
	}
	const errors = [];
	const add = (message, at = path) => errors.push({
		path: at || "(top level)",
		message
	});
	if (schema.allOf) for (const part of schema.allOf) errors.push(...validate(value, part, root, path));
	if (schema.anyOf) {
		const attempts = schema.anyOf.map((option) => validate(value, option, root, path));
		if (!attempts.some((found) => found.length === 0)) {
			const sameType = schema.anyOf.map((option, i) => ({
				option,
				i
			})).filter(({ option }) => {
				const resolved = option.$ref ? root.$defs?.[option.$ref.replace(/^#\/\$defs\//, "")] ?? option : option;
				return (resolved.type ? Array.isArray(resolved.type) ? resolved.type : [resolved.type] : []).some((type) => matchesType(value, type));
			});
			if (sameType.length === 1) return [...errors, ...attempts[sameType[0].i]];
			const consts = schema.anyOf.filter((option) => "const" in option).map((option) => show(option.const));
			add(`${show(value)} isn't an allowed value${consts.length ? ` (allowed values include ${consts.join(", ")})` : ""}`);
			return errors;
		}
	}
	if ("const" in schema && value !== schema.const) add(`must be ${show(schema.const)}`);
	if (schema.enum && !schema.enum.includes(value)) add(`must be one of ${schema.enum.map(show).join(", ")}; got ${show(value)}`);
	if (schema.type) {
		const types = Array.isArray(schema.type) ? schema.type : [schema.type];
		if (!types.some((type) => matchesType(value, type))) {
			add(`must be ${types.join(" or ")}, not ${typeOf(value)}`);
			return errors;
		}
	}
	if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) add(`${show(value)} doesn't match the expected format (${schema.pattern})`);
	if (typeof value === "number") {
		if (schema.minimum !== void 0 && value < schema.minimum) add(`must be at least ${schema.minimum}`);
		if (schema.maximum !== void 0 && value > schema.maximum) add(`must be at most ${schema.maximum}`);
		if (schema.exclusiveMinimum !== void 0 && value <= schema.exclusiveMinimum) add(`must be more than ${schema.exclusiveMinimum}`);
	}
	if (Array.isArray(value)) {
		if (schema.minItems !== void 0 && value.length < schema.minItems) add(`needs at least ${schema.minItems} item(s)`);
		if (schema.items) value.forEach((item, i) => errors.push(...validate(item, schema.items, root, join(path, i))));
	}
	if (typeOf(value) === "object") {
		const object = value;
		for (const key of schema.required || []) if (!(key in object)) add(`is missing "${key}"`);
		for (const [key, item] of Object.entries(object)) {
			const own = schema.properties?.[key];
			if (own) errors.push(...validate(item, own, root, join(path, key)));
			else if (schema.additionalProperties === false) {
				const near = Object.keys(schema.properties || {}).find((name) => name.toLowerCase() === key.toLowerCase() || levenshtein(name, key) <= 2);
				add(`unknown setting "${key}"${near ? `; did you mean "${near}"?` : ""}`, join(path, key));
			} else if (typeof schema.additionalProperties === "object") errors.push(...validate(item, schema.additionalProperties, root, join(path, key)));
		}
	}
	return errors;
}
function levenshtein(a, b) {
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let previous = row[0]++;
		for (let j = 1; j <= b.length; j++) {
			const current = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
			previous = current;
		}
	}
	return row[b.length];
}
var typeOf, matchesType, join, show;
var init_validate = __esmMin((() => {
	typeOf = (value) => value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
	matchesType = (value, type) => {
		const actual = typeOf(value);
		return actual === type || type === "number" && actual === "integer";
	};
	join = (base, key) => typeof key === "number" ? `${base}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? base ? `${base}.${key}` : key : `${base}[${JSON.stringify(key)}]`;
	show = (value) => JSON.stringify(value)?.slice(0, 60) ?? String(value);
}));
// src/core/gallery.ts
var gallery_exports = /* @__PURE__ */ __exportAll({
	cardsFor: () => cardsFor,
	copyKeys: () => copyKeys,
	devicesFor: () => devicesFor,
	followCallout: () => followCallout,
	nodesFile: () => nodesFile,
	outputFile: () => outputFile,
	requiredCopyFields: () => requiredCopyFields,
	withCopy: () => withCopy,
	withoutMeta: () => withoutMeta
});
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
	const missing = Object.keys(base).filter((field) => !empty(base[field]) && (!(field in own) || empty(own[field])));
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
/** Every copy key a gallery file can use, in display order: shared card words first, then per-kind overrides. */
function copyKeys(galleries, defaultCopy = {}) {
	const features = [];
	for (const kind of Object.keys(galleries)) for (const card of cardsFor(galleries, kind)) if (!features.includes(card.feature)) features.push(card.feature);
	return [...features, ...Object.keys(defaultCopy).filter((k) => !features.includes(k))];
}
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
/** Nonempty reference fields read by the cards rendered in a locale. */
function requiredCopyFields(galleries, profiles, reference, locale, defaultLocale) {
	const fields = /* @__PURE__ */ new Map();
	for (const kind of Object.keys(galleries)) {
		if (locale !== defaultLocale && profiles[kind]?.defaultLocaleOnly) continue;
		for (const card of cardsFor(galleries, kind)) {
			const keys = card.sharedCopy === false ? [`${kind}/${card.feature}`] : [card.feature, `${kind}/${card.feature}`];
			const owners = /* @__PURE__ */ new Map();
			for (const key of keys) for (const field of Object.keys(reference[key] || {})) owners.set(field, key);
			for (const [field, key] of owners) if (reference[key]?.[field]?.trim()) fields.set(`${key}\0${field}`, {
				key,
				field
			});
		}
	}
	return [...fields.values()];
}
var devicesFor, outputFile, nodesFile;
var init_gallery = __esmMin((() => {
	devicesFor = (card) => card.devices || (card.raw ? [{
		raw: card.raw,
		...card.frame ? { frame: card.frame } : {}
	}] : []);
	outputFile = (kind, card, i) => card.file || `${kind}/${String(i + 1).padStart(2, "0")}-${card.feature}.jpg`;
	nodesFile = (raw) => raw.replace(/\.[a-z]+$/i, ".nodes.json");
}));
// src/node/project.ts
/** Finding and reading an app's store-listing folder: the one place every command loads it from. */
var project_exports = /* @__PURE__ */ __exportAll({
	STUDIO_DIR: () => STUDIO_DIR,
	findListing: () => findListing,
	loadListing: () => loadListing,
	readCopy: () => readCopy,
	readJson: () => readJson,
	requireListing: () => requireListing,
	writeJson: () => writeJson
});
/** Read a studio file (without its "$schema"), or `fallback` when it doesn't exist. Invalid JSON always throws. */
function readJson(file, fallback) {
	let text;
	try {
		text = node_fs.default.readFileSync(file, "utf8");
	} catch (error) {
		if (error.code === "ENOENT" && fallback !== void 0) return fallback;
		throw error;
	}
	try {
		return withoutMeta(JSON.parse(text));
	} catch (error) {
		throw new Error(`${file} is not valid JSON: ${error.message}`);
	}
}
function writeJson(file, value) {
	node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
	node_fs.default.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
/** Load studio.json, profiles.json and gallery.json, with errors that say which file to fix. */
function loadListing(listing) {
	if (!node_fs.default.existsSync(node_path.default.join(listing, "studio.json"))) throw new Error(`No studio.json in ${listing}. Run \`npx screenshot-studio init\` in the app first.`);
	const config = readJson(node_path.default.join(listing, "studio.json"));
	const profiles = readJson(node_path.default.join(listing, "profiles.json"));
	const galleries = readJson(node_path.default.join(listing, "gallery.json"));
	for (const kind of Object.keys(galleries)) if (!profiles[kind]) throw new Error(`gallery.json has a "${kind}" gallery but profiles.json has no "${kind}" profile.`);
	const defaultLocale = config.defaultLocale || "en-US";
	return {
		listing,
		repo: node_path.default.dirname(listing),
		config,
		profiles,
		galleries,
		defaultLocale,
		locales: config.locales || [defaultLocale]
	};
}
/**
* The store-listing folder for a command: an explicit path (an app folder or its store-listing), else the nearest
* store-listing/ at or above the working directory.
*/
function findListing(explicit, from = process.cwd()) {
	const resolve = (dir) => {
		if (node_fs.default.existsSync(node_path.default.join(dir, "studio.json"))) return dir;
		if (node_fs.default.existsSync(node_path.default.join(dir, "store-listing", "studio.json"))) return node_path.default.join(dir, "store-listing");
		return null;
	};
	if (explicit) return resolve(node_path.default.resolve(explicit));
	for (let dir = node_path.default.resolve(from);; dir = node_path.default.dirname(dir)) {
		const found = resolve(dir);
		if (found) return found;
		if (node_path.default.dirname(dir) === dir) return null;
	}
}
/** findListing, or an error that says how to get one. */
function requireListing(explicit) {
	const found = findListing(explicit);
	if (found) return found;
	throw new Error(explicit ? `No store-listing/studio.json in ${node_path.default.resolve(explicit)}.` : "No store-listing/studio.json here or in any folder above. Run this in your app, or set it up with `npx screenshot-studio init`.");
}
var readCopy, STUDIO_DIR;
var init_project = __esmMin((() => {
	init_gallery();
	readCopy = (listing, locale) => readJson(node_path.default.join(listing, locale, "copy.json"), {});
	STUDIO_DIR = __dirname;
}));
// src/core/stores.ts
/** Which store a listing is for: the App Store when its capture or galleries are iOS, Google Play otherwise. */
function storeFor(config, profiles) {
	return config.capture?.platform === "ios" || Object.values(profiles).some((profile) => profile.platform === "ios") ? "App Store" : "Google Play";
}
/** Whether a gallery's cards upload to the store: fastlane's screenshot folders when set, else Play's phone and tablets and the iOS galleries. */
function isStoreGallery(kind, profile, config) {
	if (profile.defaultLocaleOnly) return false;
	if (config.fastlane?.screenshots) return kind in config.fastlane.screenshots;
	return profile.platform === "ios" || [
		"phone",
		"tablet7",
		"tablet10"
	].includes(kind);
}
/** Fields of listing.json over the store's limits. `appName` counts as the title. */
function listingProblems(words, store) {
	const problems = [];
	for (const [field, max] of Object.entries(LIMITS[store])) {
		const value = field === "title" ? words.title ?? words.appName : words[field];
		const length = typeof value === "string" ? [...value].length : 0;
		if (length > max) problems.push({
			field,
			length,
			max,
			message: `${field} has ${length} characters; ${store} allows ${max}`
		});
	}
	return problems;
}
var LIMITS, SCREENSHOT_LIMIT;
var init_stores = __esmMin((() => {
	LIMITS = {
		"Google Play": {
			title: 30,
			shortDescription: 80,
			fullDescription: 4e3
		},
		"App Store": {
			title: 30,
			subtitle: 30,
			promotionalText: 170,
			keywords: 100,
			description: 4e3,
			whatsNew: 4e3
		}
	};
	SCREENSHOT_LIMIT = {
		"Google Play": 8,
		"App Store": 10
	};
}));
// src/node/check.ts
/**
* Check an app's listing without rendering anything: every file against its schema, then what schemas can't see
* (captures that are missing or have the wrong shape, cards without words, words no card uses, store text over
* Play's limits). Fast enough to run after every edit; `export` then checks the rendered result.
*   npx screenshot-studio check [--json]
*/
var check_exports = /* @__PURE__ */ __exportAll({
	checkListing: () => checkListing,
	formatIssues: () => formatIssues,
	imageSize: () => imageSize,
	run: () => run$11
});
/** Width and height of a PNG, JPEG or WebP, read from its header. */
function imageSize(file) {
	const fd = node_fs.default.openSync(file, "r");
	try {
		const head = Buffer.alloc(65536);
		const length = node_fs.default.readSync(fd, head, 0, head.length, 0);
		if (head.readUInt32BE(0) === 2303741511) return {
			width: head.readUInt32BE(16),
			height: head.readUInt32BE(20)
		};
		if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") for (let offset = 12; offset + 8 <= length;) {
			const type = head.toString("ascii", offset, offset + 4), size = head.readUInt32LE(offset + 4), data = offset + 8;
			if (data + Math.min(size, 10) > length) break;
			if (type === "VP8X" && size >= 10) return {
				width: 1 + head.readUIntLE(data + 4, 3),
				height: 1 + head.readUIntLE(data + 7, 3)
			};
			if (type === "VP8 " && size >= 10 && head[data + 3] === 157 && head[data + 4] === 1 && head[data + 5] === 42) return {
				width: head.readUInt16LE(data + 6) & 16383,
				height: head.readUInt16LE(data + 8) & 16383
			};
			if (type === "VP8L" && size >= 5 && head[data] === 47) {
				const bits = head.readUInt32LE(data + 1);
				return {
					width: (bits & 16383) + 1,
					height: (bits >>> 14 & 16383) + 1
				};
			}
			offset = data + size + size % 2;
		}
		if (head[0] === 255 && head[1] === 216) for (let i = 2; i + 9 < length;) {
			if (head[i] !== 255) {
				i++;
				continue;
			}
			const marker = head[i + 1];
			if (marker >= 192 && marker <= 207 && ![
				196,
				200,
				204
			].includes(marker)) return {
				height: head.readUInt16BE(i + 5),
				width: head.readUInt16BE(i + 7)
			};
			i += 2 + head.readUInt16BE(i + 2);
		}
		return null;
	} finally {
		node_fs.default.closeSync(fd);
	}
}
function checkListing(listingDir) {
	const listing = requireListing(listingDir);
	const schemas = node_path.default.join(STUDIO_DIR, "schemas");
	const issues = [];
	const error = (file, message, extra = {}) => issues.push({
		level: "error",
		file,
		message,
		...extra
	});
	const warn = (file, message, extra = {}) => issues.push({
		level: "warning",
		file,
		message,
		...extra
	});
	const counted = {
		galleries: 0,
		cards: 0,
		captures: 0,
		locales: 0
	};
	const load = (file, schema, fallback) => {
		const full = node_path.default.join(listing, file);
		if (!node_fs.default.existsSync(full)) {
			if (fallback !== void 0) return fallback;
			error(file, "is missing", { fix: "Run `npx screenshot-studio init` to create a starter listing." });
			return null;
		}
		let value;
		try {
			value = readJson(full);
		} catch (e) {
			error(file, e.message);
			return null;
		}
		const definition = readJson(node_path.default.join(schemas, `${schema}.schema.json`), null);
		const problems = definition ? validate(value, definition) : [];
		for (const problem of problems) error(file, problem.message, { path: problem.path });
		return problems.length ? null : value;
	};
	const config = load("studio.json", "studio");
	const profiles = load("profiles.json", "profiles");
	const galleries = load("gallery.json", "gallery");
	if (!config || !profiles || !galleries) return {
		ok: false,
		issues,
		counted
	};
	const defaultLocale = config.defaultLocale || "en-US";
	const store = storeFor(config, profiles);
	const locales = config.locales || [defaultLocale];
	counted.locales = locales.length;
	if (!locales.includes(defaultLocale)) error("studio.json", `defaultLocale ${defaultLocale} isn't in locales`, {
		path: "locales",
		fix: `Add "${defaultLocale}" to locales.`
	});
	for (const file of ["theme.css"]) if (!node_fs.default.existsSync(node_path.default.join(listing, file))) warn(file, "is missing; cards render unstyled");
	const ratios = Object.values(profiles).filter((p) => p.captureWidth && p.captureHeight).flatMap((p) => [p.captureWidth / p.captureHeight, p.captureHeight / p.captureWidth]);
	const defaultCopy = load(`${defaultLocale}/copy.json`, "copy", {}) || {};
	const resolvedGalleries = {};
	const used = /* @__PURE__ */ new Set();
	const checkedRaws = /* @__PURE__ */ new Set();
	for (const kind of Object.keys(galleries)) {
		if (!profiles[kind]) {
			error("gallery.json", `gallery "${kind}" has no profile`, {
				path: kind,
				fix: `Add "${kind}" to profiles.json with its width and height.`
			});
			continue;
		}
		let cards;
		try {
			cards = cardsFor(galleries, kind);
		} catch (e) {
			error("gallery.json", e.message, { path: kind });
			continue;
		}
		resolvedGalleries[kind] = cards;
		counted.galleries++;
		if (isStoreGallery(kind, profiles[kind], config) && cards.length > SCREENSHOT_LIMIT[store]) warn("gallery.json", `"${kind}" has ${cards.length} cards; ${store} takes at most ${SCREENSHOT_LIMIT[store]} per device type`, {
			path: kind,
			code: "store-limit",
			fix: `Keep the best ${SCREENSHOT_LIMIT[store]}: lead with the screen that sells the app, and cut the rest from gallery.json.`
		});
		cards.forEach((card, i) => {
			counted.cards++;
			const at = `${kind}[${i}]`;
			used.add(card.feature).add(`${kind}/${card.feature}`);
			const devices = devicesFor(card);
			for (const [d, device] of devices.entries()) {
				const raw = node_path.default.join(listing, defaultLocale, "raw", device.raw);
				if (checkedRaws.has(raw)) continue;
				checkedRaws.add(raw);
				counted.captures++;
				if (!node_fs.default.existsSync(raw)) {
					error("gallery.json", `capture ${defaultLocale}/raw/${device.raw} doesn't exist`, {
						path: devices.length > 1 ? `${at}.devices[${d}].raw` : `${at}.raw`,
						fix: "Capture it (`npx screenshot-studio recapture`), add the file, or fix the path."
					});
					continue;
				}
				const size = imageSize(raw);
				if (size && ratios.length && !ratios.some((r) => Math.abs(size.width / size.height - r) < .001)) error("gallery.json", `${device.raw} is ${size.width}×${size.height}, which isn't the shape of any capture size in profiles.json`, {
					path: `${at}.raw`,
					fix: "Recapture it at a configured size, or add a profile whose captureWidth × captureHeight has this shape."
				});
			}
			for (const [c, callout] of (card.callouts || []).entries()) {
				if (!callout.raw && (callout.device || 0) >= devices.length) error("gallery.json", `callout ${c} points at device ${callout.device || 0}, but the card has ${devices.length}`, { path: `${at}.callouts[${c}]` });
				if (callout.raw && !node_fs.default.existsSync(node_path.default.join(listing, defaultLocale, "raw", callout.raw))) error("gallery.json", `callout capture ${callout.raw} doesn't exist`, { path: `${at}.callouts[${c}].raw` });
			}
			const words = card.sharedCopy === false ? defaultCopy[`${kind}/${card.feature}`] : {
				...defaultCopy[card.feature],
				...defaultCopy[`${kind}/${card.feature}`]
			};
			if (devices.length && !card.identity && !(words && "title" in words) && profiles[kind].frame !== "none") warn(`${defaultLocale}/copy.json`, `card "${card.feature}" (${kind}) has no headline`, { fix: `Add {"${card.feature}": {"title": "…", "body": "…"}}.` });
		});
	}
	const PLACEHOLDER = /^Your headline|One short (supporting )?line|Why it matters, briefly|One line about what \*your app\*|^One clear\n|^The core\n|Up to (80|4,?000) characters/;
	for (const [key, entry] of Object.entries(defaultCopy)) for (const [field, value] of Object.entries(entry || {})) if (typeof value === "string" && PLACEHOLDER.test(value)) warn(`${defaultLocale}/copy.json`, `is still the starter placeholder`, {
		path: `${key}.${field}`,
		code: "placeholder",
		fix: field === "title" ? "Write a benefit headline for this screen: what it does for the person, in a few words." : "Write one short line that backs the headline up."
	});
	for (const locale of locales) {
		const words = load(`${locale}/listing.json`, "listing", null);
		for (const [field, value] of Object.entries(words || {})) if (typeof value === "string" && PLACEHOLDER.test(value)) warn(`${locale}/listing.json`, `is still the starter placeholder`, {
			path: field,
			code: "placeholder",
			fix: "Write the store text."
		});
	}
	for (const key of Object.keys(defaultCopy)) if (!used.has(key)) warn(`${defaultLocale}/copy.json`, `"${key}" isn't used by any card`, {
		path: key,
		fix: "Remove it, or fix the card's feature name."
	});
	for (const locale of locales) {
		if (locale !== defaultLocale) {
			const file = `${locale}/copy.json`;
			if (!node_fs.default.existsSync(node_path.default.join(listing, file))) warn(file, "is missing; this language shows the default words", { fix: `Run \`npx screenshot-studio locales --init ${locale}\`.` });
			else {
				const copy = load(file, "copy") || {};
				const missing = requiredCopyFields(resolvedGalleries, profiles, defaultCopy, locale, defaultLocale).filter(({ key, field }) => !copy[key]?.[field]?.trim()).map(({ key, field }) => `${key}.${field}`);
				if (missing.length) warn(file, `${missing.length} field(s) not translated yet; those cards show ${defaultLocale} words: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`, {
					code: "untranslated",
					fix: `Translate each empty field from ${defaultLocale}/copy.json, keeping its *highlight* and line breaks.`
				});
			}
		}
		const words = load(`${locale}/listing.json`, "listing", null);
		for (const problem of words ? listingProblems(words, store) : []) error(`${locale}/listing.json`, problem.message, { path: problem.field });
	}
	return {
		ok: !issues.some((issue) => issue.level === "error"),
		issues,
		counted
	};
}
function formatIssues(result) {
	const { counted, issues } = result;
	const lines = issues.map((issue) => `${issue.level === "error" ? "✗" : "!"} ${issue.file}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}${issue.fix ? `\n    → ${issue.fix}` : ""}`);
	const errors = issues.filter((i) => i.level === "error").length, warnings = issues.length - errors;
	lines.push(`${lines.length ? "\n" : ""}${counted.galleries} galleries, ${counted.cards} cards, ${counted.captures} captures, ${counted.locales} language(s): ` + (issues.length ? `${errors} error(s), ${warnings} warning(s)` : "all good"));
	return lines.join("\n");
}
/** `check [--json]` */
async function run$11(argv) {
	const at = argv.indexOf("--listing");
	const result = checkListing(at >= 0 ? argv[at + 1] : void 0);
	console.log(argv.includes("--json") ? JSON.stringify(result, null, 2) : formatIssues(result));
	return result.ok ? 0 : 1;
}
var init_check = __esmMin((() => {
	init_validate();
	init_gallery();
	init_project();
	init_stores();
}));
// src/node/workspace/store.ts
/** Local project registration and coverage. It never modifies a connected project's files. */
/** A path under the home folder as ~/…, the way people read their own folders. */
function displayPath(file) {
	const home = node_os.default.homedir();
	for (const root of [home, (() => {
		try {
			return node_fs.default.realpathSync(home);
		} catch {
			return home;
		}
	})()]) if (inside(root, file)) return node_path.default.join("~", node_path.default.relative(root, file));
	return file;
}
function folder(input) {
	if (typeof input !== "string" || !input.trim()) throw statusError("Choose a project folder.");
	let expanded = input.trim().replace(/^~(?=$|[\\/])/, node_os.default.homedir());
	let root;
	try {
		root = node_fs.default.realpathSync(node_path.default.resolve(expanded));
		if (!node_fs.default.statSync(root).isDirectory()) throw Error();
	} catch {
		throw statusError("That folder could not be opened. Check the path and try again.");
	}
	if (node_path.default.basename(root) === "store-listing" && exists(node_path.default.join(root, "studio.json"))) root = node_path.default.dirname(root);
	return root;
}
function imageFiles(root, limit = 2e3) {
	const starts = MARKERS.map((marker) => node_path.default.join(root, marker)).filter((file) => {
		try {
			return node_fs.default.statSync(file).isDirectory();
		} catch {
			return false;
		}
	});
	if (!starts.length) starts.push(root);
	const seen = /* @__PURE__ */ new Set(), files = [], queue = starts.map((dir) => ({
		dir,
		depth: 0
	}));
	let visited = 0;
	while (queue.length && files.length < limit && visited++ < 1500) {
		const { dir, depth } = queue.shift();
		let entries;
		try {
			entries = node_fs.default.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") || SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
			const file = node_path.default.join(dir, entry.name);
			if (entry.isDirectory() && depth < 5) queue.push({
				dir: file,
				depth: depth + 1
			});
			else if (entry.isFile() && IMAGE$1.test(entry.name) && !seen.has(file)) {
				seen.add(file);
				const stat = node_fs.default.statSync(file);
				files.push({
					file: node_path.default.relative(root, file).split(node_path.default.sep).join("/"),
					bytes: stat.size,
					modified: stat.mtimeMs
				});
				if (files.length >= limit) break;
			}
		}
	}
	files.sort((a, b) => b.modified - a.modified || a.file.localeCompare(b.file));
	return {
		files,
		truncated: files.length >= limit || queue.length > 0
	};
}
function createWorkspaceStore({ registryFile = process.env.SCREENSHOT_STUDIO_PROJECTS || node_path.default.join(node_os.default.homedir(), ".screenshot-studio", "projects.json") } = {}) {
	const registry = () => {
		const value = readJson(registryFile, {
			version: 1,
			projects: []
		});
		if (!Array.isArray(value.projects)) throw statusError("The workspace project list is invalid.", 500);
		return value;
	};
	const save = (value) => {
		node_fs.default.mkdirSync(node_path.default.dirname(registryFile), {
			recursive: true,
			mode: 448
		});
		const temporary = `${registryFile}.${(0, node_crypto.randomUUID)()}.tmp`;
		try {
			node_fs.default.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 384 });
			node_fs.default.renameSync(temporary, registryFile);
		} finally {
			if (node_fs.default.existsSync(temporary)) node_fs.default.unlinkSync(temporary);
		}
	};
	async function change(update) {
		node_fs.default.mkdirSync(node_path.default.dirname(registryFile), {
			recursive: true,
			mode: 448
		});
		const lock = `${registryFile}.lock`, deadline = Date.now() + 4e3;
		let acquired = false;
		while (!acquired) try {
			const descriptor = node_fs.default.openSync(lock, "wx", 384);
			node_fs.default.writeFileSync(descriptor, String(process.pid));
			node_fs.default.closeSync(descriptor);
			acquired = true;
		} catch (error) {
			if (errorCode(error) !== "EEXIST") throw error;
			try {
				const owner = Number(node_fs.default.readFileSync(lock, "utf8"));
				try {
					if (owner) process.kill(owner, 0);
				} catch (failure) {
					if (errorCode(failure) === "ESRCH") {
						node_fs.default.unlinkSync(lock);
						continue;
					}
				}
				if (Date.now() - node_fs.default.statSync(lock).mtimeMs > 3e4) {
					node_fs.default.unlinkSync(lock);
					continue;
				}
			} catch (failure) {
				if (errorCode(failure) === "ENOENT") continue;
			}
			if (Date.now() > deadline) throw statusError("Another studio is updating the project list. Try again.", 409);
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		try {
			const value = registry();
			const result = update(value);
			save(value);
			return result;
		} finally {
			node_fs.default.unlinkSync(lock);
		}
	}
	const get = (id) => registry().projects.find((project) => project.id === id);
	async function add(inputs) {
		if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) throw statusError("Choose between 1 and 100 project folders.");
		const entries = inputs.map((input) => typeof input === "string" ? {
			root: folder(input),
			name: ""
		} : {
			root: folder(input.root),
			name: typeof input.name === "string" ? input.name.trim().slice(0, 100) : ""
		});
		return change((value) => entries.map((entry) => {
			const existing = value.projects.find((project) => project.root === entry.root);
			if (existing) return existing;
			const project = {
				id: (0, node_crypto.randomUUID)(),
				root: entry.root,
				...entry.name ? { name: entry.name } : {},
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			};
			value.projects.push(project);
			return project;
		}));
	}
	async function update(id, input) {
		const root = folder(input.root);
		return change((value) => {
			const project = value.projects.find((item) => item.id === id);
			if (!project) throw statusError("This project is no longer connected.", 404);
			if (value.projects.some((item) => item.id !== id && item.root === root)) throw statusError("That folder is already connected.", 409);
			project.root = root;
			if (typeof input.name === "string") project.name = input.name.trim().slice(0, 100);
			return project;
		});
	}
	async function remove(id) {
		return change((value) => {
			const index = value.projects.findIndex((project) => project.id === id);
			if (index < 0) throw statusError("This project is no longer connected.", 404);
			return value.projects.splice(index, 1)[0];
		});
	}
	async function summarize(project) {
		const base = {
			...project,
			name: project.name || node_path.default.basename(project.root),
			displayRoot: displayPath(project.root),
			editorURL: `/p/${project.id}/store-listing/studio/`,
			overviewURL: `/studio/?project=${project.id}`,
			previews: []
		};
		try {
			if (!node_fs.default.existsSync(project.root)) return {
				...base,
				kind: "unavailable",
				problem: "The project folder is unavailable. Reconnect it or remove it from the overview."
			};
			const listing = node_path.default.join(project.root, "store-listing");
			if (!exists(node_path.default.join(listing, "studio.json"))) {
				const library = imageFiles(project.root);
				return {
					...base,
					kind: "library",
					imageCount: library.files.length,
					truncated: library.truncated,
					previews: library.files.slice(0, 4).map((image) => ({
						url: assetURL(project.id, image.file),
						source: "capture",
						feature: node_path.default.basename(image.file)
					}))
				};
			}
			const config = readJson(node_path.default.join(listing, "studio.json")), profiles = readJson(node_path.default.join(listing, "profiles.json")), layout = readJson(node_path.default.join(listing, "gallery.json"));
			const { cardsFor, devicesFor, nodesFile, outputFile, requiredCopyFields } = await Promise.resolve().then(() => (init_gallery(), gallery_exports));
			const reference = config.defaultLocale || "en-US", languages = config.locales || [reference];
			if (!languages.length || languages.some((locale) => !localePattern.test(locale))) throw Error("studio.json has an invalid language list.");
			const copy = readJson(node_path.default.join(listing, reference, "copy.json"), {});
			const fieldsFor = (locale) => requiredCopyFields(layout, profiles, copy, locale, reference);
			const raws = /* @__PURE__ */ new Set(), outputs = [], galleries = [];
			const requiredRaws = (card) => [...devicesFor(card).map((d) => d.raw), ...(card.callouts || []).map((c) => c.raw).filter((raw) => Boolean(raw))];
			const mappedRaws = (card) => (card.callouts || []).map((c) => c.raw || devicesFor(card)[c.device || 0]?.raw).filter((raw) => Boolean(raw));
			for (const kind of Object.keys(layout)) {
				if (!profiles[kind]) throw Error(`profiles.json is missing ${kind}.`);
				const cards = cardsFor(layout, kind);
				galleries.push({
					kind,
					label: profiles[kind].label || kind,
					cards: cards.length,
					width: profiles[kind].width,
					height: profiles[kind].height
				});
				for (const [index, card] of cards.entries()) {
					outputs.push({
						kind,
						feature: card.feature,
						file: outputFile(kind, card, index),
						width: profiles[kind].width,
						height: profiles[kind].height,
						defaultLocaleOnly: profiles[kind].defaultLocaleOnly,
						raws: requiredRaws(card),
						mapped: mappedRaws(card)
					});
					requiredRaws(card).forEach((raw) => raws.add(raw));
				}
			}
			const locales = [], totals = {
				fields: 0,
				translated: 0,
				captures: 0,
				expectedCaptures: 0,
				layouts: 0,
				expectedLayouts: 0,
				exports: 0,
				expectedExports: 0
			};
			let lastExport = 0;
			const fileIn = (...parts) => {
				const file = node_path.default.resolve(listing, ...parts);
				return inside(project.root, file) ? file : null;
			};
			for (const locale of languages) {
				const requiredOutputs = outputs.filter((o) => locale === reference || !o.defaultLocaleOnly);
				const raws = new Set(requiredOutputs.flatMap((o) => o.raws));
				const own = readJson(node_path.default.join(listing, locale, "copy.json"), {});
				const fields = fieldsFor(locale);
				const translated = fields.filter(({ key, field }) => {
					const text = own?.[key]?.[field];
					return typeof text === "string" && text.trim();
				}).length;
				const captures = [...raws].filter((raw) => {
					const file = fileIn(locale, "raw", raw);
					return file && exists(file);
				}).length;
				const mapped = new Set(requiredOutputs.flatMap((o) => o.mapped));
				const layouts = [...mapped].filter((raw) => {
					const file = fileIn(locale, "raw", nodesFile(raw));
					return file && exists(file);
				}).length;
				let exported = 0;
				for (const output of requiredOutputs) {
					const file = fileIn(locale, output.file);
					if (!file || !exists(file)) continue;
					exported++;
					lastExport = Math.max(lastExport, node_fs.default.statSync(file).mtimeMs);
					if (locale === reference && base.previews.length < 4 && output.kind !== "icon" && output.kind !== "feature") base.previews.push({
						...output,
						source: "export",
						url: assetURL(project.id, node_path.default.relative(project.root, file))
					});
				}
				const complete = requiredOutputs.length > 0 && translated === fields.length && captures === raws.size && layouts === mapped.size && exported === requiredOutputs.length;
				const next = translated < fields.length ? "copy" : captures < raws.size ? "capture" : layouts < mapped.size ? "layout" : exported < requiredOutputs.length ? "export" : requiredOutputs.length ? "review" : "cards";
				locales.push({
					locale,
					translated,
					fields: fields.length,
					captures,
					expectedCaptures: raws.size,
					layouts,
					expectedLayouts: mapped.size,
					exports: exported,
					expectedExports: requiredOutputs.length,
					complete,
					next
				});
				totals.fields += fields.length;
				totals.translated += translated;
				totals.captures += captures;
				totals.expectedCaptures += raws.size;
				totals.layouts += layouts;
				totals.expectedLayouts += mapped.size;
				totals.exports += exported;
				totals.expectedExports += requiredOutputs.length;
			}
			if (!base.previews.length) for (const raw of [...raws].slice(0, 4)) {
				const file = fileIn(reference, "raw", raw);
				if (file && exists(file)) base.previews.push({
					source: "capture",
					feature: node_path.default.basename(raw),
					url: assetURL(project.id, node_path.default.relative(project.root, file))
				});
			}
			const icon = node_path.default.join(listing, reference, "graphics/app-icon.png");
			return {
				...base,
				name: project.name || config.app || base.name,
				kind: "studio",
				reference,
				locales,
				galleries,
				totals,
				cardCount: outputs.length,
				completeLocales: locales.filter((locale) => locale.complete).length,
				lastExport: lastExport || null,
				...exists(icon) ? { icon: assetURL(project.id, node_path.default.relative(project.root, icon)) } : {}
			};
		} catch (error) {
			return {
				...base,
				kind: "invalid",
				problem: `The Studio listing needs attention: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	async function list() {
		return Promise.all(registry().projects.map(summarize));
	}
	async function discover(input) {
		const root = folder(input), found = [], seen = /* @__PURE__ */ new Set(), registered = registry().projects;
		const queue = [{
			dir: root,
			depth: 0
		}];
		let visited = 0;
		while (queue.length && visited < 2e3) {
			const { dir, depth } = queue.shift();
			visited++;
			let entries;
			try {
				entries = await node_fs.default.promises.readdir(dir, { withFileTypes: true });
			} catch {
				continue;
			}
			const studio = exists(node_path.default.join(dir, "store-listing/studio.json"));
			const markers = MARKERS.some((marker) => {
				try {
					return node_fs.default.statSync(node_path.default.join(dir, marker)).isDirectory();
				} catch {
					return false;
				}
			});
			if (studio || markers || depth > 0 && /screenshots?/i.test(node_path.default.basename(dir)) && entries.some((entry) => entry.isFile() && IMAGE$1.test(entry.name))) {
				const canonical = node_fs.default.realpathSync(dir);
				if (!seen.has(canonical)) {
					seen.add(canonical);
					let name = node_path.default.basename(canonical);
					if (studio) try {
						name = readJson(node_path.default.join(dir, "store-listing/studio.json")).app || name;
					} catch {}
					found.push({
						root: canonical,
						name,
						kind: studio ? "studio" : "library",
						registeredId: registered.find((project) => project.root === canonical)?.id || null
					});
				}
				continue;
			}
			if (depth >= 4) continue;
			for (const entry of entries) if (entry.isDirectory() && !entry.name.startsWith(".") && !SKIP.has(entry.name)) queue.push({
				dir: node_path.default.join(dir, entry.name),
				depth: depth + 1
			});
		}
		return {
			root,
			projects: found.sort((a, b) => a.name.localeCompare(b.name)),
			visited,
			truncated: queue.length > 0
		};
	}
	return {
		registryFile,
		get,
		list,
		add,
		update,
		remove,
		discover,
		library(id) {
			const project = get(id);
			if (!project) throw statusError("Project not found.", 404);
			return imageFiles(project.root);
		}
	};
}
var SKIP, MARKERS, IMAGE$1, errorCode, localePattern, exists, inside, statusError, assetURL;
var init_store = __esmMin((() => {
	init_project();
	SKIP = /* @__PURE__ */ new Set([
		"node_modules",
		"build",
		"dist",
		"target",
		"vendor",
		"Pods",
		"coverage",
		"generated",
		"out",
		"venv"
	]);
	MARKERS = [
		"screenshots",
		"docs/screenshots",
		"store-listing",
		"fastlane/metadata"
	];
	IMAGE$1 = /\.(png|jpe?g|webp)$/i;
	errorCode = (error) => error && typeof error === "object" && "code" in error ? String(error.code) : void 0;
	localePattern = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
	exists = (file) => {
		try {
			return node_fs.default.statSync(file).isFile();
		} catch {
			return false;
		}
	};
	inside = (root, file) => {
		const relative = node_path.default.relative(root, file);
		return relative === "" || !relative.startsWith(`..${node_path.default.sep}`) && relative !== ".." && !node_path.default.isAbsolute(relative);
	};
	statusError = (message, status = 400) => Object.assign(new Error(message), { status });
	assetURL = (id, relative) => `/p/${id}/${relative.split(node_path.default.sep).map(encodeURIComponent).join("/")}`;
}));
// src/node/workspace/events.ts
/**
* Live reload: one recursive watcher per project's store-listing/, shared by every editor tab that listens, and a
* Server-Sent Events stream that tells those tabs which files changed. Edits arrive in bursts (an agent rewriting
* theme.css, an exporter writing a language), so changes are collected for a moment and sent together.
*/
/**
* Whether a change matters to the editor. The studio copy (studio/) and export outputs (rendered cards, contact
* sheets, README strips) are written by the studio itself; the exporter's manifests (assets.json,
* export-report.json) still count, so export notes refresh when an export finishes.
*/
function relevantChange(file) {
	const parts = file.split("/");
	const name = parts.at(-1) || "";
	if (!name || parts[0] === "studio" || parts.some((part) => part.startsWith(".") || part === "node_modules")) return false;
	if (/(~|\.tmp|\.swp|\.crdownload)$/i.test(name)) return false;
	if (IMAGE.test(name)) return !(LOCALE$1.test(parts[0]) && parts[1] !== "raw");
	return true;
}
/**
* Call `listener` with the files that changed under `listing`, `delay` ms after the last change of a burst.
* Returns a function that stops listening; the watcher closes with its last listener.
*/
function watchListing(listing, listener, delay = 120) {
	listing = node_path.default.resolve(listing);
	let watch = watches.get(listing);
	if (!watch) {
		const listeners = /* @__PURE__ */ new Set(), pending = /* @__PURE__ */ new Set();
		let timer = null;
		const flush = () => {
			timer = null;
			const files = [...pending].sort();
			pending.clear();
			if (files.length) for (const notify of listeners) notify({ files });
		};
		let watcher = null;
		try {
			watcher = node_fs.default.watch(listing, { recursive: true }, (_event, name) => {
				if (!name) return;
				const file = String(name).split(node_path.default.sep).join("/");
				if (!relevantChange(file)) return;
				try {
					if (node_fs.default.statSync(node_path.default.join(listing, file)).isDirectory()) return;
				} catch {}
				pending.add(file);
				if (timer) clearTimeout(timer);
				timer = setTimeout(flush, delay);
			});
			watcher.on("error", () => {
				watcher?.close();
				watcher = null;
			});
			watcher.unref();
		} catch {
			watcher = null;
		}
		const current = {
			listeners,
			close() {
				if (timer) clearTimeout(timer);
				watcher?.close();
				watches.delete(listing);
			}
		};
		watches.set(listing, current);
		watch = current;
	}
	const own = watch;
	own.listeners.add(listener);
	return () => {
		own.listeners.delete(listener);
		if (!own.listeners.size) own.close();
	};
}
/** Answer with a Server-Sent Events stream of `change` events for one listing, until the client disconnects. */
function streamListingChanges(request, response, listing) {
	response.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-store",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no"
	});
	response.write(`retry: 1500\nevent: ready\ndata: {}\n\n`);
	const stop = watchListing(listing, (change) => {
		response.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
	});
	const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 25e3);
	heartbeat.unref();
	let ended = false;
	const end = () => {
		if (ended) return;
		ended = true;
		clearInterval(heartbeat);
		stop();
	};
	request.on("close", end);
	response.on("close", end);
}
var IMAGE, LOCALE$1, watches;
var init_events = __esmMin((() => {
	IMAGE = /\.(png|jpe?g|webp)$/i;
	LOCALE$1 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
	watches = /* @__PURE__ */ new Map();
}));
// src/node/workspace/review.ts
/**
* The review queue: everything in a listing that needs fixing, in one list. It joins the fast file check
* (checkListing) with what the last export noticed: per-card notes from <locale>/assets.json and the warnings and
* error in export-report.json. Each issue says which card it concerns when that can be known, so the editor can link
* to it.
*/
/** A JSON file the studio writes, or null when it is missing or unreadable. */
function optionalJson(file) {
	try {
		return readJson(file, null);
	} catch {
		return null;
	}
}
/** Everything to fix in the listing at `listing` (a store-listing folder). */
function reviewListing(listing) {
	listing = node_path.default.resolve(listing);
	const check = checkListing(listing);
	const issues = [];
	const galleries = optionalJson(node_path.default.join(listing, "gallery.json")) || {};
	const config = optionalJson(node_path.default.join(listing, "studio.json")) || {};
	const reference = config.defaultLocale || "en-US";
	const cards = (kind) => {
		try {
			return galleries[kind] ? cardsFor(galleries, kind) : [];
		} catch {
			return [];
		}
	};
	const card = (kind, index) => {
		const found = cards(kind)[index];
		return found ? {
			kind,
			index,
			feature: found.feature
		} : void 0;
	};
	const byFeature = (kind, feature) => {
		const index = cards(kind).findIndex((c) => c.feature === feature);
		return index < 0 ? void 0 : {
			kind,
			index,
			feature
		};
	};
	check.issues.forEach((issue, n) => {
		let concerns;
		const at = issue.file === "gallery.json" && issue.path?.match(/^([A-Za-z0-9_-]+)\[(\d+)\]/);
		if (at) concerns = card(at[1], Number(at[2]));
		const named = issue.message.match(/card "([^"]+)" \(([^)]+)\)/);
		if (!concerns && named) concerns = byFeature(named[2], named[1]);
		const locale = issue.file.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\//)?.[1];
		issues.push({
			id: `check-${n}`,
			source: "check",
			level: issue.level,
			file: issue.file,
			...issue.path ? { path: issue.path } : {},
			message: issue.message,
			...issue.fix ? { fix: issue.fix } : {},
			...concerns ? { card: concerns } : {},
			...locale ? { locale } : {}
		});
	});
	for (const locale of config.locales || [reference]) {
		const manifest = optionalJson(node_path.default.join(listing, locale, "assets.json"));
		for (const [kind, entries] of Object.entries(manifest?.galleries || {})) for (const entry of entries) for (const [n, note] of (entry.notes || []).entries()) {
			const { level, fix } = noteFix(note, reference);
			issues.push({
				id: `notes-${locale}-${kind}-${entry.slide}-${n}`,
				source: "export",
				level,
				file: `${locale}/${entry.file}`,
				message: note,
				...fix ? { fix } : {},
				locale,
				card: card(kind, entry.slide) || {
					kind,
					index: entry.slide,
					feature: entry.feature
				}
			});
		}
	}
	const report = optionalJson(node_path.default.join(listing, "export-report.json"));
	if (report) {
		if (report.error) issues.push({
			id: "export-error",
			source: "export",
			level: "error",
			file: "",
			message: report.error,
			fix: "Fix what it names, then export again (`npx screenshot-studio export`)."
		});
		(report.warnings || []).forEach((warning, n) => {
			const seam = warning.match(/^([^/]+)\/([^:]+): the background breaks at the seam between cards (\d+) and (\d+)/);
			const stale = warning.match(/^(.+) is no longer in the gallery; delete it$/);
			const limit = warning.match(/^(\S+\/listing\.json) (\w+) has/);
			const output = warning.match(/^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\/(\S+?\.(?:jpe?g|png|webp)): /);
			const byOutput = output ? Object.keys(galleries).flatMap((kind) => cards(kind).map((c, i) => ({
				kind,
				i,
				file: outputFile(kind, c, i)
			}))).find((o) => o.file === output[2]) : void 0;
			const base = {
				id: `export-warning-${n}`,
				source: "export",
				level: "warning",
				message: warning
			};
			if (seam) issues.push({
				...base,
				file: "theme.js",
				locale: seam[1],
				card: card(seam[2], Number(seam[3]) - 1),
				fix: "Draw the background in panorama coordinates (studio/shapes.js) so it continues from one card into the next."
			});
			else if (stale) issues.push({
				...base,
				file: stale[1],
				fix: "Delete the file; no card writes it any more."
			});
			else if (limit) issues.push({
				...base,
				file: limit[1],
				path: limit[2],
				fix: "Shorten it to fit Play's limit."
			});
			else if (output) issues.push({
				...base,
				message: warning.slice(output[0].length),
				file: `${output[1]}/${output[2]}`,
				locale: output[1],
				...byOutput ? { card: card(byOutput.kind, byOutput.i) } : {},
				.../short last line/.test(warning) ? { fix: "Reword or shorten the words so the last line isn't a lone word or two." } : {}
			});
			else issues.push({
				...base,
				file: ""
			});
		});
	}
	const rank = {
		error: 0,
		warning: 1,
		info: 2
	};
	issues.sort((a, b) => rank[a.level] - rank[b.level]);
	return {
		checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
		check: {
			ok: check.ok,
			counted: check.counted
		},
		lastExport: report ? {
			finishedAt: report.finishedAt || node_fs.default.statSync(node_path.default.join(listing, "export-report.json")).mtime.toISOString(),
			ok: report.ok,
			...report.error ? { error: report.error } : {},
			cards: report.cards?.length || 0,
			locales: (report.locales || []).map((tally) => tally.locale),
			...report.options ? { options: report.options } : {}
		} : null,
		issues
	};
}
var noteFix;
var init_review = __esmMin((() => {
	init_gallery();
	init_check();
	init_project();
	noteFix = (note, reference) => note.startsWith("untranslated") ? {
		level: "warning",
		fix: "Translate these words in Languages, or in the card inspector."
	} : note.startsWith(`${reference} capture`) ? {
		level: "warning",
		fix: "Capture this language (`npx screenshot-studio recapture`) so the card shows its own screen."
	} : note.startsWith("callout") ? {
		level: "warning",
		fix: "The callout's UI element wasn't found in this language. Pick the callout again on an element both languages share."
	} : note.startsWith("copy shrunk") ? {
		level: "info",
		fix: "Shorter words keep the headline at full size."
	} : {
		level: "warning",
		fix: ""
	};
}));
// src/node/workspace/routes.ts
/** Workspace HTTP routes. Project files stay under their registered repository root. */
async function pickFolder() {
	if (process.platform !== "darwin") throw statusError("Use the folder path field on this computer.", 501);
	try {
		const { stdout } = await execute("osascript", ["-e", "POSIX path of (choose folder with prompt \"Choose a Screenshot Studio project folder\")"], { timeout: 12e4 });
		return stdout.trim();
	} catch (error) {
		if (String(error.stderr).includes("-128")) return null;
		throw statusError("The folder chooser could not open. Enter the folder path instead.");
	}
}
function workspaceRoutes({ store, uiDirectory, activeProjectId = null, selectFolder = pickFolder }) {
	return async (request, response, pathname, serveFile) => {
		if (pathname.startsWith("/api/")) try {
			const host = request.headers.host || "";
			if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw statusError("Use the local Studio address.", 403);
			if (request.method !== "GET" && request.headers.origin && request.headers.origin !== `http://${host}`) throw statusError("This request must come from the local studio.", 403);
			if (pathname === "/api/workspace" && request.method === "GET") {
				const documents = node_path.default.join(node_os.default.homedir(), "Documents");
				return send(response, {
					projects: await store.list(),
					activeProjectId,
					defaultSearchRoot: node_fs.default.existsSync(documents) ? documents : node_os.default.homedir(),
					capabilities: {
						folderPicker: process.platform === "darwin",
						revealFolder: [
							"darwin",
							"win32",
							"linux"
						].includes(process.platform)
					}
				}), true;
			}
			if (pathname === "/api/projects" && request.method === "POST") {
				const input = await body(request);
				const projects = await store.add([{
					root: input.root,
					name: input.name
				}]);
				return send(response, {
					projects: await store.list(),
					added: projects.map((project) => project.id)
				}, 201), true;
			}
			if (pathname === "/api/projects/import" && request.method === "POST") {
				const input = await body(request);
				const projects = await store.add(input.roots);
				return send(response, {
					projects: await store.list(),
					added: projects.map((project) => project.id)
				}, 201), true;
			}
			if (pathname === "/api/projects/discover" && request.method === "POST") return send(response, await store.discover((await body(request)).root)), true;
			if (pathname === "/api/workspace/pick-folder" && request.method === "POST") return send(response, { path: await selectFolder() }), true;
			const match = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(files|reveal|events|review))?$/);
			if (match) {
				const [, id, action] = match, project = store.get(id);
				if (!project) throw statusError("This project is no longer connected.", 404);
				if (action === "files" && request.method === "GET") {
					const library = store.library(id);
					return send(response, {
						...library,
						files: library.files.map((image) => ({
							...image,
							url: `/p/${id}/${image.file.split("/").map(encodeURIComponent).join("/")}`
						}))
					}), true;
				}
				if (action === "events" && request.method === "GET") {
					streamListingChanges(request, response, node_path.default.join(project.root, "store-listing"));
					return true;
				}
				if (action === "review" && request.method === "GET") {
					if (!node_fs.default.existsSync(node_path.default.join(project.root, "store-listing", "studio.json"))) throw statusError("This project has no Studio listing to review.", 404);
					return send(response, reviewListing(node_path.default.join(project.root, "store-listing"))), true;
				}
				if (action === "reveal" && request.method === "POST") {
					const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
					await execute(command, [project.root], { timeout: 1e4 });
					return send(response, { opened: true }), true;
				}
				if (!action && request.method === "PATCH") {
					await store.update(id, await body(request));
					return send(response, { projects: await store.list() }), true;
				}
				if (!action && request.method === "DELETE") {
					await store.remove(id);
					return send(response, { projects: await store.list() }), true;
				}
			}
			send(response, { error: "This workspace action is not available." }, 404);
			return true;
		} catch (error) {
			const failure = error;
			send(response, { error: failure.message }, failure.status || 500);
			return true;
		}
		if (pathname === "/") {
			response.writeHead(302, { Location: "/studio/" }).end();
			return true;
		}
		if (pathname === "/studio" || pathname.startsWith("/studio/")) {
			await serveFile(uiDirectory, pathname.slice(7) || "/", { editable: false });
			return true;
		}
		const mounted = pathname.match(/^\/p\/([a-zA-Z0-9-]+)(\/.*)?$/);
		if (mounted) {
			const project = store.get(mounted[1]);
			if (!project) {
				response.writeHead(404).end("Project is not connected");
				return true;
			}
			const relative = mounted[2] || "/";
			if (relative === "/" || relative === "/store-listing/studio") {
				response.writeHead(302, { Location: `/p/${project.id}/store-listing/studio/` }).end();
				return true;
			}
			if (relative.startsWith("/store-listing/studio/")) await serveFile(uiDirectory, relative.slice(21), { editable: false });
			else await serveFile(project.root, relative, {
				editable: true,
				listingRoot: node_path.default.join(project.root, "store-listing")
			});
			return true;
		}
		return false;
	};
}
var execute, send, body;
var init_routes = __esmMin((() => {
	init_store();
	init_events();
	init_review();
	execute = (0, node_util.promisify)(node_child_process.execFile);
	send = (response, value, status = 200) => {
		response.writeHead(status, {
			"Content-Type": "application/json",
			"Cache-Control": "no-store"
		});
		response.end(JSON.stringify(value));
	};
	body = (request) => new Promise((resolve, reject) => {
		let data = "", size = 0;
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > 262144) reject(statusError("This request is too large.", 413));
			else data += chunk;
		});
		request.on("end", () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				reject(statusError("Send valid JSON."));
			}
		});
		request.on("error", reject);
	});
}));
// src/node/server.ts
/**
* The local Screenshot Studio server. It serves an app's files, and the studio itself (renderer, editor, theme helpers)
* at the app's store-listing/studio/ address, so an app keeps no copy of the studio: a theme's
* `import … from './studio/shapes.js'` and the renderer's `../theme.js` both resolve. With a workspace it also serves
* the project overview and /p/<id>/ mounts for every connected project.
*   npx screenshot-studio studio [port] [--add /path/to/app]… [--registry projects.json] [--open]
*/
var server_exports = /* @__PURE__ */ __exportAll({
	run: () => run$10,
	serve: () => serve
});
function writable(file, listingRoot) {
	const relative = node_path.default.relative(listingRoot, file).split(node_path.default.sep);
	return relative.length === 1 && relative[0] === "gallery.json" || relative.length === 2 && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(relative[0]) && relative[1] === "copy.json";
}
function serve(root, port = 0, { editable = false, workspace = null, activeProjectId = null, selectFolder } = {}) {
	root = node_path.default.resolve(root);
	const listing = node_fs.default.existsSync(node_path.default.join(root, "studio.json")) ? root : node_path.default.join(root, "store-listing");
	const hub = workspace ? workspaceRoutes({
		store: workspace,
		uiDirectory: STUDIO_DIR,
		activeProjectId,
		selectFolder
	}) : null;
	/** `/<listing>/studio/<rest>` for any folder under root that holds a studio.json: the studio's own <rest>. */
	const studioFile = (pathname) => {
		const match = pathname.match(/^(.*?)\/studio(\/.*)?$/);
		if (!match) return null;
		const folder = node_path.default.resolve(root, `.${match[1] || "/"}`);
		return inside(root, folder) && node_fs.default.existsSync(node_path.default.join(folder, "studio.json")) ? match[2] || "/" : null;
	};
	const server = node_http.default.createServer(async (request, response) => {
		async function serveFile(allowedRoot, url, { editable: canWrite = editable, listingRoot = listing } = {}) {
			allowedRoot = node_path.default.resolve(allowedRoot);
			let file = node_path.default.resolve(allowedRoot, `.${url}`);
			if (!inside(allowedRoot, file)) {
				response.writeHead(403).end();
				return;
			}
			try {
				if (node_fs.default.existsSync(file) && !inside(node_fs.default.realpathSync(allowedRoot), node_fs.default.realpathSync(file))) {
					response.writeHead(403).end();
					return;
				}
				if (request.method === "PUT") {
					if (!canWrite || !writable(file, listingRoot)) {
						response.writeHead(403).end("Not writable");
						return;
					}
					const host = request.headers.host || "";
					if (request.headers.origin && request.headers.origin !== `http://${host}`) {
						response.writeHead(403).end("Use the local studio");
						return;
					}
					let parent = node_path.default.dirname(file);
					while (!node_fs.default.existsSync(parent)) parent = node_path.default.dirname(parent);
					if (!inside(node_fs.default.realpathSync(allowedRoot), node_fs.default.realpathSync(parent))) {
						response.writeHead(403).end();
						return;
					}
					let body = "", bytes = 0;
					for await (const chunk of request) {
						bytes += chunk.length;
						if (bytes > 1048576) {
							response.writeHead(413).end("Copy file is too large");
							return;
						}
						body += chunk;
					}
					const value = JSON.parse(body);
					const expected = request.headers["x-studio-base"];
					const current = JSON.stringify(node_fs.default.existsSync(file) ? JSON.parse(node_fs.default.readFileSync(file, "utf8")) : {});
					if (expected !== void 0 && expected !== (0, node_crypto.createHash)("sha256").update(current).digest("hex")) {
						response.writeHead(409, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "The saved copy changed. Reload to resolve your draft." }));
						return;
					}
					node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
					node_fs.default.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
					response.writeHead(204).end();
					return;
				}
				if (!["GET", "HEAD"].includes(request.method || "")) {
					response.writeHead(405).end();
					return;
				}
				if (node_fs.default.existsSync(file) && node_fs.default.statSync(file).isDirectory()) file = node_path.default.join(file, "index.html");
				if (node_fs.default.existsSync(file) && !inside(node_fs.default.realpathSync(allowedRoot), node_fs.default.realpathSync(file))) {
					response.writeHead(403).end();
					return;
				}
				const data = await node_fs.default.promises.readFile(file);
				response.writeHead(200, {
					"Content-Type": types[node_path.default.extname(file).toLowerCase()] || "application/octet-stream",
					"Cache-Control": "no-store"
				});
				response.end(request.method === "HEAD" ? void 0 : data);
			} catch (error) {
				const failure = error;
				const body = request.method === "HEAD" ? "" : failure.code === "ENOENT" ? "Not found" : failure.message || "";
				response.writeHead(failure.code === "ENOENT" ? 404 : request.method === "PUT" ? 400 : 500, { "Content-Length": Buffer.byteLength(body) }).end(body);
			}
		}
		try {
			if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || "")) {
				response.writeHead(403).end("Use the local Studio address");
				return;
			}
			const pathname = decodeURIComponent(new URL(request.url || "/", "http://local").pathname);
			if (hub && await hub(request, response, pathname, serveFile)) return;
			const own = studioFile(pathname);
			if (own !== null) await serveFile(STUDIO_DIR, own, { editable: false });
			else await serveFile(root, pathname);
		} catch (error) {
			if (!response.headersSent) response.writeHead(400).end(error.message);
		}
	});
	return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
/**
* `studio [port] [--add /path/to/app]… [--registry projects.json] [--open]`: the editor. Inside an app it connects that
* app; from the studio itself it opens the workspace of every connected project. Keeps running until stopped.
*/
async function run$10(argv) {
	const value = (flag) => {
		const index = argv.indexOf(flag);
		return index < 0 ? void 0 : argv[index + 1];
	};
	const port = Number(value("--port") || (argv[0] && !argv[0].startsWith("--") ? argv[0] : 8790));
	const workspace = createWorkspaceStore({ registryFile: value("--registry") });
	const listing = findListing();
	const app = listing !== null;
	const root = listing ? node_path.default.dirname(listing) : node_path.default.dirname(STUDIO_DIR);
	let activeProjectId = null;
	if (app) activeProjectId = (await workspace.add([root]))[0].id;
	for (let index = 0; index < argv.length; index++) if (argv[index] === "--add") await workspace.add([argv[++index]]);
	await serve(root, port, {
		editable: true,
		workspace,
		activeProjectId
	});
	const url = listing ? `http://127.0.0.1:${port}/${node_path.default.relative(root, listing).split(node_path.default.sep).join("/")}/studio/` : `http://127.0.0.1:${port}/studio/`;
	console.log(`Screenshot Studio: ${url}`);
	if (argv.includes("--open")) {
		const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
		(await import("node:child_process")).spawn(opener, [url], {
			detached: true,
			stdio: "ignore"
		}).unref();
	}
	return 0;
}
var types;
var init_server = __esmMin((() => {
	init_store();
	init_project();
	init_routes();
	types = {
		".html": "text/html",
		".js": "text/javascript",
		".mjs": "text/javascript",
		".cjs": "text/javascript",
		".css": "text/css",
		".json": "application/json",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".webp": "image/webp",
		".svg": "image/svg+xml",
		".woff2": "font/woff2",
		".woff": "font/woff",
		".ttf": "font/ttf",
		".otf": "font/otf",
		".ttc": "font/collection"
	};
}));
// src/node/playwright.ts
/** Finding Playwright, which renders every card: wherever it is, with a message that says how to get it when it isn't. */
/** Where Playwright may live, most specific first. */
function candidates() {
	const found = [];
	if (process.env.PLAYWRIGHT_MODULE) found.push(process.env.PLAYWRIGHT_MODULE);
	for (const start of [__dirname, process.cwd()]) for (let dir = start;; dir = node_path.default.dirname(dir)) {
		found.push(node_path.default.join(dir, "node_modules", "playwright"));
		if (node_path.default.dirname(dir) === dir) break;
	}
	const cache = node_path.default.join(node_os.default.homedir(), ".npm", "_npx");
	if (node_fs.default.existsSync(cache)) for (const entry of node_fs.default.readdirSync(cache)) found.push(node_path.default.join(cache, entry, "node_modules", "playwright"));
	return found;
}
/** The directory of an installed Playwright, or null. */
function findPlaywright() {
	for (const dir of candidates()) if (node_fs.default.existsSync(node_path.default.join(dir, "package.json"))) return dir;
	try {
		return node_path.default.dirname(require.resolve("playwright/package.json"));
	} catch {
		return null;
	}
}
function loadPlaywright() {
	const dir = findPlaywright();
	if (!dir) throw new Error("Playwright renders the cards and isn't installed. Run the studio with `npx screenshot-studio …`, or install it: `npm install -D playwright && npx playwright install chromium`.");
	return require(dir);
}
/**
* Chromium, the browser every card renders in. The first time, when Playwright has no Chromium yet, it downloads
* the one this Playwright needs (once, about 100 MB) and carries on, instead of stopping with an install hint.
*/
async function launchBrowser(log = (line) => console.error(line)) {
	const { chromium } = loadPlaywright();
	try {
		return await chromium.launch();
	} catch (error) {
		if (!/Executable doesn't exist|browserType\.launch.*install/i.test(error.message)) throw error;
		const cli = node_path.default.join(findPlaywright(), "cli.js");
		log("Downloading Chromium to render the cards (once, about 100 MB)…");
		const { spawnSync } = require("node:child_process");
		if (spawnSync(process.execPath, [
			cli,
			"install",
			"--only-shell",
			"chromium"
		], { stdio: [
			"ignore",
			"inherit",
			"inherit"
		] }).status !== 0) throw new Error("Chromium could not be downloaded. Check the connection and try again, or run `npx playwright install chromium`.");
		return chromium.launch();
	}
}
var init_playwright = __esmMin((() => {}));
// src/node/export.ts
/**
* Render every card to a store-ready image and check the composition (with Playwright, found wherever it is installed).
*   node store-listing/studio/export.cjs [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--jobs 4] [--json]
* Without --locale every locale in studio.json is rendered. --strict fails when a non-default locale
* still borrows default-locale words or captures, or a callout could not follow its UI element.
* It also warns (and --strict fails) when a gallery folder holds images no card writes any more, when a
* continuous background (theme `continuous`) breaks at a seam, and when <locale>/listing.json is over Play's
* limits. --fastlane writes fastlane/metadata/android/<locale>/ text and screenshots (studio.json "fastlane").
* --prune deletes images no card writes any more. --jobs sets how many cards render at once.
* --json prints the result as JSON (for agents and tools); exportListing() returns the same result.
*/
var export_exports = /* @__PURE__ */ __exportAll({
	exportListing: () => exportListing,
	formatSummary: () => formatSummary,
	run: () => run$9
});
async function edgeColumns(page, width, height) {
	await page.evaluate(() => {
		for (const el of document.querySelectorAll(".device, header, .callout, .device-label, .identity")) el.style.visibility = "hidden";
	});
	const shots = [];
	for (const x of [0, width - 2]) shots.push((await page.screenshot({
		type: "png",
		scale: "css",
		clip: {
			x,
			y: 0,
			width: 2,
			height
		}
	})).toString("base64"));
	return page.evaluate((shots) => Promise.all(shots.map(async (data) => {
		const image = new Image();
		image.src = `data:image/png;base64,${data}`;
		await image.decode();
		const { naturalWidth: w, naturalHeight: h } = image;
		const canvas = Object.assign(document.createElement("canvas"), {
			width: w,
			height: h
		});
		canvas.getContext("2d").drawImage(image, 0, 0);
		const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
		return [0, 1].map((x) => {
			const column = [];
			for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) column.push(px[(y * w + x) * 4 + c]);
			return column;
		});
	})), shots);
}
function seamBreak([leftInner, leftOuter], [rightOuter, rightInner]) {
	let bad = 0, sum = 0;
	const rows = leftOuter.length / 3;
	const pairs = [
		[leftOuter, rightOuter],
		[leftOuter, rightInner],
		[leftInner, rightOuter]
	];
	for (let r = 0; r < rows; r++) {
		let d = Infinity;
		for (const [a, b] of pairs) for (let s = Math.max(0, r - 4); s <= Math.min(rows - 1, r + 4); s++) d = Math.min(d, Math.max(...[
			0,
			1,
			2
		].map((c) => Math.abs(a[r * 3 + c] - b[s * 3 + c]))));
		sum += d;
		if (d > 24) bad++;
	}
	return bad / rows > .02 || sum / rows > 6 ? Math.round(bad / rows * 100) : null;
}
/** Re-encode a PNG through a canvas, which always writes RGBA: stores want transparent-capable art as 32-bit PNG. */
async function rgba(page, png) {
	return Buffer.from(await page.evaluate(async (data) => {
		const image = new Image();
		image.src = `data:image/png;base64,${data}`;
		await image.decode();
		const canvas = Object.assign(document.createElement("canvas"), {
			width: image.naturalWidth,
			height: image.naturalHeight
		});
		canvas.getContext("2d").drawImage(image, 0, 0);
		return canvas.toDataURL("image/png").split(",")[1];
	}, png.toString("base64")), "base64");
}
/**
* Renders cards `jobs` at a time, each browser one card at a time: a browser draws every page's WebGL in one GPU
* process, so cards sharing a browser wait for each other. The first browser is the export's own; the others launch
* when first needed. Tasks run in the order they were added, at most `jobs * 2` ahead of the last one taken. add()
* returns a function that takes the task's result: the export takes them in order, so it writes, warns and logs in order.
*/
function renderQueue(jobs, browser) {
	const browsers = [Promise.resolve(browser)];
	const idle = [...Array(jobs).keys()].reverse();
	const starts = [];
	const running = /* @__PURE__ */ new Set();
	let next = 0, taken = 0, stopped = false;
	const pump = () => {
		while (!stopped && idle.length && next < starts.length && next < taken + jobs * 2) starts[next++](idle.pop());
	};
	return {
		add(task) {
			const index = starts.length;
			const result = new Promise((resolve, reject) => starts.push((slot) => {
				browsers[slot] ??= launchBrowser();
				const run = browsers[slot].then(task).then(resolve, reject).finally(() => {
					running.delete(run);
					idle.push(slot);
					pump();
				});
				running.add(run);
			}));
			result.catch(() => {});
			pump();
			return () => {
				taken = Math.max(taken, index);
				pump();
				return result;
			};
		},
		/** Start nothing more, close the browsers (so cards still rendering stop too) and wait for them. */
		async close() {
			stopped = true;
			await Promise.allSettled(browsers.map(async (b) => (await b).close()));
			await Promise.allSettled(running);
		}
	};
}
/** Render, check and write a listing's cards. Never throws for a card problem: the result says what failed. */
async function exportListing(options = {}) {
	const log = options.log || ((line) => console.log(line));
	const listing = requireListing(options.listing);
	const files = loadListing(listing);
	const warnings = [];
	const cards = [];
	const tallies = [];
	const staged = [];
	const warn = (message) => {
		warnings.push(message);
		log(`warning: ${message}`);
	};
	const finish = (result) => {
		const ran = {
			locales: options.locales,
			kind: options.kind,
			card: options.card,
			strict: !!options.strict
		};
		try {
			node_fs.default.writeFileSync(node_path.default.join(listing, "export-report.json"), JSON.stringify({
				...result,
				finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
				options: ran
			}, null, 2) + "\n");
		} catch {}
		return result;
	};
	const checked = checkListing(listing).issues;
	const placeholders = checked.filter((issue) => issue.code === "placeholder");
	if (placeholders.length) warn(`${placeholders.length} field(s) in ${[...new Set(placeholders.map((issue) => issue.file))].join(", ")} still hold the starter placeholder; \`npx screenshot-studio check\` lists them`);
	for (const issue of checked.filter((issue) => issue.code === "store-limit")) warn(`${issue.file}: ${issue.message}`);
	const gallery = await Promise.resolve().then(() => (init_gallery(), gallery_exports));
	let server = null, browser = null, queue = null;
	try {
		if (options.kind && options.kind !== "strips" && !files.galleries[options.kind]) throw new Error(`Unknown gallery ${options.kind}. Choose ${Object.keys(files.galleries).join(", ")}.`);
		if (options.card !== void 0) {
			if (!Number.isInteger(options.card) || options.card < 0) throw new Error("--card must be a nonnegative integer.");
			if (!Object.keys(files.galleries).filter((kind) => !options.kind || kind === options.kind).some((kind) => gallery.cardsFor(files.galleries, kind).length > options.card)) throw new Error(`No card ${options.card} in the selected galleries.`);
		}
		server = await serve(files.repo);
		const address = server.address();
		const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/${node_path.default.relative(files.repo, listing).split(node_path.default.sep).join("/")}`;
		browser = await launchBrowser();
		queue = renderQueue(Math.max(1, Math.floor(options.jobs || defaultJobs())), browser);
		const run = {
			...files,
			options,
			browser,
			base,
			queue,
			gallery,
			cards,
			tallies,
			staged,
			textFiles: [],
			log,
			warn
		};
		const plans = plan(run);
		let failures = 0;
		for (const locale of plans) if (!await writeLocale(run, locale)) failures++;
		if (failures) throw new Error(`--strict: ${failures} locale(s) still borrow ${files.defaultLocale} words, captures or callout positions`);
		if (options.strict && warnings.length) throw new Error(`--strict: ${warnings.length} warning(s)`);
		commitFastlane(staged);
		for (const { file, value } of run.textFiles) {
			node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
			node_fs.default.writeFileSync(file, value);
		}
		return finish({
			ok: true,
			cards,
			warnings,
			locales: tallies
		});
	} catch (error) {
		return finish({
			ok: false,
			cards,
			warnings,
			locales: tallies,
			error: error instanceof Error ? error.message : String(error)
		});
	} finally {
		await (queue ? queue.close() : browser?.close());
		for (const { shots } of staged) node_fs.default.rmSync(shots, {
			recursive: true,
			force: true
		});
		server?.close();
	}
}
/** Every card the export will write, queued to render in the order the export reads them. */
function plan(run) {
	const { config, profiles, galleries, defaultLocale, options, gallery: { cardsFor, outputFile } } = run;
	return (options.locales?.length ? options.locales : run.locales).map((locale) => {
		const galleryPlans = [];
		for (const kind of Object.keys(galleries)) {
			if (options.kind && options.kind !== kind) continue;
			if (profiles[kind].defaultLocaleOnly && locale !== defaultLocale) continue;
			const slides = cardsFor(galleries, kind);
			const { width, height } = profiles[kind];
			const destination = options.card === void 0 ? laneShots(run, locale, kind) : null;
			const cards = [...slides.entries()].filter(([i]) => options.card === void 0 || options.card === i).map(([index, slide]) => {
				const file = outputFile(kind, slide, index);
				const job = {
					locale,
					kind,
					index,
					slide,
					file,
					label: `${locale}/${file}`
				};
				return {
					...job,
					rendered: run.queue.add((browser) => withCardPage(run, browser, locale, kind, (page) => renderCard(run, page, job, !!destination)))
				};
			});
			galleryPlans.push({
				kind,
				width,
				height,
				slides,
				cards,
				destination
			});
		}
		const strips = [];
		for (const strip of locale === defaultLocale && options.card === void 0 ? config.readmeStrips || [] : []) {
			if (options.kind && options.kind !== strip.kind && options.kind !== "strips") continue;
			const shots = strip.cards.map((i, n) => {
				const position = strip.cards.length === 1 ? "only" : n === 0 ? "first" : n === strip.cards.length - 1 ? "last" : "middle";
				return run.queue.add((browser) => withCardPage(run, browser, locale, strip.kind, (page) => renderStripCard(run, page, locale, strip.kind, i, position)));
			});
			strips.push({
				strip,
				shots
			});
		}
		return {
			locale,
			dir: node_path.default.join(run.listing, locale),
			galleries: galleryPlans,
			strips
		};
	});
}
function fastlaneConfig({ config, defaultLocale }) {
	return {
		dir: "fastlane/metadata/android",
		screenshots: { phone: "images/phoneScreenshots" },
		screenshotLocales: [defaultLocale],
		locales: {},
		...config.fastlane
	};
}
function laneShots(run, locale, kind) {
	const { screenshots, screenshotLocales } = fastlaneConfig(run);
	return run.options.fastlane && screenshots[kind] && (screenshotLocales === "all" || screenshotLocales.includes(locale)) ? node_path.default.join(laneDir(run, locale), screenshots[kind]) : null;
}
/** Use a fresh page, in a context of its own, sized for a card of `kind`; it closes even when the card fails. */
async function withCardPage(run, browser, locale, kind, use) {
	const { width, height } = run.profiles[kind];
	const page = await browser.newPage({
		viewport: {
			width,
			height
		},
		deviceScaleFactor: run.config.supersample || 1,
		locale
	});
	try {
		return await use(page);
	} finally {
		await page.close().catch(() => {});
	}
}
/** Render a gallery card on a fresh page and check it; throws what is wrong with it. */
async function renderCard(run, page, { locale, kind, index, slide, file, label }, withFastlane) {
	const { config, profiles } = run;
	const { width, height } = profiles[kind];
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("requestfailed", (r) => {
		if (r.method() !== "HEAD") errors.push(`Failed to load ${r.url()}`);
	});
	page.on("response", (r) => {
		if (r.status() >= 400 && r.request().method() !== "HEAD" && !/\/(copy|[^/]+\.nodes)\.json$|\/raw\//.test(new URL(r.url()).pathname)) errors.push(`${r.status()} ${r.url()}`);
	});
	await page.goto(`${run.base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${index}`);
	await page.locator("html[data-ready=\"true\"]").waitFor({ timeout: 3e4 }).catch(() => {
		throw new Error(`${label}: ${errors.join("\n") || "never became ready"}`);
	});
	const report = JSON.parse(await page.locator("html").getAttribute("data-report") || "{}");
	const fonts = await page.evaluate(() => [...document.fonts].map((f) => f.status));
	if (fonts.includes("error") || slide.title && !fonts.includes("loaded")) throw new Error(`Fonts failed to load: ${label}`);
	if (!(report.fit > 0)) throw new Error(`Copy does not fit even at ${config.minFit || .72}× size; shorten it: ${label}`);
	const inside = (b) => !!b && b.x >= -.5 && b.y >= -.5 && b.x + b.width <= width + .5 && b.y + b.height <= height + .5;
	for (const el of await page.locator("[data-check-bounds]").all()) if (!inside(await el.boundingBox())) throw new Error(`Callout or label leaves the canvas: ${label}`);
	if (errors.length) throw new Error(errors.join("\n"));
	const png = file.endsWith(".png");
	const shot = await page.screenshot({
		type: png ? "png" : "jpeg",
		scale: "css",
		omitBackground: png && !!slide.transparent,
		...png ? {} : { quality: config.jpegQuality || 94 }
	});
	return {
		report,
		bytes: png && slide.transparent ? await rgba(page, shot) : shot,
		fastlane: withFastlane ? await page.screenshot({
			type: "png",
			scale: "css"
		}) : null,
		edges: report.continuous && !profiles[kind].defaultLocaleOnly ? await edgeColumns(page, width, height) : null
	};
}
/** One card of a README strip, drawn for its place in the strip, as PNG. */
async function renderStripCard(run, page, locale, kind, index, position) {
	await page.goto(`${run.base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${index}&strip=${position}`);
	await page.locator("html[data-ready=\"true\"]").waitFor({ timeout: 3e4 });
	return page.screenshot({
		type: "png",
		scale: "css"
	});
}
/** Write one language: its cards, seams and contact sheets, strips, stale-file check, text and assets.json. False when --strict fails it. */
async function writeLocale(run, plan) {
	const { locale, dir } = plan;
	const { options, defaultLocale, config, profiles } = run;
	const manifest = { galleries: {} };
	const written = /* @__PURE__ */ new Set();
	const tally = {
		locale,
		cards: 0,
		untranslated: 0,
		borrowedCaptures: 0,
		movedCallouts: 0,
		fixedCallouts: 0,
		shrunk: 0
	};
	for (const gallery of plan.galleries) {
		manifest.galleries[gallery.kind] = [];
		const edges = await writeCards(run, plan, gallery, manifest, written, tally);
		checkSeams(run, locale, gallery.kind, edges);
		if (options.card !== void 0 || gallery.slides.length < 2 || profiles[gallery.kind].defaultLocaleOnly || (config.contactSheets || {})[gallery.kind] === false) continue;
		await contactSheet(run, plan, gallery, manifest, written);
	}
	for (const strip of plan.strips) await writeStrip(run, plan, strip, written);
	if (!options.kind && options.card === void 0) staleOutputs(run, plan, manifest, written);
	writeListingText(run, locale);
	if (config.writeAssets !== false && !options.kind && options.card === void 0) node_fs.default.writeFileSync(node_path.default.join(dir, "assets.json"), JSON.stringify(manifest, null, 2) + "\n");
	run.tallies.push(tally);
	return !(options.strict && locale !== defaultLocale && (tally.untranslated || tally.borrowedCaptures || tally.fixedCallouts));
}
/** Take a gallery's rendered cards in order: write each, note what it borrowed or shrank, and stage it for fastlane. Returns each card's edges. */
async function writeCards(run, { locale, dir }, gallery, manifest, written, tally) {
	const { defaultLocale, log, warn } = run;
	const { kind, width, height, destination } = gallery;
	const edges = [];
	const shots = destination ? node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "studio-fastlane-")) : null;
	if (shots && destination) run.staged.push({
		shots,
		destination
	});
	for (const { index: i, slide, file, label, rendered } of gallery.cards) {
		const { report, bytes, fastlane, edges: edge } = await rendered();
		node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, file)), { recursive: true });
		node_fs.default.writeFileSync(node_path.default.join(dir, file), bytes);
		written.add(node_path.default.join(dir, file));
		if (shots && fastlane) node_fs.default.writeFileSync(node_path.default.join(shots, `${i + 1}.png`), fastlane);
		if (edge) edges[i] = edge;
		const notes = [];
		if (locale !== defaultLocale) {
			tally.movedCallouts += report.movedCallouts.length;
			if (report.missingCopy.length) {
				tally.untranslated++;
				notes.push(`untranslated: ${report.missingCopy.join(", ")}`);
			}
			if (report.fallbackCaptures.length) {
				tally.borrowedCaptures++;
				notes.push(`${defaultLocale} capture: ${report.fallbackCaptures.join(", ")}`);
			}
			if (report.fixedCallouts.length) {
				tally.fixedCallouts++;
				notes.push("callout kept its default-locale position");
			}
		}
		if (report.fit < 1) {
			tally.shrunk++;
			notes.push(`copy shrunk to ${Math.round(report.fit * 100)}%`);
		}
		if (report.widows?.length) warn(`${label}: "${report.widows.join("\", \"")}" is left on a short last line; reword or shorten the copy`);
		tally.cards++;
		const card = {
			locale,
			kind,
			index: i,
			feature: slide.feature,
			file: node_path.default.join(locale, file).split(node_path.default.sep).join("/"),
			width,
			height,
			bytes: bytes.length,
			notes
		};
		run.cards.push({
			...card,
			layout: report.layout
		});
		manifest.galleries[kind].push({
			...card,
			file,
			slide: i,
			sources: run.gallery.devicesFor(slide).map((d) => `raw/${d.raw}`)
		});
		log(`${label}${notes.length ? `  (${notes.join("; ")})` : ""}`);
	}
	return edges;
}
/** Warn where a continuous background breaks between neighbouring cards. */
function checkSeams(run, locale, kind, edges) {
	for (let i = 0; i + 1 < edges.length; i++) {
		const rows = edges[i] && edges[i + 1] ? seamBreak(edges[i][1], edges[i + 1][0]) : null;
		if (rows !== null) run.warn(`${locale}/${kind}: the background breaks at the seam between cards ${i + 1} and ${i + 2} (${rows}% of rows differ)`);
	}
}
/** Contact sheet: the set edge to edge, so seams can be checked at a glance. */
async function contactSheet(run, { locale, dir }, { kind, width, height, slides }, manifest, written) {
	const h = width > height ? 600 : 960, w = Math.round(h * width / height);
	const sheet = await run.browser.newPage({ viewport: {
		width: w * slides.length,
		height: h
	} });
	await sheet.setContent(`<body style="margin:0;display:flex">${manifest.galleries[kind].map((m) => `<img src="${run.base}/${locale}/${m.file}?t=${Date.now()}" style="height:${h}px;width:${w}px">`).join("")}</body>`);
	await sheet.waitForLoadState("networkidle");
	await decoded(sheet);
	const sheetName = (run.config.contactSheets || {})[kind] || `contact-${kind}.jpg`;
	written.add(node_path.default.join(dir, sheetName));
	node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, sheetName)), { recursive: true });
	await sheet.screenshot({
		path: node_path.default.join(dir, sheetName),
		type: "jpeg",
		quality: 90
	});
	await sheet.close();
}
/** Join a strip's rendered cards into one image. */
async function writeStrip(run, { locale, dir }, { strip, shots: rendered }, written) {
	const { width, height } = run.profiles[strip.kind];
	const shots = [];
	for (const shot of rendered) shots.push((await shot()).toString("base64"));
	const h = strip.height || 1200, w = Math.round(h * width / height);
	const sheet = await run.browser.newPage({ viewport: {
		width: w * shots.length,
		height: h
	} });
	await sheet.setContent(`<body style="margin:0;display:flex">${shots.map((s) => `<img src="data:image/png;base64,${s}" style="height:${h}px;width:${w}px">`).join("")}</body>`);
	await sheet.waitForLoadState("load");
	await decoded(sheet);
	node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, strip.file)), { recursive: true });
	written.add(node_path.default.join(dir, strip.file));
	await sheet.screenshot({
		path: node_path.default.join(dir, strip.file),
		type: "jpeg",
		quality: run.config.jpegQuality || 92
	});
	await sheet.close();
	run.log(`${locale}/${strip.file}  (strip of ${strip.kind} ${strip.cards.map((i) => i + 1).join(", ")})`);
}
function staleOutputs(run, { dir }, manifest, written) {
	const files = Object.values(manifest.galleries).flat().map((m) => node_path.default.join(dir, m.file));
	for (const folder of new Set(files.map((f) => node_path.default.dirname(f)))) for (const f of node_fs.default.readdirSync(folder)) {
		if (!IMAGES.test(f) || written.has(node_path.default.join(folder, f))) continue;
		const stale = node_path.default.relative(run.listing, node_path.default.join(folder, f));
		if (run.options.prune) {
			node_fs.default.rmSync(node_path.default.join(folder, f));
			run.log(`deleted ${stale} (no card writes it any more)`);
		} else run.warn(`${stale} is no longer in the gallery; delete it, or export with --prune`);
	}
}
/** Check <locale>/listing.json against the store's limits, and write it as fastlane text when asked. */
function writeListingText(run, locale) {
	const json = readJson(node_path.default.join(run.listing, locale, "listing.json"), null);
	const words = json && {
		...json,
		title: json.title ?? json.appName
	};
	for (const problem of words ? listingProblems(words, storeFor(run.config, run.profiles)) : []) run.warn(`${locale}/listing.json ${problem.message}`);
	if (!run.options.fastlane || !words) return;
	const dir = laneDir(run, locale);
	for (const [field, name] of [
		["title", "title"],
		["shortDescription", "short_description"],
		["fullDescription", "full_description"]
	]) {
		const value = words[field];
		if (typeof value === "string") run.textFiles.push({
			file: node_path.default.join(dir, `${name}.txt`),
			value: `${value.trimEnd()}\n`
		});
	}
}
/** Replace each fastlane screenshot folder's images with the staged ones; only a successful export gets here. */
function commitFastlane(staged) {
	for (const { shots, destination } of staged) {
		node_fs.default.mkdirSync(destination, { recursive: true });
		for (const f of node_fs.default.readdirSync(destination)) if (IMAGES.test(f)) node_fs.default.rmSync(node_path.default.join(destination, f));
		for (const f of node_fs.default.readdirSync(shots)) node_fs.default.copyFileSync(node_path.default.join(shots, f), node_path.default.join(destination, f));
	}
}
/** The summary table the command line prints. */
function formatSummary(result) {
	const lines = ["locale      cards  untranslated  borrowed captures  moved callouts  unresolved callouts  shrunk copy"];
	for (const t of result.locales) lines.push(`${t.locale.padEnd(10)}  ${String(t.cards).padStart(5)}  ${String(t.untranslated).padStart(12)}  ${String(t.borrowedCaptures).padStart(17)}  ${String(t.movedCallouts).padStart(14)}  ${String(t.fixedCallouts).padStart(19)}  ${String(t.shrunk).padStart(11)}`);
	if (result.warnings.length) lines.push("", `${result.warnings.length} warning(s):`, ...result.warnings.map((w) => `  ${w}`));
	return lines.join("\n");
}
/** `export [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--prune] [--jobs 4] [--json]` */
async function run$9(argv) {
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const json = argv.includes("--json");
	const card = arg("card"), jobs = arg("jobs");
	const result = await exportListing({
		locales: arg("locale") ? [arg("locale")] : void 0,
		kind: arg("kind"),
		card: card === void 0 ? void 0 : Number(card),
		strict: argv.includes("--strict"),
		fastlane: argv.includes("--fastlane"),
		prune: argv.includes("--prune"),
		listing: arg("listing"),
		jobs: jobs === void 0 ? void 0 : Number(jobs),
		log: json ? () => {} : void 0
	});
	if (json) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`\n${formatSummary(result)}`);
		if (result.error) console.error(`\n${result.error}`);
	}
	return result.ok ? 0 : 1;
}
var IMAGES, defaultJobs, laneDir, decoded;
var init_export = __esmMin((() => {
	init_check();
	init_project();
	init_server();
	init_playwright();
	init_stores();
	IMAGES = /\.(jpe?g|png|webp)$/i;
	defaultJobs = () => Math.min(4, node_os.default.availableParallelism());
	laneDir = (run, locale) => {
		const { dir, locales } = fastlaneConfig(run);
		return node_path.default.join(run.repo, dir, locales[locale] || locale);
	};
	decoded = (sheet) => sheet.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
}));
// src/node/capture/emulator.ts
var emulator_exports$1 = /* @__PURE__ */ __exportAll({
	Emulator: () => Emulator,
	SCALES: () => SCALES,
	sleep: () => sleep
});
var SCALES, DEMO$1, HELPERS, sleep, Emulator;
var init_emulator$1 = __esmMin((() => {
	SCALES = [
		"window_animation_scale",
		"transition_animation_scale",
		"animator_duration_scale"
	];
	DEMO$1 = "com.android.systemui.demo";
	HELPERS = /^(.*\.safetycore|.*contactkeys.*|.*\.verifier)$/;
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	Emulator = class {
		serial;
		width = 0;
		height = 0;
		density = 0;
		theme = "light";
		/** The battery level the status bar shows. */
		battery = 100;
		saved = /* @__PURE__ */ new Map();
		clockSet = false;
		constructor(serial) {
			this.serial = serial;
		}
		adb(...words) {
			const run = (0, node_child_process.spawnSync)("adb", [
				"-s",
				this.serial,
				...words.map(String)
			], {
				encoding: "utf8",
				maxBuffer: 67108864,
				timeout: 3e5
			});
			if (run.status !== 0) throw new Error(`adb ${words.join(" ")} failed: ${(run.stderr || run.stdout || "").trim()}`);
			return run.stdout;
		}
		shell(...words) {
			return this.adb("shell", ...words);
		}
		/** A shell command that may fail without stopping the capture. */
		try(...words) {
			try {
				return this.shell(...words);
			} catch {
				return "";
			}
		}
		setting(namespace, key, value) {
			if (value === void 0) {
				const read = this.try("settings", "get", namespace, key).trim();
				return read === "null" ? "" : read;
			}
			this.shell("settings", "put", namespace, key, value);
			return value;
		}
		/** Whether the serial is an emulator (a phone is refused). */
		isEmulator() {
			return (this.try("getprop", "ro.kernel.qemu") + this.try("getprop", "ro.boot.qemu")).includes("1");
		}
		/** Remember a setting to put back on restore, then set it. */
		change(namespace, key, value) {
			if (!this.saved.has(`${namespace}/${key}`)) this.saved.set(`${namespace}/${key}`, this.setting(namespace, key));
			this.setting(namespace, key, value);
		}
		/** Prepare the emulator for a capture: a refused override, settings saved, demo mode allowed, helpers away. */
		prepare(options) {
			if (/Override/.test(this.try("wm", "size") + this.try("wm", "density"))) throw new Error("The emulator still has a display override from an interrupted run: npx screenshot-studio reset");
			this.try("input", "keyevent", "KEYCODE_WAKEUP");
			this.try("wm", "dismiss-keyguard");
			this.try("cmd", "overlay", "enable-exclusive", "--category", "com.android.internal.systemui.navbar.gestural");
			this.change("system", "font_scale", "1.0");
			this.change("global", "heads_up_notifications_enabled", "0");
			this.change("global", "auto_time", this.setting("global", "auto_time") || "1");
			this.change("system", "accelerometer_rotation", "0");
			this.change("system", "user_rotation", "0");
			for (const key of SCALES) this.change("global", key, options.animations ? "1" : "0");
			this.setting("global", "sysui_demo_allowed", "1");
			for (const line of this.try("pm", "list", "packages").split(/\s+/)) {
				const name = line.replace(/^package:/, "");
				if (HELPERS.test(name)) this.try("pm", "uninstall", "--user", "0", name);
			}
			this.snapshotHelper();
			this.try("pkill", "-f", "uiautomator");
			this.try("cmd", "notification", "snooze", "--for", "3600000", "all");
			if (options.offline) {
				this.try("svc", "wifi", "disable");
				this.try("svc", "data", "disable");
			}
		}
		/**
		* agent-device reads the screen through a helper app. Its daemon remembers installing it, so when something else
		* removed it (an older capture tool), it is installed again here from agent-device's own package.
		*/
		snapshotHelper() {
			const pkg = "com.callstack.agentdevice.snapshothelper";
			if (this.try("pm", "list", "instrumentation").includes(pkg)) return;
			this.try("pm", "install-existing", "--user", "0", pkg);
			if (this.try("pm", "list", "instrumentation").includes(pkg)) return;
			for (let dir = __dirname; dir !== node_path.default.dirname(dir); dir = node_path.default.dirname(dir)) {
				const dist = node_path.default.join(dir, "node_modules", "agent-device", "android", "snapshot-helper", "dist");
				const apk = node_fs.default.existsSync(dist) && node_fs.default.readdirSync(dist).find((name) => name.endsWith(".apk"));
				if (apk) {
					this.adb("install", "-r", "-t", node_path.default.join(dist, apk));
					return;
				}
			}
			throw new Error(`agent-device's snapshot helper (${pkg}) is missing from the emulator and its APK was not found: reinstall screenshot-studio.`);
		}
		demo(command, extras = {}) {
			this.try("am", "broadcast", "-a", DEMO$1, "--es", "command", command, ...Object.entries(extras).flatMap(([key, value]) => [
				"--es",
				key,
				String(value)
			]));
		}
		/** Demo mode: 9:41, a full battery, full Wi-Fi, no mobile signal, SIM, airplane icon or notifications. */
		statusBar(battery = this.battery) {
			this.demo("exit");
			this.demo("enter");
			this.demo("clock", { hhmm: "0941" });
			this.demo("battery", {
				level: battery,
				plugged: "false"
			});
			this.demo("notifications", { visible: "false" });
			this.demo("network", {
				wifi: "show",
				level: 4,
				fully: "true",
				mobile: "hide",
				sims: 0,
				airplane: "hide"
			});
		}
		async resize(width, height, density, settle = 2e3) {
			this.demo("exit");
			this.shell("wm", "size", `${width}x${height}`);
			this.shell("wm", "density", density);
			Object.assign(this, {
				width,
				height,
				density
			});
			await sleep(settle);
			this.statusBar();
		}
		async night(on, settle = 2e3) {
			this.shell("cmd", "uimode", "night", on ? "yes" : "no");
			this.theme = on ? "dark" : "light";
			await sleep(settle);
		}
		async rotate(landscape, settle = 4e3) {
			this.setting("system", "accelerometer_rotation", "0");
			this.setting("system", "user_rotation", landscape ? "1" : "0");
			await sleep(settle);
		}
		/** The emulator's clock at today's hh:mm, matching the status bar; the host's time comes back on restore. */
		setClock(hhmm = "09:41") {
			const [hour, minute] = hhmm.split(":").map(Number);
			const moment = /* @__PURE__ */ new Date();
			moment.setHours(hour, minute, 0, 0);
			this.clockSet = true;
			this.setting("global", "auto_time", "0");
			this.shell("cmd", "alarm", "set-time", moment.getTime());
		}
		/** The app's own language (Android 13+), checked; empty resets it to the system language. */
		appLocale(pkg, locale) {
			this.shell("cmd", "locale", "set-app-locales", pkg, "--user", "current", "--locales", locale);
			const read = this.shell("cmd", "locale", "get-app-locales", pkg, "--user", "current");
			if (read.match(/are \[([^\]]*)\]/)?.[1] !== locale) throw new Error(`The app's language did not switch to ${locale || "the system language"}: ${read.trim()}`);
		}
		/** The display as PNG. Some emulators print a warning (several displays) first: the image starts at its signature. */
		screenshot() {
			const run = (0, node_child_process.spawnSync)("adb", [
				"-s",
				this.serial,
				"exec-out",
				"screencap",
				"-p"
			], { maxBuffer: 67108864 });
			const raw = run.stdout;
			const start = raw.indexOf(Buffer.from([
				137,
				80,
				78,
				71
			]));
			if (run.status !== 0 || start < 0) throw new Error(`${this.serial} sent no screenshot: ${String(run.stderr || raw.subarray(0, 200))}`);
			return raw.subarray(start);
		}
		/** Install an APK. Low storage: reinstall from scratch, then trim caches; another machine's debug key: reinstall. */
		install(apk, pkg) {
			for (let attempt = 0; attempt < 3; attempt++) {
				let out;
				try {
					out = this.adb("install", "-r", "-t", apk);
				} catch (error) {
					out = error.message;
				}
				if (out.includes("Success")) return;
				if (/INSUFFICIENT_STORAGE/.test(out) && attempt === 0) this.try("pm", "uninstall", pkg) || this.adbTry("uninstall", pkg);
				else if (/INSUFFICIENT_STORAGE/.test(out) && attempt === 1) this.try("pm", "trim-caches", "64G");
				else if (/UPDATE_INCOMPATIBLE/.test(out) && attempt === 0) this.adbTry("uninstall", pkg);
				else throw new Error(`Installing ${apk} failed: ${out.trim()}`);
			}
			throw new Error(`Installing ${apk} failed after three tries.`);
		}
		adbTry(...words) {
			try {
				return this.adb(...words);
			} catch {
				return "";
			}
		}
		/** Undo what an interrupted run can leave behind: display overrides, demo mode, dark mode, no animations, no network. */
		reset() {
			this.demo("exit");
			for (const words of [
				[
					"wm",
					"size",
					"reset"
				],
				[
					"wm",
					"density",
					"reset"
				],
				[
					"cmd",
					"uimode",
					"night",
					"no"
				],
				[
					"svc",
					"wifi",
					"enable"
				],
				[
					"svc",
					"data",
					"enable"
				]
			]) this.try(...words);
			for (const key of SCALES) this.setting("global", key, "1");
			this.setting("global", "heads_up_notifications_enabled", "1");
			this.setting("global", "auto_time", "1");
			this.setting("system", "accelerometer_rotation", "1");
		}
		/** Put everything back, even after a failure; returns what could not be. */
		restore(options) {
			const failed = [];
			const step = (name, run) => {
				try {
					run();
				} catch (error) {
					failed.push(`${name}: ${error.message}`);
				}
			};
			if (options.pkg) step("stop the app", () => this.shell("am", "force-stop", options.pkg));
			if (options.pkg && options.appLocale) step("app language", () => this.appLocale(options.pkg, ""));
			step("demo mode", () => this.demo("exit"));
			step("night mode", () => this.shell("cmd", "uimode", "night", "no"));
			step("display size", () => this.shell("wm", "size", "reset"));
			step("display density", () => this.shell("wm", "density", "reset"));
			if (this.clockSet) step("clock", () => this.shell("cmd", "alarm", "set-time", Date.now()));
			const defaults = {
				heads_up_notifications_enabled: "1",
				auto_time: "1",
				font_scale: "1.0",
				accelerometer_rotation: "1",
				user_rotation: "0",
				...Object.fromEntries(SCALES.map((key) => [key, "1"]))
			};
			for (const [where, value] of this.saved) {
				const [namespace, key] = where.split("/");
				step(key, () => this.setting(namespace, key, value || defaults[key]));
			}
			if (options.offline) {
				step("Wi-Fi", () => this.shell("svc", "wifi", "enable"));
				step("mobile data", () => this.shell("svc", "data", "enable"));
			}
			if (options.uninstall && options.pkg) step("uninstall", () => this.adb("uninstall", options.pkg));
			return failed;
		}
	};
}));
// src/node/ios.ts
/**
* iOS: the App Store galleries, and the simulators that capture them (Xcode's `xcrun simctl`). Tours run on them like
* on the Android emulator (capture/tour.ts, capture/simulator.ts).
*/
var ios_exports = /* @__PURE__ */ __exportAll({
	APP_STORE: () => APP_STORE,
	bootSimulator: () => bootSimulator,
	defaultSimulators: () => defaultSimulators,
	findSimulator: () => findSimulator,
	iosGalleryFor: () => iosGalleryFor,
	simulators: () => simulators,
	simulatorsFor: () => simulatorsFor
});
/** Which App Store gallery an image belongs to, by its shape. */
function iosGalleryFor(width, height) {
	const ratio = height / width;
	if (ratio >= 1.75) return {
		kind: "iphone",
		profile: { ...APP_STORE.iphone }
	};
	if (ratio >= 1.15) return {
		kind: "ipad",
		profile: { ...APP_STORE.ipad }
	};
	if (ratio <= 1 / 1.15) return {
		kind: "ipad-landscape",
		profile: { ...APP_STORE["ipad-landscape"] }
	};
	return null;
}
/** Every available simulator, newest runtime first; empty without Xcode. */
function simulators() {
	const run = (0, node_child_process.spawnSync)("xcrun", [
		"simctl",
		"list",
		"devices",
		"available",
		"--json"
	], { encoding: "utf8" });
	if (run.status !== 0 || !run.stdout) return [];
	const found = [];
	for (const [runtime, entries] of Object.entries(JSON.parse(run.stdout).devices)) {
		const version = (runtime.split(".").pop().match(/\d+/g) || []).map(Number);
		for (const entry of entries) found.push({
			...entry,
			runtime,
			version
		});
	}
	const newer = (a, b) => {
		for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0);
		return 0;
	};
	return found.sort((a, b) => newer(a.version, b.version));
}
/** The simulators `init` writes into profiles.json: the newest Pro Max iPhone (6.9″) and 13-inch iPad Pro. */
function defaultSimulators(available = simulators()) {
	const pick = (pattern, fallback) => available.find((d) => pattern.test(d.name))?.name || fallback;
	return {
		iphone: pick(/^iPhone \d+ Pro Max$/, "iPhone 17 Pro Max"),
		ipad: pick(/^iPad Pro 13-inch/, "iPad Pro 13-inch (M5)")
	};
}
/** The simulator a name or UDID means: a booted one first, then the newest runtime. */
function findSimulator(name, available = simulators()) {
	if (!available.length) throw new Error("No iOS simulators found. Install Xcode and a simulator runtime (Xcode → Settings → Components).");
	const matches = available.filter((d) => d.udid.toLowerCase() === name.toLowerCase()).concat(available.filter((d) => d.name === name));
	if (!matches.length) throw new Error(`No available simulator named "${name}". Available: ${[...new Set(available.map((d) => d.name))].join(", ")}`);
	return matches.find((d) => d.state === "Booted") || matches[0];
}
/** Boot a simulator (headless) and wait until it has finished booting. */
async function bootSimulator(name, log) {
	const device = findSimulator(name);
	if (device.state === "Booted") return device.udid;
	log(`Booting ${device.name} (${device.runtime.split(".").pop()}, ${device.udid})…`);
	const run = (0, node_child_process.spawnSync)("xcrun", [
		"simctl",
		"bootstatus",
		device.udid,
		"-b"
	], {
		encoding: "utf8",
		timeout: 6e5
	});
	if (run.status !== 0) throw new Error(`${device.name} did not boot: ${(run.stderr || run.stdout || "").trim()}`);
	log(`${device.name} is ready.`);
	return device.udid;
}
/** The simulator each iOS capture profile runs on: its own "simulator", else the default. */
function simulatorsFor(profiles, names, fallback) {
	const missing = names.filter((name) => !profiles[name]?.simulator && !fallback);
	if (missing.length) throw new Error(`No simulator for ${missing.join(", ")}: set "simulator" on the profile in profiles.json, or "capture": {"simulator": "…"} in studio.json`);
	return [...new Set(names.map((name) => profiles[name].simulator || fallback))];
}
var APP_STORE;
var init_ios = __esmMin((() => {
	APP_STORE = {
		iphone: {
			width: 1320,
			height: 2868,
			frame: "iphone",
			platform: "ios",
			label: "iPhone 6.9″"
		},
		iphone63: {
			width: 1206,
			height: 2622,
			frame: "iphone",
			platform: "ios",
			label: "iPhone 6.3″"
		},
		ipad: {
			width: 2064,
			height: 2752,
			frame: "tablet",
			platform: "ios",
			label: "iPad 13″"
		},
		"ipad-landscape": {
			width: 2752,
			height: 2064,
			frame: "tablet",
			platform: "ios",
			label: "iPad 13″ landscape"
		}
	};
}));
// src/node/capture/simulator.ts
var simulator_exports = /* @__PURE__ */ __exportAll({
	Simulator: () => Simulator,
	appleLanguage: () => appleLanguage
});
/** A store locale (de-DE) as iOS launch arguments: -AppleLanguages (de-DE) -AppleLocale de_DE. */
function appleLanguage(locale) {
	const parts = locale.split("-"), region = parts.slice(1).find((part) => /^([A-Z]{2}|\d{3})$/.test(part));
	return [
		"-AppleLanguages",
		`(${LANGUAGES[locale] || locale})`,
		"-AppleLocale",
		region ? `${parts[0]}_${region}` : parts[0]
	];
}
var LANGUAGES, NINE_FORTY_ONE, Simulator;
var init_simulator = __esmMin((() => {
	init_ios();
	init_emulator$1();
	LANGUAGES = {
		"zh-CN": "zh-Hans",
		"zh-SG": "zh-Hans",
		"zh-TW": "zh-Hant",
		"zh-HK": "zh-HK",
		"iw-IL": "he",
		"in-ID": "id"
	};
	NINE_FORTY_ONE = new Date(2007, 0, 9, 9, 41).toISOString();
	Simulator = class Simulator {
		udid;
		name;
		bootedHere;
		theme = "light";
		battery = 100;
		saved = null;
		constructor(udid, name, bootedHere = false) {
			this.udid = udid;
			this.name = name;
			this.bootedHere = bootedHere;
		}
		/** The simulator a name or UDID means, booted (headless) if it isn't running. */
		static open(name) {
			const device = findSimulator(name);
			if (device.state === "Booted") return new Simulator(device.udid, device.name);
			const run = (0, node_child_process.spawnSync)("xcrun", [
				"simctl",
				"bootstatus",
				device.udid,
				"-b"
			], {
				encoding: "utf8",
				timeout: 6e5
			});
			if (run.status !== 0) throw new Error(`${device.name} did not boot: ${(run.stderr || run.stdout || "").trim()}`);
			return new Simulator(device.udid, device.name, true);
		}
		simctl(...words) {
			const run = (0, node_child_process.spawnSync)("xcrun", ["simctl", ...words.map(String)], {
				encoding: "utf8",
				maxBuffer: 67108864,
				timeout: 3e5
			});
			if (run.error) throw new Error("xcrun not found: iOS capture needs Xcode with a simulator runtime.");
			if (run.status !== 0) throw new Error(`simctl ${words.join(" ")} failed: ${(run.stderr || run.stdout || "").trim()}`);
			return run.stdout;
		}
		/** A simctl command that may fail without stopping the capture. */
		try(...words) {
			try {
				return this.simctl(...words);
			} catch {
				return "";
			}
		}
		/** Prepare for a capture: the current appearance and text size remembered, the default text size, the status bar. */
		prepare() {
			if (!this.saved) this.saved = {
				appearance: this.try("ui", this.udid, "appearance").trim(),
				contentSize: this.try("ui", this.udid, "content_size").trim()
			};
			this.try("ui", this.udid, "content_size", "large");
			this.statusBar();
		}
		/** 9:41, the battery full (or at `battery`), full Wi-Fi and signal, no carrier name. */
		statusBar() {
			this.simctl("status_bar", this.udid, "override", "--time", NINE_FORTY_ONE, "--batteryState", this.battery >= 100 ? "charged" : "discharging", "--batteryLevel", this.battery, "--cellularMode", "active", "--cellularBars", 4, "--wifiMode", "active", "--wifiBars", 3, "--dataNetwork", "wifi", "--operatorName", "");
		}
		async night(on, settle = 1500) {
			this.simctl("ui", this.udid, "appearance", on ? "dark" : "light");
			this.theme = on ? "dark" : "light";
			await sleep(settle);
		}
		/** The display as PNG, square-cornered (the frame rounds it). */
		screenshot() {
			const file = node_path.default.join(node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "studio-sim-")), "screen.png");
			try {
				this.simctl("io", this.udid, "screenshot", "--type=png", "--mask=ignored", file);
				return node_fs.default.readFileSync(file);
			} finally {
				node_fs.default.rmSync(node_path.default.dirname(file), {
					recursive: true,
					force: true
				});
			}
		}
		install(app) {
			if (!node_fs.default.existsSync(app)) throw new Error(`No .app at ${app}: build it for the simulator first (studio.json capture.build)`);
			this.simctl("install", this.udid, app);
		}
		/** Undo what an interrupted run can leave behind: the status bar, dark mode, a text size. */
		reset() {
			this.try("status_bar", this.udid, "clear");
			this.try("ui", this.udid, "appearance", "light");
			this.try("ui", this.udid, "content_size", "large");
		}
		/** Put everything back, even after a failure, and shut the simulator down if this run booted it; returns what could not be. */
		restore({ bundle, uninstall = false, keep = false }) {
			const failed = [];
			const step = (name, run) => {
				try {
					run();
				} catch (error) {
					failed.push(`${name}: ${error.message}`);
				}
			};
			if (bundle) step("stop the app", () => this.try("terminate", this.udid, bundle));
			if (bundle && uninstall) step("uninstall", () => this.simctl("uninstall", this.udid, bundle));
			step("status bar", () => this.simctl("status_bar", this.udid, "clear"));
			if (this.saved && /^(light|dark)$/.test(this.saved.appearance)) step("appearance", () => this.simctl("ui", this.udid, "appearance", this.saved.appearance));
			if (this.saved?.contentSize && !/unknown|unsupported/.test(this.saved.contentSize)) step("text size", () => this.simctl("ui", this.udid, "content_size", this.saved.contentSize));
			if (this.bootedHere && !keep) step("shut down", () => this.simctl("shutdown", this.udid));
			return failed;
		}
	};
}));
// src/node/capture/screen.ts
/** An agent-device client per device, each in a session of its own (a session belongs to one device). */
function agentDevice(target) {
	const session = `screenshot-studio-${target.platform === "ios" ? target.udid : target.serial}`;
	if (!clients.has(session)) clients.set(session, import("agent-device").then(({ createAgentDeviceClient }) => createAgentDeviceClient({ session })));
	return clients.get(session);
}
/** The app's UI tree, without the system bars, each element with its path among its siblings. */
async function readTree(target) {
	const snapshot = await (await agentDevice(target)).capture.snapshot({
		...selector(target),
		raw: true
	});
	const root = snapshot.nodes.find((node) => node.rect && node.parentIndex === void 0)?.rect;
	const { width = root?.width ?? Infinity, height = root?.height ?? Infinity } = snapshot.viewport || {};
	const scale = target.platform === "ios" && target.width && Number.isFinite(width) ? target.width / width : 1;
	scales.set(target, scale);
	const onScreen = (node) => !node.rect || node.rect.x < width && node.rect.y < height && node.rect.x + node.rect.width > 0 && node.rect.y + node.rect.height > 0;
	const kept = snapshot.nodes.filter((node) => !node.systemBar && node.visibleToUser !== false && onScreen(node));
	const keptIndex = new Set(kept.map((node) => node.index));
	const children = /* @__PURE__ */ new Map();
	for (const node of kept) {
		const parent = node.parentIndex !== void 0 && keptIndex.has(node.parentIndex) ? node.parentIndex : void 0;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent).push(node);
	}
	const nodes = [];
	const visit = (parent, path) => (children.get(parent) || []).forEach((node, i) => {
		const here = path ? `${path}.${i}` : String(i);
		if (node.rect) {
			const { x, y, width, height } = node.rect;
			const text = node.label && TEXT_CLASS.test(node.type || "") ? node.label : void 0;
			const desc = node.contentDescription || (node.label && !text ? node.label : void 0);
			nodes.push({
				path: here,
				b: [
					Math.round(x * scale),
					Math.round(y * scale),
					Math.round((x + width) * scale),
					Math.round((y + height) * scale)
				],
				...text && { text },
				...desc && { desc },
				...node.identifier && { id: node.identifier },
				...node.type && { cls: node.type }
			});
		}
		visit(node.index, here);
	});
	visit(void 0, "");
	const dialog = snapshot.nodes.find((node) => target.platform === "ios" ? node.type === "Alert" : node.bundleId === "android" && /isn't responding|keeps stopping|has stopped/.test(node.label || ""))?.label;
	return {
		width: Number.isFinite(width) ? Math.round(width * scale) : 0,
		height: Number.isFinite(height) ? Math.round(height * scale) : 0,
		nodes,
		...dialog && { dialog }
	};
}
/** Whether an element matches a label: its whole text, or its description unless textOnly. A string is a regular expression. */
function matcher(label, textOnly = false, within) {
	const pattern = typeof label === "string" ? new RegExp(`^(?:${label})$`) : new RegExp(`^(?:${label.source})$`, label.flags);
	return (node) => (!within || within(node.b)) && (pattern.test(node.text || "") || !textOnly && pattern.test(node.desc || ""));
}
/** Tap the middle of an element's bounds. */
async function tapNode(target, node) {
	const [l, t, r, b] = node.b;
	await tapPoint(target, (l + r) / 2, (t + b) / 2);
}
/** Tap a point given in screenshot pixels. */
async function tapPoint(target, x, y) {
	const scale = scales.get(target) || 1;
	await (await agentDevice(target)).interactions.press({
		...selector(target),
		x: Math.round(x / scale),
		y: Math.round(y / scale)
	});
}
/** Swipe between two points in screenshot pixels. */
async function swipePoints(target, x1, y1, x2, y2, durationMs) {
	const scale = scales.get(target) || 1;
	await (await agentDevice(target)).interactions.pan({
		...selector(target),
		x: Math.round(x1 / scale),
		y: Math.round(y1 / scale),
		dx: Math.round((x2 - x1) / scale),
		dy: Math.round((y2 - y1) / scale),
		durationMs
	});
}
/** Back: Android's back key; on iOS, agent-device's back (the navigation bar's back button, or the edge swipe). */
async function goBack(target) {
	await (await agentDevice(target)).command.back(selector(target));
}
/** iOS: start the app afresh with launch arguments, through agent-device (which reads the screen within that session). */
async function openApp(target, app, launchArgs = [], relaunch = true) {
	await (await agentDevice(target)).apps.open({
		...selector(target),
		app,
		launchArgs,
		relaunch
	});
}
/** Type into the focused field. */
async function typeText(target, text) {
	await (await agentDevice(target)).interactions.type({
		...selector(target),
		text
	});
}
var TEXT_CLASS, selector, scales, clients, TapMap;
var init_screen = __esmMin((() => {
	TEXT_CLASS = /(TextView|Button|EditText|CheckBox|RadioButton|Switch|Chip|StaticText|TextField|TextView|Link|Cell)$/;
	selector = (target) => target.platform === "ios" ? {
		platform: "ios",
		udid: target.udid
	} : {
		platform: "android",
		serial: target.serial
	};
	scales = /* @__PURE__ */ new WeakMap();
	clients = /* @__PURE__ */ new Map();
	TapMap = class {
		recording;
		paths;
		seen = /* @__PURE__ */ new Map();
		constructor(file, recording, read) {
			this.recording = recording;
			const text = read(file);
			this.paths = text ? JSON.parse(text) : {};
			if (!recording && !text) throw new Error(`No tap map at ${file}: capture the default language first.`);
		}
		/** The next numbered slot for a key: taps with the same key are numbered in order. */
		slot(key) {
			const n = this.seen.get(key) || 0;
			this.seen.set(key, n + 1);
			return `${key}#${n}`;
		}
		resolve(key, nodes, matches) {
			const n = this.seen.get(key) || 0, slot = `${key}#${n}`;
			let node;
			if (this.recording) {
				node = nodes.find(matches);
				if (!node) throw new Error(`Nothing on screen matches "${key.split("|").pop()}"`);
				this.paths[slot] = node.path;
			} else {
				const path = this.paths[slot];
				if (!path) throw new Error(`No recorded tap for ${slot}: capture this scene in the default language first.`);
				node = nodes.find((candidate) => candidate.path === path);
				if (!node) throw new Error(`The recorded tap ${slot} has no element at ${path} here: the screen differs from the default language.`);
			}
			this.seen.set(key, n + 1);
			return node;
		}
		/** Record a value under a key (default language), e.g. how far a scroll went. */
		put(key, value) {
			this.paths[this.slot(key)] = value;
		}
		/** The value recorded under a key, replayed in another language. */
		take(key) {
			const slot = this.slot(key), value = this.paths[slot];
			if (value === void 0) throw new Error(`Nothing recorded for ${slot}: capture this scene in the default language first.`);
			return value;
		}
		json() {
			return JSON.stringify(Object.fromEntries(Object.entries(this.paths).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n";
		}
	};
}));
// src/node/capture/tour.ts
var tour_exports = /* @__PURE__ */ __exportAll({
	loadTour: () => loadTour,
	runTour: () => runTour
});
async function loadTour(file) {
	const tour = (await import(`${(0, node_url.pathToFileURL)(node_path.default.resolve(file)).href}?${node_fs.default.statSync(file).mtimeMs}`)).default;
	if (!tour?.app || !tour.scenes && !tour.run) throw new Error(`${file} must export default {app, scenes} (see the Tour type in studio/types.d.ts).`);
	return tour;
}
/** Run a tour for one language; returns the captures written, relative to the listing. */
async function runTour(file, options) {
	const log = options.log || ((line) => console.log(line));
	const tour = await loadTour(file);
	const read = (relative) => JSON.parse(node_fs.default.readFileSync(node_path.default.join(options.listing, relative), "utf8"));
	const config = read("studio.json"), profiles = read("profiles.json");
	const defaultLocale = config.defaultLocale || "en-US";
	const ios = config.capture?.platform === "ios";
	const sizes = Object.entries(profiles).filter(([name, p]) => p.captureWidth && p.captureHeight && (ios ? p.platform === "ios" : p.captureDensity && p.platform !== "ios") && (!options.profiles?.length || options.profiles.includes(name)));
	if (!sizes.length) throw new Error(`No profile to capture${options.profiles?.length ? ` among ${options.profiles.join(", ")}` : ""}: give one captureWidth and captureHeight, ` + (ios ? "with \"platform\": \"ios\" and its \"simulator\"," : "and captureDensity,") + " in profiles.json.");
	let emu = null;
	const sims = /* @__PURE__ */ new Map();
	let sim = null;
	if (!ios) {
		const serial = options.serial || "";
		const problem = missingEmulator(serial);
		if (problem) throw new Error(problem);
		emu = new Emulator(serial);
		if (tour.battery !== void 0) emu.battery = tour.battery;
		if (!emu.isEmulator()) throw new Error(`${serial} is not an emulator. Captures run only on emulators, never on a phone.`);
	}
	const android = () => {
		if (!emu) throw new Error("This is Android only: the tour is capturing on iOS simulators.");
		return emu;
	};
	const simulator = () => {
		if (!sim) throw new Error("This is iOS only: the tour is capturing on an Android emulator.");
		return sim;
	};
	/** The device agent-device reads and drives, for the profile being captured. */
	let target = ios ? {
		platform: "ios",
		udid: ""
	} : {
		platform: "android",
		serial: options.serial || ""
	};
	const screenshot = () => ios ? simulator().screenshot() : android().screenshot();
	/** iOS: the .app the tour or studio.json installs, to install on each simulator and to start afresh from. */
	const apps = [...options.install || [], ...tour.install ? [node_path.default.resolve(options.listing, tour.install)] : []];
	const appLocale = tour.appLocale !== false, offline = tour.offline !== false;
	const recording = options.locale === defaultLocale;
	const mapFile = node_path.default.join(options.listing, defaultLocale, "raw", "tap-map.json");
	const taps = tour.tapMap === false ? null : new TapMap(mapFile, recording, (file) => node_fs.default.existsSync(file) ? node_fs.default.readFileSync(file, "utf8") : null);
	const written = [];
	let profile = "";
	/** Where a label may be: a band of the screen (fractions of its height) and any test of the bounds. */
	const region = ({ above, below, within }) => above === void 0 && below === void 0 && !within ? void 0 : (b) => (above === void 0 || b[1] < d.height * above) && (below === void 0 || b[1] >= d.height * below) && (!within || within(b));
	const slotOf = (kind, label, key) => `${profile}|${d.theme}|${kind}${key || (typeof label === "string" ? label : label.source)}`;
	const where = () => `(${options.locale}, ${profile}, ${d.theme})`;
	const d = {
		app: tour.app,
		platform: ios ? "ios" : "android",
		locale: options.locale,
		defaultLocale,
		profile: "",
		width: 0,
		height: 0,
		theme: "light",
		serial: options.serial || "",
		options: options.options || {},
		raw: node_path.default.join(options.listing, options.locale, "raw"),
		async settle(max = 4e3) {
			let last = screenshot();
			for (const end = Date.now() + max; Date.now() < end;) {
				await sleep(250);
				const frame = screenshot();
				if (frame.equals(last)) return;
				last = frame;
			}
		},
		async waitUntil(test, { timeout = 3e4, interval = 1e3, message } = {}) {
			for (const end = Date.now() + timeout;; await sleep(interval)) {
				if (await test()) return;
				if (Date.now() > end) throw new Error(`${message || "What the tour waits for never happened"} ${where()}`);
			}
		},
		async launch({ clear = false, wait = 0, activity = tour.activity, extras = {} } = {}) {
			if (ios) {
				const device = simulator();
				if (clear && apps.length) {
					device.try("uninstall", device.udid, tour.app);
					for (const app of apps) device.install(app);
				}
				const args = Object.entries(extras).flatMap(([key, value]) => [`-${key}`, typeof value === "boolean" ? value ? "YES" : "NO" : String(value)]);
				await openApp(target, tour.app, [...args, ...appLocale ? appleLanguage(options.locale) : []]);
			} else {
				const emu = android();
				if (clear) {
					emu.shell("am", "force-stop", tour.app);
					emu.shell("pm", "clear", tour.app);
					if (appLocale) emu.appLocale(tour.app, options.locale);
				}
				const component = activity ? activity.includes("/") ? activity : `${tour.app}/${activity}` : null;
				const flags = Object.entries(extras).flatMap(([key, value]) => [
					typeof value === "boolean" ? "--ez" : typeof value === "number" ? "--ei" : "--es",
					key,
					String(value)
				]);
				for (let attempt = 0;; attempt++) {
					emu.shell("am", "force-stop", tour.app);
					if (component) emu.shell("am", "start", "-W", "-n", component, ...flags);
					else emu.shell("monkey", "-p", tour.app, "-c", "android.intent.category.LAUNCHER", "1");
					try {
						await d.waitUntil(() => d.topActivity().includes(tour.app), {
							timeout: 15e3,
							interval: 500
						});
						break;
					} catch {
						if (attempt === 2) throw new Error(`${tour.app} did not come to the front ${where()}`);
					}
				}
			}
			await sleep(wait);
			await d.settle(6e3);
		},
		async tap(label, { textOnly = false, timeout = 1e4, wait = 0, key, above, below, within } = {}) {
			const matches = matcher(label, textOnly, region({
				above,
				below,
				within
			}));
			const slot = slotOf("", label, key);
			let node;
			for (const end = Date.now() + timeout; !node; await sleep(500)) try {
				const { nodes } = await readTree(target);
				node = taps ? taps.resolve(slot, nodes, matches) : nodes.find(matches);
				if (!node) throw new Error(`Nothing on screen matches "${label}"`);
			} catch (error) {
				if (Date.now() > end) throw new Error(`${error.message} ${where()}. npx screenshot-studio screen shows what is there.`);
			}
			await tapNode(target, node);
			await sleep(wait);
			await d.settle();
		},
		async tapAt(x, y) {
			if (ios) await tapPoint(target, x, y);
			else android().shell("input", "tap", Math.round(x), Math.round(y));
			await d.settle();
		},
		async isVisible(label, { textOnly = false, above, below } = {}) {
			return (await readTree(target)).nodes.some(matcher(label, textOnly, region({
				above,
				below
			})));
		},
		async waitFor(label, { textOnly = false, timeout = 1e4, key } = {}) {
			const slot = slotOf("wait ", label, key);
			const path = taps && !taps.recording ? taps.take(slot) : void 0;
			const matches = path ? (node) => node.path === path : matcher(label, textOnly);
			for (const end = Date.now() + timeout; Date.now() < end; await sleep(500)) {
				const node = (await readTree(target)).nodes.find(matches);
				if (node) {
					if (taps?.recording) taps.put(slot, node.path);
					return;
				}
			}
			throw new Error(`"${label}" never appeared ${where()}.`);
		},
		async back() {
			if (ios) await goBack(target);
			else android().shell("input", "keyevent", "KEYCODE_BACK");
			await d.settle();
		},
		async scroll(fraction = .5, { start = .8, x = .5, up = false, duration = 300 } = {}) {
			const [a, b] = up ? [start - fraction, start] : [start, start - fraction];
			await d.swipe(d.width * x, d.height * a, d.width * x, d.height * b, { duration });
		},
		async drag(distance) {
			const start = Math.floor(d.height * .8);
			await d.swipe(Math.floor(d.width / 2), start, Math.floor(d.width / 2), start - distance, { duration: 1400 });
		},
		async scrollTo(label, top, { textOnly = false, key } = {}) {
			const attempts = 12;
			const slop = ios ? Math.round(10 * d.width / 400) : Math.round(8 * android().density / 160), goal = d.height * top;
			let scrolled = 0;
			const move = async (distance) => {
				if (distance > 0) await d.drag(Math.min(Math.floor(distance), Math.floor(d.height * .55)) + slop);
				else await d.swipe(d.width / 2, d.height * .3, d.width / 2, d.height * .3 - distance + slop, { duration: 1400 });
				scrolled += distance > 0 ? Math.min(Math.floor(distance), Math.floor(d.height * .55)) : distance;
			};
			const align = async (matches, search) => {
				let last;
				for (let i = 0; i < attempts; i++) {
					const node = (await readTree(target)).nodes.find(matches);
					if (!node) {
						if (!search) return null;
						await move(d.height * .5);
						continue;
					}
					const y = node.b[1];
					if (Math.abs(y - goal) <= 8 || y === last) return node;
					last = y;
					await move(y - goal);
				}
				return null;
			};
			const slot = slotOf("scroll ", label, key);
			if (taps && !taps.recording) {
				const [distance, path] = taps.take(slot).split(" ");
				for (let left = Number(distance); Math.abs(left) > 8;) {
					const step = left > 0 ? Math.min(left, Math.floor(d.height * .55)) : left;
					await move(step);
					left -= step;
				}
				await align((node) => node.path === path, false);
				return;
			}
			const node = await align(matcher(label, textOnly), true);
			if (!node) throw new Error(`Could not scroll to "${label}" ${where()}.`);
			taps?.put(slot, `${scrolled} ${node.path}`);
		},
		appFiles: () => android().try("run-as", tour.app, "ls", "files"),
		topActivity: () => android().try("dumpsys", "activity", "activities").split("topResumedActivity=").slice(1).join("").slice(0, 200),
		async swipe(x1, y1, x2, y2, { duration = 300 } = {}) {
			if (ios) await swipePoints(target, x1, y1, x2, y2, duration);
			else android().shell("input", "swipe", ...[
				x1,
				y1,
				x2,
				y2
			].map(Math.round), duration);
			await d.settle();
		},
		async type(text) {
			if (ios) await typeText(target, text);
			else android().shell("input", "text", text.replace(/ /g, "%s").replace(/([\\'"&|<>;()$`])/g, "\\$1"));
			await d.settle();
		},
		async night(on) {
			const device = ios ? simulator() : android();
			await device.night(on);
			d.theme = device.theme;
			device.statusBar();
		},
		async rotate(landscape) {
			await android().rotate(landscape);
		},
		async resize(width, height, density) {
			const emu = android();
			await emu.resize(width, height, density ?? emu.density);
			d.width = width;
			d.height = height;
			target = {
				...target,
				width
			};
		},
		setClock(hhmm) {
			android().setClock(hhmm);
		},
		async openUrl(url) {
			simulator().simctl("openurl", simulator().udid, url);
			await d.settle();
		},
		privacy(action, service) {
			simulator().simctl("privacy", simulator().udid, action, service, tour.app);
		},
		simctl: (...words) => simulator().simctl(...words),
		async shot(name, { settle = 0, animated = false, check } = {}) {
			await d.settle();
			await sleep(settle);
			const relative = node_path.default.posix.join(options.locale, "raw", profile, `${name}.png`);
			if (options.only?.length && !options.only.includes(name)) return null;
			const tree = await readTree(target);
			if (tree.dialog) throw new Error(`${relative}: a system dialog is on screen: ${tree.dialog}`);
			if (check && check(tree.nodes) === false) throw new Error(`${relative}: the screen failed its check`);
			if (tour.check && tour.check(tree.nodes, d) === false) throw new Error(`${relative}: the screen failed the tour's check`);
			const motion = animated && emu;
			if (motion) for (const key of SCALES) emu.setting("global", key, "1");
			if (animated) await sleep(4500);
			let png;
			try {
				png = screenshot();
			} finally {
				if (motion) for (const key of SCALES) emu.setting("global", key, "0");
			}
			const size = {
				width: png.readUInt32BE(16),
				height: png.readUInt32BE(20)
			};
			if (size.width !== d.width || size.height !== d.height) throw new Error(`${relative} came out ${size.width}×${size.height}, not the ${profile} size ${d.width}×${d.height}: the display did not take the profile's size.`);
			const file = node_path.default.join(options.listing, relative);
			node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
			node_fs.default.writeFileSync(file, png);
			node_fs.default.writeFileSync(file.replace(/\.png$/, ".nodes.json"), JSON.stringify({
				source: "agent-device",
				width: size.width,
				height: size.height,
				nodes: tree.nodes
			}) + "\n");
			written.push(relative);
			log(`captured  ${relative}`);
			return relative;
		},
		async tree() {
			return (await readTree(target)).nodes;
		},
		studio(...args) {
			if ((0, node_child_process.spawnSync)(process.execPath, [node_path.default.join(STUDIO_DIR, "studio.cjs"), ...args], {
				cwd: options.listing,
				stdio: "inherit"
			}).status !== 0) throw new Error(`screenshot-studio ${args.join(" ")} failed`);
		},
		shell: (...words) => android().shell(...words),
		adb: (...words) => android().adb(...words),
		sleep: (ms) => sleep(ms).then(() => void 0)
	};
	const step = async (fn) => fn ? fn(d) : void 0;
	try {
		if (emu) {
			emu.prepare({
				offline,
				animations: tour.animations !== false
			});
			if (tour.install) emu.install(node_path.default.resolve(options.listing, tour.install), tour.app);
			if (appLocale) emu.appLocale(tour.app, options.locale);
		}
		await step(tour.setup);
		for (const [name, p] of sizes) {
			profile = d.profile = name;
			d.width = p.captureWidth;
			d.height = p.captureHeight;
			if (emu) {
				await emu.resize(p.captureWidth, p.captureHeight, p.captureDensity);
				target = {
					platform: "android",
					serial: emu.serial,
					width: d.width
				};
			} else {
				const wanted = p.simulator || options.simulator || config.capture?.simulator;
				if (!wanted) throw new Error(`No simulator for ${name}: set "simulator" on the profile in profiles.json, or "capture": {"simulator": "…"} in studio.json`);
				if (!sims.has(wanted)) {
					log(`simulator ${wanted}`);
					const opened = Simulator.open(wanted);
					if (tour.battery !== void 0) opened.battery = tour.battery;
					sims.set(wanted, opened);
					opened.prepare();
					for (const app of apps) opened.install(app);
				}
				sim = sims.get(wanted);
				d.serial = sim.udid;
				target = {
					platform: "ios",
					udid: sim.udid,
					width: d.width
				};
			}
			if (tour.run) {
				await step(tour.run);
				continue;
			}
			const scenesHere = tour.profiles?.[name] || tour.scenes;
			for (const theme of ["light", "dark"]) {
				const scenes = scenesHere[theme];
				if (!scenes) continue;
				await d.night(theme === "dark");
				await (tour.start ? step(tour.start) : d.launch({ clear: true }));
				for (const [scene, reach] of Object.entries(scenes)) if (await step(reach) !== false) await d.shot(scene, {
					settle: tour.settle,
					animated: tour.animated?.includes(scene)
				});
			}
		}
	} finally {
		try {
			await step(tour.teardown);
		} catch (error) {
			log(`teardown: ${error.message}`);
		}
		if (taps?.recording) {
			node_fs.default.mkdirSync(node_path.default.dirname(mapFile), { recursive: true });
			node_fs.default.writeFileSync(mapFile, taps.json());
		}
		const failures = [...emu ? emu.restore({
			pkg: tour.app,
			appLocale,
			offline,
			uninstall: tour.uninstall
		}) : [], ...[...sims.values()].flatMap((device) => device.restore({
			bundle: tour.app,
			uninstall: tour.uninstall
		}))];
		for (const failure of failures) log(`cleanup: ${failure}`);
	}
	return written;
}
var init_tour = __esmMin((() => {
	init_recapture();
	init_project();
	init_emulator$1();
	init_screen();
	init_simulator();
}));
// src/node/recapture.ts
/**
* Rebuild the capture app, capture on the emulator or simulator, and export, as studio.json's "capture" block says:
*   npx screenshot-studio recapture [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]
* Without locales every locale in studio.json is exported, and captured where a run asks for it.
*
*   "capture": {
*     "build": "./gradlew :app:assembleStoreCapture",               shell command, run from the repository
*     "install": [{"apk": "app/build/…/app-storeCapture.apk", "package": "com.example.storecapture"}],
*     "runs": [{"options": {"theme": "dark"},                        the tour's d.options; ${NAME} reads an environment variable
*               "profiles": ["phone", "tablet7"],                    default: every capture profile
*               "locales": "default"}],                              "all" (default), "default" or a list
*     "retries": 2,                                                  per capture run
*     "serial": "emulator-5578",                                     the capture emulator (or CAPTURE_SERIAL)
*     "avd": "Pixel_9_API_36",                                       what --boot starts when it isn't running
*     "platform": "ios",                                             capture on iOS simulators instead (below)
*     "simulator": "iPhone 17 Pro Max",                              iOS: for profiles that name none
*     "export": "cd store-listing && node render.mjs --locale {locale}",  instead of the studio's export, per locale
*     "after": ["node scripts/refresh-readme.mjs"]                   shell commands once everything is exported
*   }
*
* Both platforms run store-listing/capture.tour.mjs in the studio itself (capture/tour.ts, on agent-device), per run
* and locale. The default locale goes first, since it records the tap map other locales replay. --boot starts the
* capture emulator headless when it isn't running and waits for it.
*
* iOS ("platform": "ios"): install entries are {"app": "build/…/App.app", "package": "<bundle ID>"}, installed on each
* simulator the capture profiles use (profiles.json's "platform": "ios" ones with a capture size, each on its
* "simulator"); --boot boots those simulators first and leaves them running.
*/
var recapture_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_SERIAL: () => DEFAULT_SERIAL,
	bootEmulator: () => bootEmulator,
	booted: () => booted,
	commandEnvironment: () => commandEnvironment,
	missingEmulator: () => missingEmulator,
	recapture: () => recapture,
	run: () => run$8,
	tourFile: () => tourFile
});
/** What the build, export and after commands get from the studio: the app's listing, the CLI, Playwright. */
function commandEnvironment(listing) {
	return {
		SCREENSHOT_STUDIO_LISTING: listing,
		SCREENSHOT_STUDIO: node_path.default.join(STUDIO_DIR, "studio.cjs"),
		...findPlaywright() ? { PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || findPlaywright() } : {}
	};
}
/** The listing's tour, store-listing/capture.tour.mjs; a Python tour from older versions is named, with what to do. */
function tourFile(listing) {
	const file = node_path.default.join(listing, "capture.tour.mjs");
	if (node_fs.default.existsSync(file)) return file;
	const old = ["capture-emulator.py", "capture-simulator.py"].find((name) => node_fs.default.existsSync(node_path.default.join(listing, name)));
	if (old) throw new Error(`store-listing/${old} is a Python tour, which this version no longer runs. Write its scenes as store-listing/capture.tour.mjs (docs/capture.md shows the shape), then delete ${old}.`);
	throw new Error("No capture tour: write store-listing/capture.tour.mjs (docs/capture.md shows the shape).");
}
/** Whether the emulator is attached and has finished booting. */
function booted(serial) {
	return adb(serial, "shell", "getprop", "sys.boot_completed").stdout?.trim() === "1";
}
/** Why the capture emulator can't be used and the ways forward, or null when it has booted. */
function missingEmulator(serial) {
	if (booted(serial)) return null;
	const devices = ((0, node_child_process.spawnSync)("adb", ["devices"], { encoding: "utf8" }).stdout || "").split("\n").slice(1).map((line) => line.split("	")).filter(([id, state]) => id && state === "device").map(([id]) => id);
	return [
		`The capture emulator ${serial} isn't running.`,
		`  Start a dedicated one: npx screenshot-studio recapture --boot   (boots an emulator as ${serial})`,
		...devices.filter((id) => id.startsWith("emulator-") && id !== serial).map((id) => `  Or capture on ${id}: add --serial ${id}   (its display size, language and demo mode change during the capture and are restored after)`),
		"Captures run only on emulators, never on a phone."
	].join("\n");
}
/** Start an emulator headless on the serial's port and wait until Android has booted. */
async function bootEmulator(serial, avd, log) {
	if (booted(serial)) return;
	const port = Number(serial.replace("emulator-", ""));
	if (!Number.isInteger(port)) throw new Error(`Can't boot ${serial}: the serial must look like emulator-5578`);
	const emulator = node_path.default.join(sdkRoot(), "emulator", "emulator");
	if (!node_fs.default.existsSync(emulator)) throw new Error("No Android emulator found. Set ANDROID_HOME to your Android SDK.");
	const images = (0, node_child_process.spawnSync)(emulator, ["-list-avds"], { encoding: "utf8" }).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
	const name = avd || images[0];
	if (!name) throw new Error("No emulator image (AVD) found. Create one in Android Studio, then set \"capture\": {\"avd\": \"…\"} in studio.json.");
	if (!images.includes(name)) throw new Error(`No emulator image named ${name}. Available: ${images.join(", ") || "none"}`);
	log(`Booting ${name} as ${serial} (headless)…`);
	(0, node_child_process.spawn)(emulator, [
		"-avd",
		name,
		"-port",
		String(port),
		"-no-window",
		"-no-audio",
		"-no-boot-anim"
	], {
		detached: true,
		stdio: "ignore"
	}).unref();
	const deadline = Date.now() + 3e5;
	while (!booted(serial)) {
		if (Date.now() > deadline) throw new Error(`${serial} did not finish booting in 5 minutes`);
		await new Promise((resolve) => setTimeout(resolve, 3e3));
	}
	for (const args of [
		[
			"wm",
			"size",
			"reset"
		],
		[
			"wm",
			"density",
			"reset"
		],
		[
			"cmd",
			"uimode",
			"night",
			"no"
		]
	]) adb(serial, "shell", ...args);
	log(`${serial} is ready.`);
}
async function recapture(options = {}) {
	const log = options.log || ((line) => console.log(line));
	const listing = requireListing(options.listing);
	const { config, profiles, repo, defaultLocale, locales: configured } = loadListing(listing);
	const capture = config.capture;
	const locales = options.locales?.length ? [...options.locales] : [...configured];
	const result = {
		ok: false,
		locales,
		failedExports: []
	};
	try {
		if (!capture) throw new Error("studio.json has no \"capture\" block; see docs/capture.md");
		const ios = capture.platform === "ios";
		const serial = options.serial || capture.serial || process.env.CAPTURE_SERIAL || "emulator-5578";
		if (!ios && !serial.startsWith("emulator-")) throw new Error("Use a capture emulator, never a physical phone.");
		const simulator = options.simulator || capture.simulator || process.env.CAPTURE_SIMULATOR;
		const unknown = locales.filter((locale) => !configured.includes(locale));
		if (unknown.length) throw new Error(`Not in studio.json locales: ${unknown.join(", ")}`);
		locales.sort((a, b) => Number(b === defaultLocale) - Number(a === defaultLocale));
		const captureProfiles = Object.keys(profiles).filter((name) => ios ? profiles[name].platform === "ios" && profiles[name].captureWidth : profiles[name].captureDensity);
		if (options.profile && !profiles[options.profile]?.captureWidth) throw new Error(`No capture profile ${options.profile} in profiles.json`);
		const env = {
			...process.env,
			...commandEnvironment(listing),
			...ios ? {} : {
				CAPTURE_SERIAL: serial,
				ANDROID_SERIAL: serial
			}
		};
		const expand = (word) => String(word).replace(/\$\{(\w+)\}/g, (_, name) => {
			if (env[name] === void 0) throw new Error(`Set ${name} for this capture (studio.json capture options use it)`);
			return env[name];
		});
		const run = (command, { check = true } = {}) => {
			log(`\n$ ${command}`);
			if (options.dryRun) return true;
			const done = (0, node_child_process.spawnSync)("sh", ["-c", command], {
				cwd: repo,
				env,
				stdio: "inherit"
			});
			if (done.status !== 0 && check) throw new Error(`Failed (${done.status ?? done.signal}): ${command}`);
			return done.status === 0;
		};
		const sims = ios && options.capture !== false ? simulatorsFor(profiles, captureProfiles.filter((name) => !options.profile || name === options.profile), simulator) : [];
		if (options.build !== false && capture.build) run(capture.build);
		if (options.capture !== false) {
			const tour = tourFile(listing);
			if (options.boot && !options.dryRun) {
				if (ios) for (const sim of sims) await bootSimulator(sim, log);
				else await bootEmulator(serial, capture.avd, log);
			}
			if (!ios && !options.dryRun) {
				const problem = missingEmulator(serial);
				if (problem) throw new Error(problem);
			}
			const apps = [];
			for (const { apk, app, package: id } of capture.install || []) {
				const file = ios ? app : apk;
				if (!file) throw new Error(`capture.install needs ${ios ? "\"app\" (a simulator .app)" : "\"apk\""} for ${id}`);
				if (ios) apps.push(node_path.default.resolve(repo, file));
				else if (options.dryRun) log(`$ install ${file}`);
				else {
					new Emulator(serial).install(node_path.default.resolve(repo, file), id);
					log(`installed ${id}`);
				}
			}
			for (const locale of locales) for (const spec of capture.runs || [{}]) {
				const wanted = spec.locales || "all";
				if (wanted === "default" ? locale !== defaultLocale : Array.isArray(wanted) && !wanted.includes(locale)) continue;
				const runProfiles = (spec.profiles || captureProfiles).filter((name) => !options.profile || name === options.profile);
				if (!runProfiles.length) continue;
				if (options.dryRun) {
					log(`$ tour ${node_path.default.relative(repo, tour)} --locale ${locale} --profile ${runProfiles.join(",")}`);
					continue;
				}
				const tourOptions = Object.fromEntries(Object.entries(spec.options || {}).map(([key, value]) => [key, typeof value === "string" ? expand(value) : value]));
				const attempts = (capture.retries ?? 2) + 1;
				for (let attempt = 1;; attempt++) try {
					await runTour(tour, {
						listing,
						locale,
						profiles: runProfiles,
						serial,
						simulator,
						install: apps,
						options: tourOptions,
						log
					});
					break;
				} catch (error) {
					if (attempt === attempts) throw error;
					log(`Capture failed (${error.message.split("\n")[0]}); reset the ${ios ? "simulators" : "emulator"} and try again (${attempt + 1}/${attempts})`);
					if (ios) for (const sim of sims) {
						const found = findSimulator(sim);
						new Simulator(found.udid, found.name).reset();
					}
					else new Emulator(serial).reset();
				}
			}
		}
		if (options.export !== false) {
			result.failedExports = locales.filter((locale) => {
				if (capture.export) return !run(capture.export.replaceAll("{locale}", locale), { check: false });
				const args = [
					node_path.default.join(STUDIO_DIR, "studio.cjs"),
					"export",
					"--listing",
					listing,
					"--locale",
					locale
				];
				log(`\n$ ${[process.execPath, ...args].join(" ")}`);
				return !options.dryRun && (0, node_child_process.spawnSync)(process.execPath, args, {
					cwd: repo,
					env,
					stdio: "inherit"
				}).status !== 0;
			});
			if (result.failedExports.length) throw new Error(`Export failed for ${result.failedExports.join(", ")}; captures are in place. Fix those and export again.`);
			for (const command of capture.after || []) run(command);
		}
		log(`\nRecaptured ${locales.join(", ")}${options.dryRun ? " (dry run)" : ""}.`);
		result.ok = true;
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	return result;
}
/** `recapture [locale…] [--profile phone] [--simulator name] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]` */
async function run$8(argv) {
	const flag = (name) => argv.includes(`--${name}`);
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const values = new Set([
		"profile",
		"serial",
		"simulator",
		"listing"
	].map(option).filter(Boolean));
	const result = await recapture({
		locales: argv.filter((word) => !word.startsWith("--") && !values.has(word)),
		profile: option("profile"),
		serial: option("serial"),
		simulator: option("simulator"),
		listing: option("listing"),
		boot: flag("boot"),
		build: !flag("no-build"),
		capture: !flag("no-capture"),
		export: !flag("no-export"),
		dryRun: flag("dry-run")
	});
	if (result.error) console.error(result.error);
	return result.ok ? 0 : 1;
}
var DEFAULT_SERIAL, sdkRoot, adb;
var init_recapture = __esmMin((() => {
	init_emulator$1();
	init_simulator();
	init_tour();
	init_project();
	init_ios();
	init_playwright();
	DEFAULT_SERIAL = "emulator-5578";
	sdkRoot = () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || [node_path.default.join(node_os.default.homedir(), "Library/Android/sdk"), node_path.default.join(node_os.default.homedir(), "Android/Sdk")].find((dir) => node_fs.default.existsSync(dir)) || "";
	adb = (serial, ...args) => (0, node_child_process.spawnSync)("adb", [
		"-s",
		serial,
		...args
	], { encoding: "utf8" });
}));
// src/core/layout.ts
init_export();
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
// src/node/init.ts
/**
* Set up Screenshot Studio in an app.
*   npx screenshot-studio init [app-folder] [--name "My App"] [--package com.example.app] [--theme starter]
*                              [--screenshots ./folder] [--locales en-US,de-DE] [--platform android|ios]
* `init` creates store-listing/ (never overwriting a file) and installs the agent skill. With
* --screenshots builds the galleries from images you already have, so the first cards render with no emulator: a folder
* (number the files to set the order) or a comma-separated list of files in card order.
* --platform ios makes App Store galleries (iPhone 6.9″ and 6.3″, iPad 13″) and an iOS simulator tour instead.
*/
var init_exports = /* @__PURE__ */ __exportAll({
	existingScreenshots: () => existingScreenshots,
	init: () => init,
	installTheme: () => installTheme,
	run: () => run$7,
	screenshotSets: () => screenshotSets,
	themes: () => themes
});
/** Every theme the package ships, with its one-line description. */
function themes() {
	if (!node_fs.default.existsSync(THEMES)) return [];
	return node_fs.default.readdirSync(THEMES).filter((name) => node_fs.default.existsSync(node_path.default.join(THEMES, name, "theme.css"))).sort().map((name) => {
		const first = node_fs.default.readFileSync(node_path.default.join(THEMES, name, "theme.css"), "utf8").match(/\/\*\s*([^*]+?)\s*\*\//);
		return {
			name,
			description: first ? first[1].replace(/^\{\{name\}\}:\s*/, "").split("\n")[0] : ""
		};
	});
}
function setsOf(byLocale, folder, title) {
	const locales = Object.keys(byLocale).filter((locale) => byLocale[locale].length).sort();
	if (!locales.length) return null;
	const reference = locales.includes("en-US") ? "en-US" : locales[0];
	return {
		byLocale: Object.fromEntries(locales.map((locale) => [locale, byLocale[locale]])),
		reference,
		folder,
		title
	};
}
/**
* Screenshots the app already has, in every language, where store tools keep them: fastlane's (supply for Play,
* snapshot/deliver for the App Store), then a screenshots/ folder. Also the app's name, when fastlane has it.
*/
function existingScreenshots(app, ios = false) {
	const languages = (folder) => node_fs.default.existsSync(node_path.default.join(app, folder)) ? node_fs.default.readdirSync(node_path.default.join(app, folder)).filter((name) => LOCALE_DIR.test(name)) : [];
	const byLocale = {};
	if (ios) {
		for (const locale of languages("fastlane/screenshots")) (byLocale[locale] ||= []).push(...imagesIn(node_path.default.join(app, "fastlane/screenshots", locale)));
		for (const locale of languages("fastlane/metadata")) (byLocale[locale] ||= []).push(...imagesIn(node_path.default.join(app, "fastlane/metadata", locale, "screenshots")));
	} else for (const locale of languages("fastlane/metadata/android")) for (const kind of [
		"phoneScreenshots",
		"sevenInchScreenshots",
		"tenInchScreenshots"
	]) (byLocale[locale] ||= []).push(...imagesIn(node_path.default.join(app, "fastlane/metadata/android", locale, "images", kind)));
	const title = (locale) => {
		const file = node_path.default.join(app, ios ? `fastlane/metadata/${locale}/name.txt` : `fastlane/metadata/android/${locale}/title.txt`);
		return node_fs.default.existsSync(file) ? node_fs.default.readFileSync(file, "utf8").trim().split("\n")[0] || void 0 : void 0;
	};
	const fastlane = setsOf(byLocale, node_path.default.join(app, "fastlane"));
	if (fastlane) return {
		...fastlane,
		title: title(fastlane.reference)
	};
	for (const folder of [
		"screenshots",
		"docs/screenshots",
		"store/screenshots"
	]) {
		const found = screenshotSets(node_path.default.join(app, folder));
		if (found) return found;
	}
	return null;
}
/** A --screenshots folder: its own images (one language), or one subfolder per language (en-US/, de-DE/…). */
function screenshotSets(folder) {
	if (!node_fs.default.existsSync(folder) || !node_fs.default.statSync(folder).isDirectory()) return null;
	const own = imagesIn(folder);
	if (own.length) return setsOf({ "en-US": own }, folder);
	return setsOf(Object.fromEntries(node_fs.default.readdirSync(folder).filter((name) => LOCALE_DIR.test(name)).map((locale) => [locale, imagesIn(node_path.default.join(folder, locale))])), folder);
}
/** Which gallery an image belongs to, by its shape. */
function galleryFor(width, height) {
	const ratio = height / width;
	if (ratio >= 1.75) return {
		kind: "phone",
		profile: {
			width: 1080,
			height: 1920,
			frame: "phone",
			label: "Phone"
		}
	};
	if (ratio >= 1.15) return {
		kind: "tablet7",
		profile: {
			width: 1200,
			height: 1920,
			frame: "tablet",
			label: "7″ tablet"
		}
	};
	if (ratio <= 1 / 1.15) return {
		kind: "tablet10",
		profile: {
			width: 1920,
			height: 1200,
			frame: "tablet",
			label: "10″ tablet"
		}
	};
	return null;
}
/** Galleries, profiles and words from a folder of images, copied into <locale>/raw/<gallery>/. */
/**
* The images to import, in card order: a folder's images sorted naturally (so 2-x comes before 10-x; number the files
* to set the order), or a comma-separated list of files in the order given.
*/
function screenshotFiles(source) {
	if (source.includes(",") || node_fs.default.existsSync(source) && node_fs.default.statSync(source).isFile()) {
		const files = source.split(",").map((file) => node_path.default.resolve(file.trim()));
		for (const file of files) if (!node_fs.default.existsSync(file) || !isImage(file)) throw new Error(`${file} isn't a PNG, JPEG or WebP image`);
		return {
			folder: "",
			images: files
		};
	}
	const folder = node_path.default.resolve(source);
	const images = node_fs.default.readdirSync(folder).filter(isImage).sort((a, b) => a.localeCompare(b, void 0, {
		numeric: true,
		sensitivity: "base"
	}));
	if (!images.length) throw new Error(`No PNG, JPEG or WebP images in ${folder}`);
	return {
		folder,
		images
	};
}
function importScreenshots(source, listing, locale, log, ios = false) {
	const { folder, images } = screenshotFiles(source);
	const profiles = {}, galleries = {}, copy = {};
	for (const image of images) {
		const source = node_path.default.join(folder, image), file = node_path.default.basename(image);
		const size = imageSize(source);
		const target = size && (ios ? iosGalleryFor : galleryFor)(size.width, size.height);
		if (!size || !target) {
			log(`skipped   ${file} (not a phone or tablet shape)`);
			continue;
		}
		const { kind, profile } = target;
		if (!profiles[kind]) profiles[kind] = {
			...profile,
			captureWidth: size.width,
			captureHeight: size.height
		};
		else if (Math.abs(size.width / size.height - profiles[kind].captureWidth / profiles[kind].captureHeight) > .001) {
			log(`skipped   ${file} (${size.width}×${size.height} differs from the other ${kind} images)`);
			continue;
		}
		const cards = galleries[kind] ||= [];
		const feature = cards.some((card) => card.feature === slug(file)) ? `${slug(file)}-${cards.length + 1}` : slug(file);
		const raw = `${kind}/${String(cards.length + 1).padStart(2, "0")}-${feature}${node_path.default.extname(file).toLowerCase()}`;
		node_fs.default.mkdirSync(node_path.default.join(listing, locale, "raw", kind), { recursive: true });
		node_fs.default.copyFileSync(source, node_path.default.join(listing, locale, "raw", raw));
		cards.push({
			feature,
			raw,
			layout: "big"
		});
		copy[feature] ||= {
			title: `Your headline\nabout *${words(file)}*`,
			body: "One short line on why it matters."
		};
		log(`imported  ${file} → ${locale}/raw/${raw}`);
	}
	if (!Object.keys(galleries).length) throw new Error(`None of the images in ${folder || "the list"} has a phone or tablet shape`);
	if (!ios && galleries.phone) Object.assign(profiles, featureGraphic.profiles), Object.assign(galleries, featureGraphic.gallery(galleries.phone[0].raw)), Object.assign(copy, featureGraphic.copy);
	if (ios && galleries.iphone) {
		const after = (map, value) => Object.fromEntries(Object.entries(map).flatMap(([key, v]) => key === "iphone" ? [[key, v], ["iphone63", value]] : [[key, v]]));
		return {
			profiles: after(profiles, { ...APP_STORE.iphone63 }),
			galleries: after(galleries, {
				inherits: "iphone",
				cards: galleries.iphone.map(() => ({}))
			}),
			copy
		};
	}
	return {
		profiles,
		galleries,
		copy
	};
}
/**
* Another language's screenshots onto the reference language's cards: the nth image of each gallery's shape becomes
* that gallery's nth capture, under the same name, so every card shows this language's own screen.
*/
function importLocale(images, listing, locale, imported, log, ios = false) {
	const used = {};
	let count = 0;
	for (const source of images) {
		const file = node_path.default.basename(source), size = imageSize(source);
		const kind = size && (ios ? iosGalleryFor : galleryFor)(size.width, size.height)?.kind;
		const cards = kind ? imported.galleries[kind] : void 0;
		if (!size || !kind || !Array.isArray(cards)) {
			log(`skipped   ${locale}/${file} (no ${kind || "phone or tablet"} gallery to match)`);
			continue;
		}
		const profile = imported.profiles[kind];
		if (Math.abs(size.width / size.height - profile.captureWidth / profile.captureHeight) > .001) {
			log(`skipped   ${locale}/${file} (${size.width}×${size.height} isn't the ${kind} shape)`);
			continue;
		}
		const card = cards[used[kind] = (used[kind] ?? -1) + 1];
		if (!card?.raw) {
			log(`skipped   ${locale}/${file} (more ${kind} screenshots than the reference language has)`);
			continue;
		}
		node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(listing, locale, "raw", card.raw)), { recursive: true });
		node_fs.default.copyFileSync(source, node_path.default.join(listing, locale, "raw", card.raw));
		count++;
	}
	log(`imported  ${count} screenshot(s) for ${locale}`);
	return count;
}
function init(options = {}) {
	requirePackage();
	const log = options.log || ((line) => console.log(line));
	const app = node_path.default.resolve(options.app || ".");
	const listing = node_path.default.join(app, "store-listing");
	const found = options.screenshots && !options.screenshots.includes(",") ? screenshotSets(node_path.default.resolve(options.screenshots)) : !options.screenshots && !options.package ? existingScreenshots(app, options.platform === "ios") : null;
	if (found) log(`found     screenshots in ${Object.entries(found.byLocale).map(([locale, images]) => `${locale} (${images.length})`).join(", ")} in ${node_path.default.relative(app, found.folder) || "."}`);
	const name = options.name || found?.title || node_path.default.basename(app);
	const pkg = options.package || "";
	const theme = options.theme || "starter";
	const ios = options.platform === "ios";
	if (options.platform && !["android", "ios"].includes(options.platform)) throw new Error(`Unknown platform "${options.platform}": use android or ios`);
	if (!node_fs.default.existsSync(node_path.default.join(THEMES, theme, "theme.css"))) throw new Error(`No theme "${theme}". Available: ${themes().map((t) => t.name).join(", ")}`);
	const reference = found?.reference || "en-US";
	const locales = [.../* @__PURE__ */ new Set([
		reference,
		...Object.keys(found?.byLocale || {}),
		...options.locales || []
	])];
	const result = {
		listing,
		created: [],
		kept: [],
		cards: 0,
		theme,
		locales
	};
	const sims = ios ? defaultSimulators() : null;
	const fill = (text) => text.replaceAll("{{name}}", name).replaceAll("{{package}}", pkg || "com.example.app").replaceAll("{{scheme}}", name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "myapp").replaceAll("{{iphoneSimulator}}", sims?.iphone || "").replaceAll("{{ipadSimulator}}", sims?.ipad || "");
	const write = (relative, content) => {
		const file = node_path.default.join(listing, relative);
		if (node_fs.default.existsSync(file)) {
			result.kept.push(relative);
			log(`kept      ${relative}`);
			return;
		}
		node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
		if (typeof content === "string") node_fs.default.writeFileSync(file, content);
		else writeJson(file, content);
		result.created.push(relative);
		log(`created   ${relative}`);
	};
	const source = (relative) => ios && node_fs.default.existsSync(node_path.default.join(IOS_TEMPLATES, relative)) ? node_path.default.join(IOS_TEMPLATES, relative) : node_path.default.join(TEMPLATES, relative);
	const template = (relative, target = relative) => write(target, fill(node_fs.default.readFileSync(source(relative), "utf8")));
	node_fs.default.mkdirSync(listing, { recursive: true });
	const config = {
		...readJson(node_path.default.join(TEMPLATES, "studio.json")),
		app: name,
		locales,
		defaultLocale: reference
	};
	if (pkg) config.package = pkg;
	else delete config.package;
	const screenshots = found ? found.byLocale[reference].join(",") : options.screenshots;
	if (screenshots) {
		const imported = importScreenshots(screenshots, listing, reference, log, ios);
		if (sims) {
			for (const [kind, profile] of Object.entries(imported.profiles)) if (profile.captureWidth) profile.simulator = kind === "iphone" ? sims.iphone : sims.ipad;
		}
		write("studio.json", config);
		write("profiles.json", {
			$schema: "https://unpkg.com/screenshot-studio/studio/schemas/profiles.schema.json",
			...imported.profiles
		});
		write("gallery.json", {
			$schema: "https://unpkg.com/screenshot-studio/studio/schemas/gallery.schema.json",
			...imported.galleries
		});
		write(`${reference}/copy.json`, {
			$schema: "https://unpkg.com/screenshot-studio/studio/schemas/copy.schema.json",
			...imported.copy
		});
		const blank = Object.fromEntries(Object.entries(imported.copy).map(([key, entry]) => [key, Object.fromEntries(Object.keys(entry).map((field) => [field, ""]))]));
		for (const locale of locales.filter((locale) => locale !== reference)) {
			if (found?.byLocale[locale]) importLocale(found.byLocale[locale], listing, locale, imported, log, ios);
			write(`${locale}/copy.json`, {
				$schema: "https://unpkg.com/screenshot-studio/studio/schemas/copy.schema.json",
				...blank
			});
		}
		result.cards = Object.values(imported.galleries).reduce((n, gallery) => n + (Array.isArray(gallery) ? gallery : gallery.cards).length, 0);
	} else {
		if (pkg && ios) config.capture = {
			platform: "ios",
			build: `xcodebuild -scheme "${name}" -configuration Debug -sdk iphonesimulator -derivedDataPath build/capture -quiet build`,
			install: [{
				app: `build/capture/Build/Products/Debug-iphonesimulator/${name}.app`,
				package: pkg
			}],
			runs: [{ locales: "all" }]
		};
		else if (pkg) config.capture = {
			build: "./gradlew :app:assembleStoreCapture -q",
			install: [{
				apk: "app/build/outputs/apk/storeCapture/app-storeCapture.apk",
				package: `${pkg}.storecapture`
			}],
			runs: [{ locales: "default" }]
		};
		write("studio.json", config);
		template("profiles.json");
		template("gallery.json");
		template("en-US/copy.json");
		if (pkg && !ios) template("capture.tour.mjs");
		result.cards = ios ? 5 : 4;
	}
	if (ios) template("capture.tour.mjs");
	template("en-US/listing.json", `${reference}/listing.json`);
	template("gitignore", ".gitignore");
	template("README.md");
	installTheme(listing, theme, {
		fill,
		write,
		result,
		ios
	});
	const skill = node_path.default.join(PACKAGE, "skills", "store-screenshots", "SKILL.md");
	if (node_fs.default.existsSync(skill) && !node_fs.default.existsSync(node_path.default.join(app, ".claude", "skills", "store-screenshots", "SKILL.md"))) {
		node_fs.default.mkdirSync(node_path.default.join(app, ".claude", "skills", "store-screenshots"), { recursive: true });
		node_fs.default.copyFileSync(skill, node_path.default.join(app, ".claude", "skills", "store-screenshots", "SKILL.md"));
		log("created   .claude/skills/store-screenshots/SKILL.md");
	}
	return result;
}
/**
* Copy a theme into a listing: theme.css and theme.js (with the app's name filled in; iOS galleries get their positions
* after the theme's own look) and its assets byte for byte. `write` decides whether existing files are kept.
*/
function installTheme(listing, theme, options) {
	if (!node_fs.default.existsSync(node_path.default.join(THEMES, theme, "theme.css"))) throw new Error(`No theme "${theme}". Available: ${themes().map((t) => t.name).join(", ")}`);
	for (const file of ["theme.css", "theme.js"]) {
		const from = node_path.default.join(THEMES, theme, file);
		const extra = options.ios && file === "theme.css" ? node_fs.default.readFileSync(node_path.default.join(IOS_TEMPLATES, "theme.css"), "utf8") : "";
		if (node_fs.default.existsSync(from)) options.write(file, options.fill(node_fs.default.readFileSync(from, "utf8") + extra));
		else if (options.overwrite) node_fs.default.rmSync(node_path.default.join(listing, file), { force: true });
	}
	for (const asset of node_fs.default.existsSync(node_path.default.join(THEMES, theme, "assets")) ? node_fs.default.readdirSync(node_path.default.join(THEMES, theme, "assets")) : []) {
		const target = node_path.default.join(listing, "assets", asset);
		if (node_fs.default.existsSync(target) && !options.overwrite) {
			options.result?.kept.push(`assets/${asset}`);
			continue;
		}
		node_fs.default.mkdirSync(node_path.default.dirname(target), { recursive: true });
		node_fs.default.copyFileSync(node_path.default.join(THEMES, theme, "assets", asset), target);
		options.result?.created.push(`assets/${asset}`);
	}
}
/** `init [app] [--name …] [--package …] [--theme …] [--screenshots folder] [--locales a,b]` */
async function run$7(argv) {
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const values = new Set([
		"name",
		"package",
		"theme",
		"screenshots",
		"locales",
		"platform"
	].map(option));
	const app = argv.find((word) => !word.startsWith("--") && !values.has(word));
	try {
		const result = init({
			app,
			name: option("name"),
			package: option("package"),
			theme: option("theme"),
			screenshots: option("screenshots"),
			locales: option("locales")?.split(",").map((l) => l.trim()).filter(Boolean),
			platform: option("platform")
		});
		const where = node_path.default.relative(process.cwd(), node_path.default.dirname(result.listing)) || ".";
		const cd = where === "." ? "" : `cd ${where} && `;
		console.log(`\nReady: ${result.cards} card(s) with the ${result.theme} theme.\n`);
		const others = result.locales.slice(1);
		console.log(option("screenshots") || result.cards ? `Next:\n  1. Write the headlines in store-listing/${result.locales[0]}/copy.json (one per card, *highlight* a key word)${others.length ? `\n  2. Translate them into the empty fields of ${others.map((l) => `${l}/copy.json`).join(", ")}` : ""}\n  ${others.length ? 3 : 2}. ${cd}npx screenshot-studio check, then export (or studio --open for the editor)` : option("platform") === "ios" ? `Next:\n  1. Make the app's Debug build open on fictional sample data (docs/capture.md, iOS)\n  2. Write the tour in store-listing/capture.tour.mjs (npx screenshot-studio screen --simulator NAME shows what to tap); check capture.build in studio.json\n  3. ${cd}npx screenshot-studio recapture --boot` : `Next:\n  1. Add a capture build that fills the app with sample data (docs/playbook.md, section 1)\n  2. Write the tour in store-listing/capture.tour.mjs (npx screenshot-studio screen shows what to tap)\n  3. ${cd}npx screenshot-studio recapture --boot`);
		return 0;
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}
var PACKAGE, TEMPLATES, IOS_TEMPLATES, THEMES, requirePackage, featureGraphic, isImage, LOCALE_DIR, imagesIn, slug, words;
var init_init = __esmMin((() => {
	init_check();
	init_project();
	init_ios();
	PACKAGE = node_path.default.resolve(__dirname, "..");
	TEMPLATES = node_path.default.join(PACKAGE, "templates", "starter");
	IOS_TEMPLATES = node_path.default.join(PACKAGE, "templates", "ios");
	THEMES = node_path.default.join(PACKAGE, "themes");
	requirePackage = () => {
		if (!node_fs.default.existsSync(TEMPLATES)) throw new Error("Run this from the Screenshot Studio package: `npx screenshot-studio init`.");
	};
	featureGraphic = {
		profiles: { feature: {
			width: 1024,
			height: 500,
			frame: "phone",
			label: "Feature graphic",
			defaultLocaleOnly: true
		} },
		gallery: (raw) => ({ feature: [{
			feature: "feature-graphic",
			layout: "banner",
			identity: true,
			raw,
			file: "graphics/feature-graphic.png"
		}] }),
		copy: { "feature-graphic": {
			title: "",
			tagline: "One line about what *your app* does."
		} }
	};
	isImage = (file) => /\.(png|jpe?g|webp)$/i.test(file);
	LOCALE_DIR = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
	imagesIn = (folder) => node_fs.default.existsSync(folder) && node_fs.default.statSync(folder).isDirectory() ? node_fs.default.readdirSync(folder).filter(isImage).sort((a, b) => a.localeCompare(b, void 0, {
		numeric: true,
		sensitivity: "base"
	})).map((file) => node_path.default.join(folder, file)) : [];
	slug = (text) => text.toLowerCase().replace(/\.[a-z]+$/, "").replace(/_/g, " ").replace(/^\d+[- ]*/, "").replace(/\d{5,}/g, " ").replace(/\b(screenshot|screen ?shot|img|image|copy)\b/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/-\d{1,3}$/, "").replace(/^-+|-+$/g, "").replace(/^\d+$/, "") || "screen";
	words = (text) => slug(text).replace(/-/g, " ");
}));
// src/node/demo.ts
/**
* A finished example in one command: real captures of an app in three languages, made into a Google Play set with a
* theme, exported and opened in the editor.
*   npx screenshot-studio demo [folder] [--theme aurora] [--3d] [--no-open]
* Run it again with another --theme to see the same cards in another look; your edits to the words are kept. --3d
* draws the phones as real 3D devices, tilted (the theme's `depth` and the `tilt` layout word).
*/
var demo_exports = /* @__PURE__ */ __exportAll({ run: () => run$6 });
async function run$6(argv) {
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const theme = option("theme") || "aurora";
	const folder = node_path.default.resolve(argv.find((word, i) => !word.startsWith("--") && argv[i - 1] !== "--theme") || "screenshot-studio-demo");
	const depth = argv.includes("--3d");
	const listing = node_path.default.join(folder, "store-listing");
	if (!themes().some((t) => t.name === theme)) {
		console.error(`No theme "${theme}". Available: ${themes().map((t) => t.name).join(", ")}`);
		return 1;
	}
	if (node_fs.default.existsSync(listing)) {
		if (!node_fs.default.existsSync(node_path.default.join(listing, ".demo"))) {
			console.error(`${node_path.default.relative(process.cwd(), listing)} isn't a demo; pick another folder: npx screenshot-studio demo my-demo`);
			return 1;
		}
		console.log(`Using the demo in ${node_path.default.relative(process.cwd(), folder) || "."}, with the ${theme} theme.`);
	} else {
		node_fs.default.cpSync(DEMO, listing, { recursive: true });
		node_fs.default.writeFileSync(node_path.default.join(listing, ".demo"), "Made by `npx screenshot-studio demo`; it may swap the theme here.\n");
		console.log(`Made a demo in ${node_path.default.relative(process.cwd(), folder)}: real captures in English, German and Chinese, with the ${theme} theme.`);
	}
	node_fs.default.rmSync(node_path.default.join(listing, "assets"), {
		recursive: true,
		force: true
	});
	installTheme(listing, theme, {
		fill: (text) => text.replaceAll("{{name}}", "ChangeDetection"),
		overwrite: true,
		write: (relative, content) => node_fs.default.writeFileSync(node_path.default.join(listing, relative), content.replace(/^export default \{/m, depth && relative === "theme.js" ? "export default {\n  depth: true," : "$&"))
	});
	const galleryFile = node_path.default.join(listing, "gallery.json");
	const gallery = JSON.parse(node_fs.default.readFileSync(galleryFile, "utf8"));
	for (const card of gallery.phone) card.layout = [...(card.layout || "").split(/\s+/).filter((word) => word && word !== "tilt"), ...depth ? ["tilt"] : []].join(" ");
	node_fs.default.writeFileSync(galleryFile, JSON.stringify(gallery, null, 2) + "\n");
	const result = await exportListing({ listing });
	console.log(`\n${formatSummary(result)}`);
	if (!result.ok) {
		console.error(`\n${result.error}`);
		return 1;
	}
	const where = node_path.default.relative(process.cwd(), listing);
	console.log(`\nThe cards are in ${where}/<language>/phone/. Try another look: npx screenshot-studio demo --theme paper${depth ? "" : ", or real 3D phones: --3d"}`);
	if (argv.includes("--no-open")) return 0;
	console.log("Opening the editor (Ctrl-C to stop)…");
	process.chdir(folder);
	return (await Promise.resolve().then(() => (init_server(), server_exports))).run(["--open"]);
}
var DEMO;
var init_demo = __esmMin((() => {
	init_init();
	DEMO = node_path.default.resolve(__dirname, "..", "templates", "demo");
}));
// src/node/emulator.ts
/**
* The capture device as an agent sees it, for writing a capture tour: what is on screen (a screenshot and every
* labelled element with its bounds), read through agent-device exactly as a tour reads it, and a way to move around
* (tap by label or point, back). An Android emulator, or a booted iOS simulator with --simulator.
*   npx screenshot-studio screen [--serial emulator-5578 | --simulator "iPhone 17 Pro Max" [--app com.example.app]] [--out screen.png] [--json]
*   npx screenshot-studio screen --tap "Settings" | --tap 540,1200 | --back
* On iOS agent-device reads an app's screen: --app (default: the listing's iOS app) is brought to the front first.
* Emulators and simulators only: a phone is refused.
*/
var emulator_exports = /* @__PURE__ */ __exportAll({
	emulator: () => emulator,
	formatScreen: () => formatScreen,
	readScreen: () => readScreen,
	run: () => run$5,
	tapScreen: () => tapScreen
});
/** The emulator (checked: attached, booted, an emulator), or with `simulator` a booted iOS simulator. */
function emulator(serial = process.env.CAPTURE_SERIAL || "emulator-5578", simulator, app) {
	if (simulator) {
		const found = findSimulator(simulator);
		if (found.state !== "Booted") throw new Error(`${found.name} isn't booted: open it in Simulator (or xcrun simctl boot "${found.udid}").`);
		const sim = new Simulator(found.udid, found.name);
		const width = sim.screenshot().readUInt32BE(16);
		const listing = findListing();
		const bundle = app || (listing ? loadListing(listing).config.capture?.install?.[0]?.package : void 0);
		if (!bundle) throw new Error("On iOS, name the app whose screen to read: --app com.example.app");
		return {
			name: found.name,
			target: {
				platform: "ios",
				udid: found.udid,
				width
			},
			screenshot: () => sim.screenshot(),
			app: bundle
		};
	}
	const problem = missingEmulator(serial);
	if (problem) throw new Error(problem);
	const emu = new Emulator(serial);
	if (!emu.isEmulator()) throw new Error(`${serial} is not an emulator. The studio only drives emulators, never a phone.`);
	return {
		name: serial,
		target: {
			platform: "android",
			serial
		},
		screenshot: () => emu.screenshot()
	};
}
async function front(device) {
	if (!device.app || opened.has(device.name)) return;
	await openApp(device.target, device.app, [], false);
	opened.add(device.name);
}
/** A screenshot and every labelled element on screen, top to bottom. */
async function readScreen(device = emulator()) {
	await front(device);
	const tree = await readTree(device.target);
	const png = device.screenshot();
	const elements = tree.nodes.filter((node) => node.text || node.desc || node.id).map(element).sort((p, q) => p.bounds[1] - q.bounds[1] || p.bounds[0] - q.bounds[0]);
	return {
		serial: device.name,
		width: png.readUInt32BE(16),
		height: png.readUInt32BE(20),
		png,
		elements,
		...tree.dialog && { dialog: tree.dialog }
	};
}
/** The elements as lines an agent can act on, each with the label a tour taps it by. */
function formatScreen(screen) {
	const lines = screen.elements.map((e) => {
		const [l, t, r, b] = e.bounds;
		const extra = [e.text && e.description && e.description !== e.text ? `desc "${e.description}"` : "", e.id && e.id !== e.label ? `id ${e.id}` : ""].filter(Boolean).join(", ");
		return `"${e.label.replace(/\n/g, " ")}"  ${e.class} at ${l},${t} ${r - l}×${b - t}${extra ? `  (${extra})` : ""}`;
	});
	return [
		`${screen.serial}, ${screen.width}×${screen.height}. In a tour, d.tap("label") taps one (a regular expression matched whole); here, screen --tap "label".`,
		...screen.dialog ? [`A system dialog is on screen: ${screen.dialog}`] : [],
		...lines
	].join("\n");
}
/** Tap an element by its label (whole, then containing, case-insensitive) or a point "x,y" in pixels; or go back. */
async function tapScreen(target, device = emulator()) {
	await front(device);
	if (target === "back") {
		await goBack(device.target);
		return "back";
	}
	const { nodes } = await readTree(device.target);
	const point = target.match(/^(\d+)\s*,\s*(\d+)$/);
	if (point) {
		await tapPoint(device.target, Number(point[1]), Number(point[2]));
		return `${point[1]},${point[2]}`;
	}
	const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const hit = nodes.find(matcher(new RegExp(escaped, "i"))) || nodes.find(matcher(new RegExp(`.*${escaped}.*`, "i"))) || nodes.find((node) => node.id === target);
	if (!hit) throw new Error(`Nothing on screen is labelled "${target}". Run \`npx screenshot-studio screen\` to see the labels.`);
	await tapNode(device.target, hit);
	return hit.text || hit.desc || hit.id || hit.path;
}
/** `screen [--serial s | --simulator name] [--out file.png] [--json] [--tap label | --tap x,y | --back]` */
async function run$5(argv) {
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	try {
		const device = emulator(option("serial"), option("simulator"), option("app"));
		const tap = argv.includes("--back") ? "back" : option("tap");
		if (tap) {
			console.log(`tapped ${await tapScreen(tap, device)}`);
			await sleep(1200);
		}
		const screen = await readScreen(device);
		const out = node_path.default.resolve(option("out") || "screen.png");
		node_fs.default.writeFileSync(out, screen.png);
		if (argv.includes("--json")) console.log(JSON.stringify({
			device: screen.serial,
			width: screen.width,
			height: screen.height,
			image: out,
			...screen.dialog && { dialog: screen.dialog },
			elements: screen.elements
		}, null, 2));
		else console.log(`${formatScreen(screen)}\nscreenshot: ${node_path.default.relative(process.cwd(), out) || out}`);
		return 0;
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}
var opened, element;
var init_emulator = __esmMin((() => {
	init_recapture();
	init_emulator$1();
	init_screen();
	init_project();
	init_simulator();
	init_ios();
	opened = /* @__PURE__ */ new Set();
	element = (node) => ({
		label: node.text || node.desc || node.id,
		...node.text && { text: node.text },
		...node.desc && { description: node.desc },
		...node.id && { id: node.id },
		class: (node.cls || "").split(".").pop() || "",
		bounds: node.b,
		path: node.path
	});
}));
// src/node/locales.ts
/**
* Languages at a glance, and adding new ones.
*   npx screenshot-studio locales                 coverage: words translated, captures present, layout sidecars
*   npx screenshot-studio locales --init de-DE    add a locale: empty copy fields to fill in the editor
* Empty strings count as untranslated: the renderer falls back to the default locale and reports them.
* localeCoverage() and addLocale() do the same from code.
*/
var locales_exports = /* @__PURE__ */ __exportAll({
	addLocale: () => addLocale,
	formatCoverage: () => formatCoverage,
	localeCoverage: () => localeCoverage,
	run: () => run$4
});
/** Every capture a locale's cards draw (device screens and callout crops); galleries marked defaultLocaleOnly count only for the default. */
function capturesFor({ galleries, profiles, defaultLocale }, locale) {
	return new Set(Object.keys(galleries).filter((kind) => locale === defaultLocale || !profiles[kind]?.defaultLocaleOnly).flatMap((kind) => cardsFor(galleries, kind).flatMap((card) => [...devicesFor(card).map((device) => device.raw), ...(card.callouts || []).map((callout) => callout.raw).filter((raw) => Boolean(raw))])));
}
/** How far each locale is: words translated, captures present and layout sidecars beside them. */
function localeCoverage(listing) {
	const files = loadListing(resolveListing(listing));
	const { defaultLocale, locales } = files;
	const defaultCopy = readCopy(files.listing, defaultLocale);
	const fields = requiredCopyFields(files.galleries, files.profiles, defaultCopy, defaultLocale, defaultLocale).length;
	const rows = locales.map((locale) => {
		const raws = [...capturesFor(files, locale)];
		const copy = readCopy(files.listing, locale);
		const required = requiredCopyFields(files.galleries, files.profiles, defaultCopy, locale, defaultLocale);
		const done = required.filter(({ key, field }) => copy[key]?.[field]?.trim()).length;
		const exists = (file) => node_fs.default.existsSync(node_path.default.join(files.listing, locale, "raw", file));
		return {
			locale,
			isDefault: locale === defaultLocale,
			words: {
				done,
				total: required.length
			},
			captures: {
				done: raws.filter((raw) => exists(raw)).length,
				total: raws.length
			},
			sidecars: {
				done: mapped(files, locale).filter((raw) => exists(nodesFile(raw))).length,
				total: mapped(files, locale).length
			}
		};
	});
	return {
		defaultLocale,
		captures: capturesFor(files, defaultLocale).size,
		fields,
		rows
	};
}
/** The coverage table `locales` prints. */
function formatCoverage(report) {
	const tally = ({ done, total }) => `${done}/${total}`;
	return [
		`${report.captures} captures and ${report.fields} copy fields per locale (default ${report.defaultLocale})`,
		"",
		"locale      words        captures     layout maps (for callouts)",
		...report.rows.map((row) => `${row.locale.padEnd(10)}  ${tally(row.words).padEnd(11)}  ${tally(row.captures).padEnd(11)}  ${tally(row.sidecars)}`)
	].join("\n");
}
/** Add a locale to studio.json and give it every default-locale copy field, empty (existing words are kept). */
function addLocale(locale, listing) {
	if (!LOCALE.test(locale)) throw new Error(`"${locale}" is not a locale code; use one like de-DE or pt-BR.`);
	const files = loadListing(resolveListing(listing));
	const { defaultLocale, locales } = files;
	const copyFile = node_path.default.join(files.listing, locale, "copy.json");
	const copy = readCopy(files.listing, locale);
	let addedFields = 0;
	for (const [key, entry] of Object.entries(readCopy(files.listing, defaultLocale))) {
		const target = copy[key] ||= {};
		for (const field of Object.keys(entry)) if (!(field in target)) {
			target[field] = "";
			addedFields++;
		}
	}
	writeJson(copyFile, copy);
	const alreadyListed = locales.includes(locale);
	if (!alreadyListed) writeJson(node_path.default.join(files.listing, "studio.json"), {
		...files.config,
		locales: [...locales, locale]
	});
	return {
		locale,
		copyFile,
		addedFields,
		alreadyListed
	};
}
async function run$4(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE$3);
		return 0;
	}
	try {
		if (argv[0] === "--init") {
			if (argv.length !== 2) {
				console.error(USAGE$3);
				return 1;
			}
			const added = addLocale(argv[1]);
			console.log(`Added ${added.locale}: fill ${node_path.default.relative(process.cwd(), added.copyFile)} in the editor, and capture into ${added.locale}/raw/.`);
			return 0;
		}
		if (argv.length) {
			console.error(USAGE$3);
			return 1;
		}
		console.log(formatCoverage(localeCoverage()));
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
var LOCALE, resolveListing, mapped, USAGE$3;
var init_locales = __esmMin((() => {
	init_gallery();
	init_project();
	LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
	resolveListing = (listing) => requireListing(listing);
	mapped = ({ galleries, profiles, defaultLocale }, locale) => [...new Set(Object.keys(galleries).filter((kind) => locale === defaultLocale || !profiles[kind]?.defaultLocaleOnly).flatMap((kind) => cardsFor(galleries, kind).flatMap((card) => (card.callouts || []).map((c) => c.raw || devicesFor(card)[c.device || 0]?.raw).filter((raw) => !!raw))))];
	USAGE$3 = `Usage:
  npx screenshot-studio locales                 words translated, captures present and layout sidecars per locale
  npx screenshot-studio locales --init de-DE    add a locale with empty copy fields to fill in the editor`;
}));
// src/node/icon/compose.ts
/** The icon as one SVG document on the visible 72 x 72: the foreground, scaled about the centre, on the background in `shape`. */
function composeIcon(background, foreground, shape, scale = 1) {
	const mark = scale === 1 ? foreground : `<g transform="translate(54 54) scale(${scale}) translate(-54 -54)">${foreground}</g>`;
	if (shape === "mark") return visible(mark);
	if (!CLIP[shape]) throw new Error(`Unknown shape "${shape}"; use square, rounded, circle or mark`);
	return visible(`<defs><clipPath id="icon-shape">${CLIP[shape]}</clipPath></defs><g clip-path="url(#icon-shape)">${background}${mark}</g>`);
}
/** The monochrome layer as a launcher shows a themed icon: tinted, on a tinted circle. */
function themedIcon(monochrome) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><circle cx="54" cy="54" r="36" fill="#3b4a3a"/><g style="filter:brightness(0) invert(.9) sepia(.3) hue-rotate(60deg)">${monochrome}</g></svg>`;
}
/** res/<type>-anydpi-v26/<name>.xml: an adaptive icon of the <name>_<part> bitmaps. */
function adaptiveIconXml(parts, type, name) {
	return [
		"<?xml version=\"1.0\" encoding=\"utf-8\"?>",
		"<!-- Generated by `npx screenshot-studio icons` from store-listing/brand. -->",
		"<adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">",
		...parts.map((part) => `    <${part} android:drawable="@${type}/${name}_${part}" />`),
		"</adaptive-icon>",
		""
	].join("\n");
}
var CLIP, canvas, visible, dataUri;
var init_compose = __esmMin((() => {
	CLIP = {
		square: "<rect x=\"18\" y=\"18\" width=\"72\" height=\"72\"/>",
		rounded: "<rect x=\"18\" y=\"18\" width=\"72\" height=\"72\" rx=\"16\"/>",
		circle: "<circle cx=\"54\" cy=\"54\" r=\"36\"/>"
	};
	canvas = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${inner}</svg>`;
	visible = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${inner}</svg>\n`;
	dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}));
// src/node/icon/xml.ts
/** The attributes of one tag's markup, e.g. `<svg viewBox="0 0 108 108">`. */
function attributes(markup) {
	const found = {};
	for (const [, name, double, single] of markup.matchAll(ATTRIBUTE)) found[name] = decode(double ?? single);
	return found;
}
/** The document's root element. Throws on markup that doesn't nest. */
function parseXml(text) {
	const top = {
		name: "",
		attributes: {},
		children: []
	};
	const open = [top];
	const line = (at) => text.slice(0, at).split("\n").length;
	for (let at = text.indexOf("<"); at >= 0; at = text.indexOf("<", MARKUP.lastIndex)) {
		MARKUP.lastIndex = at;
		const match = MARKUP.exec(text);
		if (!match) throw new Error(`unreadable markup on line ${line(at)}`);
		const [, closing, name, attrs, empty] = match;
		const parent = open[open.length - 1];
		if (closing) {
			if (closing !== parent.name) throw new Error(`</${closing}> on line ${line(at)} closes <${parent.name || "nothing"}>`);
			open.pop();
		} else if (name) {
			const element = {
				name,
				attributes: attributes(attrs),
				children: []
			};
			parent.children.push(element);
			if (!empty) open.push(element);
		}
	}
	if (open.length > 1) throw new Error(`<${open[open.length - 1].name}> is never closed`);
	if (!top.children.length) throw new Error("no elements");
	return top.children[0];
}
/** The first element named `name`, depth first, from `element` itself down. */
function findElement(element, name) {
	if (element.name === name) return element;
	for (const child of element.children) {
		const found = findElement(child, name);
		if (found) return found;
	}
}
var ENTITIES, MARKUP, ATTRIBUTE, decode, escapeAttribute;
var init_xml = __esmMin((() => {
	ENTITIES = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: "\"",
		apos: "'"
	};
	MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
	ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
	decode = (value) => value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, code) => {
		if (code[0] !== "#") return ENTITIES[code] ?? entity;
		return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
	});
	escapeAttribute = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}));
// src/node/icon/layers.ts
/** The SVG layers an icon is drawn from, in store-listing/brand/ or a variant folder inside it. */
/** <dir>/<name>.svg, or brand/<name>.svg when a variant folder (an alpha build's icon, say) doesn't redraw it. */
function layerFile(brand, dir, name) {
	const file = node_path.default.join(dir, `${name}.svg`);
	return node_fs.default.existsSync(file) || dir === brand ? file : node_path.default.join(brand, `${name}.svg`);
}
/** A layer's inner markup, ids prefixed with its name so layers can share one document, bitmap art inlined.
*  rel shows a path in errors. */
function readLayer(file, name, rel) {
	const text = node_fs.default.readFileSync(file, "utf8");
	const open = text.match(/<svg\b[^>]*>/);
	if (!open || attributes(open[0]).viewBox !== "0 0 108 108") throw new Error(`${rel(file)} must be an <svg viewBox="0 0 108 108">`);
	return inlineArt(scopeIds(text.slice(open.index + open[0].length, text.lastIndexOf("</svg>")), name.replace(/[^a-z0-9]/gi, "")), file, rel);
}
/** Prefix every id and every reference to one. */
function scopeIds(markup, prefix) {
	return markup.replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`).replace(/(xlink:)?href="#([^"]+)"/g, `href="#${prefix}-$2"`);
}
/** Replace each <image href="art.png"> beside the layer with a data URI. */
function inlineArt(markup, file, rel) {
	const folder = node_path.default.dirname(file);
	return markup.replace(/(xlink:)?href="(?!#|data:|https?:)([^"]+)"/g, (_, __, art) => {
		const source = node_path.default.join(folder, art);
		if (!node_fs.default.existsSync(source)) throw new Error(`${rel(file)} embeds ${art}, which is not in ${rel(folder) || "."}`);
		return `href="data:${MIME[node_path.default.extname(art).toLowerCase()] || "application/octet-stream"};base64,${node_fs.default.readFileSync(source).toString("base64")}"`;
	});
}
var MIME;
var init_layers = __esmMin((() => {
	init_xml();
	MIME = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".webp": "image/webp",
		".svg": "image/svg+xml"
	};
}));
// src/node/icon/targets.ts
/** Writers for each kind of target icon.json lists: Android resources, image files, Apple icons, and the preview. */
/** Adaptive icon layers at every density, the adaptive icon XML, and legacy PNGs when asked. */
async function writeAndroid(out, android, icon) {
	const res = node_path.default.join(out.root, android.res);
	const name = android.name || "ic_launcher";
	const type = android.type || "mipmap";
	const round = android.round !== false;
	const parts = [
		"background",
		"foreground",
		"monochrome"
	].filter((part) => icon[part] !== null);
	for (const [density, factor] of Object.entries(DENSITIES)) {
		const folder = node_path.default.join(res, `${type}-${density}`);
		for (const part of parts) out.write(node_path.default.join(folder, `${name}_${part}.png`), await out.raster(canvas(icon[part]), 108 * factor));
		if (android.legacy) {
			out.write(node_path.default.join(folder, `${name}.png`), await out.raster(icon.draw("rounded"), 48 * factor));
			if (round) out.write(node_path.default.join(folder, `${name}_round.png`), await out.raster(icon.draw("circle"), 48 * factor));
		}
	}
	const adaptive = adaptiveIconXml(parts, type, name);
	out.write(node_path.default.join(res, `${type}-anydpi-v26/${name}.xml`), adaptive);
	if (round) out.write(node_path.default.join(res, `${type}-anydpi-v26/${name}_round.xml`), adaptive);
}
/** One file, by its extension: .icon, .svg, .ico, .icns, or a PNG of its size. */
async function writeFile(out, target, icon) {
	const file = node_path.default.join(out.root, target.path);
	const draw = () => icon.draw(target.shape || "rounded", target.scale || 1);
	const size = () => {
		if (!target.size) throw new Error(`${target.path} in ${out.rel(out.spec)} needs a "size"`);
		return target.size;
	};
	if (file.endsWith(".icon")) await writeAppleIcon(out, file, target.apple || {
		Background: "background",
		Mark: "foreground"
	}, icon);
	else if (target.layer) out.write(file, await out.raster(visible(icon.layer(target.layer)), size()));
	else if (file.endsWith(".svg")) out.write(file, draw());
	else if (file.endsWith(".ico")) {
		const images = [];
		for (const s of ICO_SIZES) images.push(await out.raster(draw(), s));
		out.write(file, ico(images));
	} else if (file.endsWith(".icns")) {
		if (process.platform !== "darwin") {
			out.log(`Skipped ${target.path}: iconutil needs macOS`);
			return;
		}
		const set = node_path.default.join(node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "icon-")), "AppIcon.iconset");
		node_fs.default.mkdirSync(set);
		for (const s of [
			16,
			32,
			128,
			256,
			512
		]) {
			node_fs.default.writeFileSync(node_path.default.join(set, `icon_${s}x${s}.png`), await out.raster(draw(), s));
			node_fs.default.writeFileSync(node_path.default.join(set, `icon_${s}x${s}@2x.png`), await out.raster(draw(), s * 2));
		}
		node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
		(0, node_child_process.execFileSync)("/usr/bin/iconutil", [
			"-c",
			"icns",
			"-o",
			file,
			set
		]);
		out.wrote(file);
	} else out.write(file, await out.raster(draw(), size(), target.opaque));
}
/** An Icon Composer bundle: each layer as Assets/<Name>.png, an icon.json unless one is kept, checked with ictool. */
async function writeAppleIcon(out, bundle, layers, icon) {
	for (const [name, layerName] of Object.entries(layers)) out.write(node_path.default.join(bundle, "Assets", `${name}.png`), await out.raster(visible(icon.layer(layerName)), 1024));
	const json = node_path.default.join(bundle, "icon.json");
	if (!node_fs.default.existsSync(json)) {
		const names = Object.keys(layers).filter((name) => layers[name] !== "background");
		out.write(json, JSON.stringify({
			groups: [{
				layers: [...names.map((name) => ({
					"image-name": `${name}.png`,
					name
				})), ...Object.entries(layers).filter(([, layer]) => layer === "background").map(([name]) => ({
					"image-name": `${name}.png`,
					name,
					glass: false
				}))],
				shadow: {
					kind: "neutral",
					opacity: .3
				},
				translucency: {
					enabled: true,
					value: .15
				}
			}],
			"supported-platforms": { squares: "shared" }
		}, null, 2) + "\n");
	}
	if (process.platform === "darwin" && node_fs.default.existsSync("/usr/bin/xcrun")) {
		const compiled = node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "apple-icon-"));
		try {
			(0, node_child_process.execFileSync)("/usr/bin/xcrun", [
				"ictool",
				bundle,
				"--compile",
				compiled,
				"--platform",
				"iphoneos",
				"--minimum-deployment-target",
				"26.0"
			], { stdio: "pipe" });
		} catch (error) {
			const failure = error;
			throw new Error(`Xcode rejected ${out.rel(bundle)}: ${failure.stderr || failure.message}`);
		}
	}
}
/** icon-preview.png: every shape large, launcher sizes on light and dark, and the themed icon. */
async function writePreview(out, icon) {
	const img = (svg, size) => `<img width="${size}" height="${size}" src="${dataUri(svg)}">`;
	const themed = icon.monochrome ? themedIcon(icon.monochrome) : null;
	const sizes = [
		[72, "rounded"],
		[48, "circle"],
		[32, "rounded"],
		[16, "rounded"]
	];
	const row = (bg) => `<div style="background:${bg};border-radius:18px;padding:18px;display:flex;gap:18px;align-items:end">${sizes.map(([s, shape]) => img(icon.draw(shape), s)).join("")}${themed ? img(themed, sizes[0][0]) : ""}</div>`;
	await out.page.setViewportSize({
		width: 1200,
		height: 600
	});
	await out.page.setContent(`<body style="margin:0;padding:24px;background:#fff;font:14px sans-serif;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;gap:24px;align-items:end">${img(icon.draw("square"), 220)}${img(icon.draw("rounded"), 180)}${img(icon.draw("circle"), 180)}${img(icon.draw("mark"), 180)}</div>
      ${row("#ece6e2")}
      ${row("#1d1b20")}
    </body>`);
	await out.page.waitForTimeout(200);
	out.write(node_path.default.join(icon.dir, "icon-preview.png"), await out.page.screenshot({ fullPage: true }));
}
/** A Windows .ico of PNG-compressed entries (they keep every size crisp), in ICO_SIZES order. */
function ico(images) {
	const header = Buffer.alloc(6 + images.length * 16);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach((image, i) => {
		const size = ICO_SIZES[i], at = 6 + i * 16;
		header.writeUInt8(size === 256 ? 0 : size, at);
		header.writeUInt8(size === 256 ? 0 : size, at + 1);
		header.writeUInt16LE(1, at + 4);
		header.writeUInt16LE(32, at + 6);
		header.writeUInt32LE(image.length, at + 8);
		header.writeUInt32LE(offset, at + 12);
		offset += image.length;
	});
	return Buffer.concat([header, ...images]);
}
var DENSITIES, ICO_SIZES;
var init_targets = __esmMin((() => {
	init_compose();
	DENSITIES = {
		mdpi: 1,
		hdpi: 1.5,
		xhdpi: 2,
		xxhdpi: 3,
		xxxhdpi: 4
	};
	ICO_SIZES = [
		16,
		24,
		32,
		48,
		64,
		128,
		256
	];
}));
// src/node/icon/build.ts
/** buildIcons(): every icon brand/icon.json lists, drawn in a headless browser. */
/** Draw every icon brand/icon.json lists, plus brand/icon-preview.png (one per icon). */
async function buildIcons(options = {}) {
	const log = options.log || ((line) => console.log(line));
	const specFile = options.spec ? node_path.default.resolve(options.spec) : node_path.default.join(requireListing(options.listing), "brand", "icon.json");
	if (!node_fs.default.existsSync(specFile)) throw new Error(`No ${specFile}. Draw brand/background.svg and brand/foreground.svg, then list the targets in brand/icon.json.`);
	const brand = node_path.default.dirname(specFile);
	const root = node_path.default.resolve(brand, "..", "..");
	const spec = readJson(specFile);
	const rel = (file) => node_path.default.relative(root, file);
	const written = [];
	const browser = await launchBrowser();
	try {
		const page = await browser.newPage();
		const out = {
			root,
			spec: specFile,
			page,
			rel,
			log,
			write(file, data) {
				node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
				node_fs.default.writeFileSync(file, data);
				this.wrote(file);
			},
			wrote(file) {
				written.push(rel(file));
				log(rel(file));
			},
			raster: (svg, size, opaque) => raster(page, svg, size, opaque)
		};
		for (const job of spec.icons || [spec]) {
			const icon = loadIcon(brand, job, rel);
			if (job.android) await writeAndroid(out, job.android, icon);
			for (const target of job.files || []) await writeFile(out, target, icon);
			await writePreview(out, icon);
		}
	} finally {
		await browser.close();
	}
	return { written };
}
/** One icon's layers, from its folder under brand/ or brand/ itself. */
function loadIcon(brand, job, rel) {
	const dir = node_path.default.join(brand, job.layers || ".");
	const optional = (name) => {
		const file = layerFile(brand, dir, name);
		return node_fs.default.existsSync(file) ? readLayer(file, name, rel) : null;
	};
	const layer = (name) => {
		const markup = optional(name);
		if (markup === null) throw new Error(`Missing ${rel(layerFile(brand, dir, name))}`);
		return markup;
	};
	const background = layer("background");
	const foreground = layer("foreground");
	return {
		background,
		foreground,
		monochrome: job.monochrome === false ? null : optional("monochrome"),
		dir,
		layer,
		draw: (shape, scale) => composeIcon(background, foreground, shape, scale)
	};
}
/** An SVG as a size x size PNG, transparent unless opaque. */
async function raster(page, svg, size, opaque = false) {
	await page.setViewportSize({
		width: size,
		height: size
	});
	await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${dataUri(svg)}" width="${size}" height="${size}" style="display:block">`);
	await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
	return page.screenshot({
		omitBackground: !opaque,
		clip: {
			x: 0,
			y: 0,
			width: size,
			height: size
		}
	});
}
var init_build = __esmMin((() => {
	init_project();
	init_playwright();
	init_compose();
	init_layers();
	init_targets();
}));
// src/node/icon/vector.ts
/** Android VectorDrawable XML as an SVG layer on the 108 canvas (paths, groups, clips, alphas and gradients). */
/** `npx screenshot-studio icons --import drawable.xml > layer.svg` */
function importVector(file) {
	return vectorToSvg(node_fs.default.readFileSync(file, "utf8"), node_path.default.basename(file));
}
/** A vector drawable's markup as an SVG document; `name` is the file it came from. */
function vectorToSvg(xml, name) {
	let document;
	try {
		document = parseXml(xml);
	} catch (error) {
		throw new Error(`${name} is not valid XML: ${error instanceof Error ? error.message : error}`);
	}
	const vector = findElement(document, "vector");
	if (!vector) throw new Error(`${name} is not an Android vector drawable`);
	const root = android(vector);
	const defs = [];
	let ids = 0;
	/** A group's children. A clip applies to the rest of its group, so it stays open until the group ends. */
	const children = (elements) => {
		let out = "", clips = 0;
		for (const element of elements) {
			const a = android(element);
			if (element.name === "group") out += `<g transform="${groupTransform(a)}">${children(element.children)}</g>`;
			else if (element.name === "clip-path") {
				const id = `clip${ids++}`;
				defs.push(`<clipPath id="${id}"><path d="${esc(a.pathData)}"/></clipPath>`);
				out += `<g clip-path="url(#${id})">`;
				clips++;
			} else if (element.name === "path") out += pathElement(element, a);
			else out += children(element.children);
		}
		return out + "</g>".repeat(clips);
	};
	const pathElement = (element, a) => {
		let fill = colour(a.fillColor, +(a.fillAlpha ?? 1)), stroke = colour(a.strokeColor, +(a.strokeAlpha ?? 1));
		for (const attr of element.children) {
			const target = attr.name === "aapt:attr" && attr.attributes.name?.match(/^android:(fillColor|strokeColor)$/)?.[1];
			const gradient = attr.children[0];
			if (!target || !gradient) continue;
			const paint = [`url(#${gradientDef(gradient)})`, 1];
			if (target === "fillColor") fill = paint;
			else stroke = paint;
		}
		const parts = [`d="${esc(a.pathData)}"`, `fill="${esc(fill[0])}"`];
		if (fill[1] !== 1) parts.push(`fill-opacity="${fill[1]}"`);
		if (a.fillType === "evenOdd") parts.push("fill-rule=\"evenodd\"");
		if (stroke[0] !== "none" && +(a.strokeWidth ?? 0) > 0) {
			parts.push(`stroke="${esc(stroke[0])}"`, `stroke-width="${esc(a.strokeWidth)}"`);
			if (stroke[1] !== 1) parts.push(`stroke-opacity="${stroke[1]}"`);
			if (a.strokeLineCap) parts.push(`stroke-linecap="${esc(a.strokeLineCap)}"`);
			if (a.strokeLineJoin) parts.push(`stroke-linejoin="${esc(a.strokeLineJoin)}"`);
			if (a.strokeMiterLimit) parts.push(`stroke-miterlimit="${esc(a.strokeMiterLimit)}"`);
		}
		return `<path ${parts.join(" ")}/>`;
	};
	/** Adds a <gradient> to defs and returns its id. */
	const gradientDef = (gradient) => {
		const g = android(gradient), id = `grad${ids++}`;
		const stops = gradient.children.filter((item) => item.name === "item").map((item) => {
			const a = android(item), [c, o] = colour(a.color);
			return `<stop offset="${esc(a.offset)}" stop-color="${esc(c)}" stop-opacity="${o}"/>`;
		}).join("");
		defs.push(g.type === "radial" ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${esc(g.centerX)}" cy="${esc(g.centerY)}" r="${esc(g.gradientRadius)}">${stops}</radialGradient>` : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${esc(g.startX)}" y1="${esc(g.startY)}" x2="${esc(g.endX)}" y2="${esc(g.endY)}">${stops}</linearGradient>`);
		return id;
	};
	const out = children(vector.children);
	const scale = `scale(${108 / parseFloat(root.viewportWidth)} ${108 / parseFloat(root.viewportHeight)})`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">\n  <!-- Imported from ${name}. -->\n  <defs>${defs.join("")}</defs>\n  <g transform="${scale}">${out}</g>\n</svg>\n`;
}
/** An element's attributes without the android: prefix. */
function android(element) {
	return Object.fromEntries(Object.entries(element.attributes).map(([name, value]) => [name.replace(/^android:/, ""), value]));
}
/** A group's pivot, translation, rotation and scale as an SVG transform. */
function groupTransform(a) {
	const px = +(a.pivotX || 0), py = +(a.pivotY || 0);
	return [
		`translate(${+(a.translateX || 0) + px} ${+(a.translateY || 0) + py})`,
		`rotate(${a.rotation || 0})`,
		`scale(${a.scaleX || 1} ${a.scaleY || 1})`,
		`translate(${-px} ${-py})`
	].map(esc).join(" ");
}
/** An Android colour (#rgb, #argb, #rrggbb or #aarrggbb) as an SVG colour and opacity, times `alpha`. */
function colour(value, alpha = 1) {
	if (!value || value === "@android:color/transparent") return ["none", 1];
	let hex = value.replace("#", "");
	if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
	let a = 1;
	if (hex.length === 8) {
		a = parseInt(hex.slice(0, 2), 16) / 255;
		hex = hex.slice(2);
	}
	return [`#${hex}`, +(a * alpha).toFixed(3)];
}
var esc;
var init_vector = __esmMin((() => {
	init_xml();
	esc = (value) => escapeAttribute(String(value));
}));
// src/node/icon/index.ts
/**
* The icon factory: one drawing, every icon an app ships (docs/icons.md).
*   npx screenshot-studio icons [store-listing/brand/icon.json]
*   npx screenshot-studio icons --import drawable.xml > store-listing/brand/foreground.svg
*
* An app draws its icon once, as SVG layers on Android's 108 x 108 adaptive canvas in store-listing/brand/
* (background.svg, foreground.svg and, for themed icons, monochrome.svg), and lists where the icons go in
* brand/icon.json. The pieces:
*   build.ts     buildIcons(): reads icon.json, draws each icon in a headless browser
*   layers.ts    finds and reads an icon's layers (a variant folder falls back to brand/)
*   compose.ts   layers composed into shapes, the themed icon, the adaptive icon XML
*   targets.ts   Android resources, PNG/SVG/ICO/ICNS files, Apple Icon Composer bundles, the preview
*   vector.ts    an Android vector drawable as an SVG layer (--import)
*   xml.ts       the XML reader vector.ts uses
*/
var icon_exports = /* @__PURE__ */ __exportAll({
	buildIcons: () => buildIcons,
	importVector: () => importVector,
	run: () => run$3,
	vectorToSvg: () => vectorToSvg
});
async function run$3(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE$2);
		return 0;
	}
	try {
		if (argv[0] === "--import") {
			if (argv.length !== 2) {
				console.error(USAGE$2);
				return 1;
			}
			process.stdout.write(importVector(node_path.default.resolve(argv[1])));
			return 0;
		}
		if (argv.length > 1 || argv.some((arg) => arg.startsWith("-"))) {
			console.error(USAGE$2);
			return 1;
		}
		await buildIcons({ spec: argv[0] });
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
var USAGE$2;
var init_icon = __esmMin((() => {
	init_build();
	init_vector();
	USAGE$2 = `Usage:
  npx screenshot-studio icons [store-listing/brand/icon.json]   draw every icon icon.json lists
  npx screenshot-studio icons --import drawable.xml             print an Android vector drawable as a 108 x 108 SVG layer`;
}));
// src/node/fixture-apps.ts
/**
* Fictional third-party apps for capture emulators: tiny code-free APKs with a name, a drawn adaptive
* icon and (optionally) the INTERNET permission, so firewalls, launchers and app pickers list them
* through the real PackageManager with no fixture code in the app under test.
*
*   npx screenshot-studio fixtures store-listing/fixture-apps.json [--install emulator-5578] [--uninstall emulator-5578]
*
* Spec: {"apps": [{"package": "app.fernway.maps", "label": "Fernway Maps", "colors": ["#3fb27f", "#1e8a5c"],
*         "glyph": "map", "tint": "#ffffff", "internet": true, "category": "maps"}]}
* glyph: a Lucide icon name (resolved from lucide-react in the studio master's node_modules or LUCIDE_DIR),
* {"svg": "<path d=\"...\"/>"} drawn on a 24-unit stroke grid, or {"text": "Aa"}.
* category: an android:appCategory value (game, audio, video, image, social, news, maps, productivity).
* targetSdk (default 34; Android refuses installs below 24), versionCode (1) and versionName ("1.0") set the
* manifest, for apps that read them (an SDK tracker).
* Needs the Android SDK (ANDROID_HOME or ~/Library/Android/sdk) and Playwright for the icons.
* Builds into <spec dir>/.fixture-apps/ (keep it git-ignored) and signs with the local debug keystore; an unchanged
* spec reuses the APKs already there. --install and --uninstall only ever talk to an emulator, never a phone.
* buildFixtureApps() does the same from code and returns the packages and APKs.
*/
var fixture_apps_exports = /* @__PURE__ */ __exportAll({
	buildFixtureApps: () => buildFixtureApps,
	run: () => run$2
});
/** LUCIDE_DIR, or lucide-react in the studio master's node_modules (studio/ sits beside it). */
function lucideDir() {
	return [process.env.LUCIDE_DIR, node_path.default.join(__dirname, "../node_modules/lucide-react/dist/esm/icons")].find((dir) => Boolean(dir) && node_fs.default.existsSync(dir));
}
function glyphMarkup(glyph) {
	if (glyph && typeof glyph === "object" && "svg" in glyph && glyph.svg) return glyph.svg;
	if (typeof glyph !== "string") return "";
	const dir = lucideDir();
	if (!dir) throw new Error("Lucide icons not found: set LUCIDE_DIR to lucide-react/dist/esm/icons");
	const file = node_path.default.join(dir, `${glyph}.mjs`);
	if (!node_fs.default.existsSync(file)) throw new Error(`No Lucide icon named ${glyph}`);
	let source = node_fs.default.readFileSync(file, "utf8");
	const alias = source.match(/from '\.\/([\w-]+)\.mjs'/);
	if (!source.includes("__iconData") && alias) source = node_fs.default.readFileSync(node_path.default.join(dir, `${alias[1]}.mjs`), "utf8");
	const start = source.indexOf("{", source.indexOf("const __iconData"));
	const literal = source.slice(start, source.indexOf("__iconData.node", start)).trim().replace(/;$/, "");
	return Function(`return (${literal})`)().node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
}
/** Adaptive icon layers, 432 px (108 dp at xxxhdpi): a gradient field and a glyph inside the 66 dp safe zone. */
function layers(app) {
	const [top, bottom = top] = app.colors;
	const tint = app.tint || "#ffffff";
	const background = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <radialGradient id="h" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="432" height="432" fill="url(#g)"/><rect width="432" height="432" fill="url(#h)"/></svg>`;
	let mark;
	if (app.glyph && typeof app.glyph === "object" && "text" in app.glyph && app.glyph.text) mark = `<text x="216" y="216" dy=".35em" text-anchor="middle" font-family="Google Sans, Roboto, Helvetica, Arial, sans-serif"
      font-weight="700" font-size="${app.glyph.text.length > 1 ? 104 : 140}" fill="${tint}">${app.glyph.text}</text>`;
	else mark = `<g transform="translate(132 132) scale(7)" fill="none" stroke="${tint}" stroke-width="${app.strokeWidth || 2.1}"
      stroke-linecap="round" stroke-linejoin="round">${glyphMarkup(app.glyph)}</g>`;
	return {
		background,
		foreground: `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">${mark}</svg>`
	};
}
async function renderIcons(apps, out) {
	const browser = await launchBrowser();
	try {
		const page = await browser.newPage({ viewport: {
			width: 432,
			height: 432
		} });
		for (const app of apps) {
			const dir = node_path.default.join(out, app.package, "res", "drawable-nodpi");
			node_fs.default.mkdirSync(dir, { recursive: true });
			for (const [name, svg] of Object.entries(layers(app))) {
				await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
				await page.locator("svg").screenshot({
					path: node_path.default.join(dir, `ic_${name}.png`),
					omitBackground: true
				});
			}
		}
	} finally {
		await browser.close();
	}
}
/** The newest build-tools and android.jar in the Android SDK, with an error that says what to install. */
function androidSdk() {
	const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || [node_path.default.join(node_os.default.homedir(), "Library/Android/sdk"), node_path.default.join(node_os.default.homedir(), "Android/Sdk")].find((dir) => node_fs.default.existsSync(dir));
	if (!sdk || !node_fs.default.existsSync(sdk)) throw new Error("No Android SDK found. Set ANDROID_HOME to your Android SDK.");
	const list = (dir) => node_fs.default.existsSync(dir) ? node_fs.default.readdirSync(dir) : [];
	const buildTools = list(node_path.default.join(sdk, "build-tools")).filter((v) => /^\d/.test(v) && !/rc|preview/i.test(v)).sort(numeric).pop();
	if (!buildTools) throw new Error(`No build-tools in ${sdk}. Install them with the SDK Manager (sdkmanager "build-tools;35.0.0").`);
	const platform = list(node_path.default.join(sdk, "platforms")).filter((p) => node_fs.default.existsSync(node_path.default.join(sdk, "platforms", p, "android.jar"))).sort(numeric).pop();
	if (!platform) throw new Error(`No Android platform in ${sdk}. Install one with the SDK Manager (sdkmanager "platforms;android-35").`);
	return {
		tools: node_path.default.join(sdk, "build-tools", buildTools),
		androidJar: node_path.default.join(sdk, "platforms", platform, "android.jar")
	};
}
/** Build one code-free APK from the rendered icons in <out>/<package>/; returns its path. */
function build(app, out, sdk) {
	const run = (tool, ...rest) => (0, node_child_process.execFileSync)(node_path.default.join(sdk.tools, tool), rest, { stdio: [
		"ignore",
		"pipe",
		"inherit"
	] });
	const root = node_path.default.join(out, app.package);
	node_fs.default.mkdirSync(node_path.default.join(root, "res", "mipmap-anydpi-v26"), { recursive: true });
	node_fs.default.writeFileSync(node_path.default.join(root, "res", "mipmap-anydpi-v26", "ic_launcher.xml"), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@drawable/ic_background"/>
  <foreground android:drawable="@drawable/ic_foreground"/>
</adaptive-icon>
`);
	const label = app.label.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
	node_fs.default.writeFileSync(node_path.default.join(root, "AndroidManifest.xml"), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${app.package}">
  ${app.internet === false ? "" : "<uses-permission android:name=\"android.permission.INTERNET\"/>"}
  <application android:label="${label}" android:icon="@mipmap/ic_launcher" android:hasCode="false"${app.category ? ` android:appCategory="${app.category}"` : ""}/>
</manifest>
`);
	const compiled = node_path.default.join(root, "compiled.zip");
	run("aapt2", "compile", "--dir", node_path.default.join(root, "res"), "-o", compiled);
	const unsigned = node_path.default.join(root, "unsigned.apk"), aligned = node_path.default.join(root, "aligned.apk");
	run("aapt2", "link", "-o", unsigned, "-I", sdk.androidJar, "--manifest", node_path.default.join(root, "AndroidManifest.xml"), "--min-sdk-version", "26", "--target-sdk-version", String(app.targetSdk || 34), "--version-code", String(app.versionCode || 1), "--version-name", app.versionName || "1.0", compiled);
	run("zipalign", "-p", "-f", "4", unsigned, aligned);
	const apk = node_path.default.join(out, `${app.package}.apk`);
	const keystore = node_path.default.join(node_os.default.homedir(), ".android", "debug.keystore");
	if (!node_fs.default.existsSync(keystore)) throw new Error(`No debug keystore at ${keystore}. Build any Android app once (or run keytool) to create it.`);
	run("apksigner", "sign", "--ks", keystore, "--ks-pass", "pass:android", "--ks-key-alias", "androiddebugkey", "--key-pass", "pass:android", "--out", apk, aligned);
	return apk;
}
/** Build the spec's fixture APKs (reusing them when the spec is unchanged), and install or uninstall them on an emulator. */
async function buildFixtureApps(options) {
	const log = options.log || ((line) => console.log(line));
	const specFile = node_path.default.resolve(options.spec);
	if (!node_fs.default.existsSync(specFile) || !node_fs.default.statSync(specFile).isFile()) throw new Error(`No fixture spec at ${specFile}`);
	if (options.install && options.uninstall) throw new Error("Pass --install or --uninstall, not both.");
	const serial = options.install || options.uninstall;
	if (serial && !serial.startsWith("emulator-")) throw new Error(`Install fixture apps on a dedicated emulator only (emulator-N), not ${serial}.`);
	const spec = readJson(specFile);
	if (!Array.isArray(spec.apps) || !spec.apps.length) throw new Error(`${specFile} lists no apps: {"apps": [{"package": …, "label": …, "colors": […]}]}`);
	for (const app of spec.apps) if (!app.package || !app.label || !app.colors?.length) throw new Error(`Every app in ${specFile} needs "package", "label" and "colors" (${app.package || app.label || "unnamed"} doesn't).`);
	const packages = spec.apps.map((app) => app.package);
	const result = {
		packages,
		apks: [],
		built: false,
		installed: [],
		uninstalled: []
	};
	const adb = (...rest) => (0, node_child_process.execFileSync)("adb", [
		"-s",
		serial,
		...rest
	], { stdio: [
		"ignore",
		"pipe",
		"pipe"
	] }).toString();
	if (options.uninstall) {
		for (const id of packages) {
			try {
				adb("uninstall", id);
			} catch {
				continue;
			}
			result.uninstalled.push(id);
			log(`removed   ${id}`);
		}
		return result;
	}
	const out = node_path.default.join(node_path.default.dirname(specFile), ".fixture-apps");
	const apkFor = (app) => node_path.default.join(out, `${app.package}.apk`);
	const fingerprint = JSON.stringify(spec.apps);
	const stamp = node_path.default.join(out, "spec.json");
	if (!(node_fs.default.existsSync(stamp) && node_fs.default.readFileSync(stamp, "utf8") === fingerprint && spec.apps.every((app) => node_fs.default.existsSync(apkFor(app))))) {
		const sdk = androidSdk();
		node_fs.default.rmSync(out, {
			recursive: true,
			force: true
		});
		node_fs.default.mkdirSync(out, { recursive: true });
		await renderIcons(spec.apps, out);
		for (const app of spec.apps) log(`built     ${node_path.default.relative(process.cwd(), build(app, out, sdk))}`);
		node_fs.default.writeFileSync(stamp, fingerprint);
		result.built = true;
	}
	result.apks = spec.apps.map(apkFor);
	if (options.install) for (const app of spec.apps) {
		try {
			adb("install", "-r", "-t", apkFor(app));
		} catch (error) {
			const stderr = String(error.stderr || "").trim();
			throw new Error(`Couldn't install ${app.package} on ${serial}${stderr ? `: ${stderr}` : ""}. Is the emulator running (adb devices)?`);
		}
		result.installed.push(app.package);
		log(`installed ${app.package}`);
	}
	return result;
}
async function run$2(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE$1);
		return 0;
	}
	const options = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--install" || arg === "--uninstall") {
			const value = argv[++i];
			if (!value || value.startsWith("-")) {
				console.error(`${arg} needs an emulator serial, e.g. emulator-5578\n${USAGE$1}`);
				return 1;
			}
			options[arg === "--install" ? "install" : "uninstall"] = value;
		} else if (arg.startsWith("-") || options.spec) {
			console.error(USAGE$1);
			return 1;
		} else options.spec = arg;
	}
	if (!options.spec) {
		console.error(USAGE$1);
		return 1;
	}
	try {
		await buildFixtureApps({
			...options,
			spec: options.spec
		});
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
var numeric, USAGE$1;
var init_fixture_apps = __esmMin((() => {
	init_project();
	init_playwright();
	numeric = (a, b) => a.localeCompare(b, void 0, { numeric: true });
	USAGE$1 = "Usage: npx screenshot-studio fixtures fixture-apps.json [--install <emulator-serial>] [--uninstall <emulator-serial>]";
}));
// src/node/mcp.ts
/**
* Screenshot Studio as an MCP server, so an agent can make and check store art the way a person would: look at the
* listing, check it, render cards, and look at the images. Speaks MCP over stdio (JSON-RPC 2.0, newline-delimited),
* with no dependencies.
*   npx screenshot-studio mcp            # in an app; or pass --listing path/to/app
* Add it to Claude Code: claude mcp add screenshot-studio -- npx screenshot-studio mcp
*/
var mcp_exports = /* @__PURE__ */ __exportAll({
	createTools: () => createTools,
	run: () => run$1
});
function createTools(defaultListing) {
	const where = (args) => {
		const found = findListing(typeof args.listing === "string" ? args.listing : defaultListing);
		if (!found) throw new Error("No store-listing/studio.json found. Run `npx screenshot-studio init` in the app first, or pass \"listing\".");
		return found;
	};
	return [
		{
			name: "describe_listing",
			description: "What the listing contains: galleries and their sizes, every card (feature, layout, captures, headline in the default language, output file), languages and the theme files. Start here.",
			inputSchema: {
				type: "object",
				properties: listingArg
			},
			async call(args) {
				const listing = where(args);
				const { config, profiles, galleries, defaultLocale, locales } = loadListing(listing);
				const copy = readCopy(listing, defaultLocale);
				return [text({
					listing,
					app: config.app,
					defaultLocale,
					locales,
					files: {
						theme: ["theme.css", "theme.js"].filter((f) => node_fs.default.existsSync(node_path.default.join(listing, f))),
						gallery: "gallery.json",
						copy: `${defaultLocale}/copy.json`
					},
					galleries: Object.fromEntries(Object.keys(galleries).map((kind) => [kind, {
						size: `${profiles[kind].width}×${profiles[kind].height}`,
						frame: profiles[kind].frame,
						defaultLocaleOnly: !!profiles[kind].defaultLocaleOnly,
						cards: cardsFor(galleries, kind).map((card, index) => ({
							index,
							feature: card.feature,
							layout: card.layout,
							captures: devicesFor(card).map((d) => d.raw),
							title: (copy[`${kind}/${card.feature}`] || copy[card.feature])?.title,
							output: `${defaultLocale}/${outputFile(kind, card, index)}`
						}))
					}]))
				})];
			}
		},
		{
			name: "check",
			description: "Check every file without rendering: schemas, missing or wrong-shaped captures, missing words, store text over limits. Fast; run it after each edit. Returns issues with a fix for each.",
			inputSchema: {
				type: "object",
				properties: listingArg
			},
			async call(args) {
				const result = checkListing(where(args));
				return [text(formatIssues(result)), text({
					ok: result.ok,
					issues: result.issues
				})];
			}
		},
		{
			name: "render_card",
			description: "Render one card and return the image, so you can see it. Also returns the renderer's notes (copy shrunk to fit, borrowed captures), where every device, the headline and each callout landed in card pixels (layout), or why it failed (copy that doesn't fit, a device out of bounds). Use it to iterate on theme.css, gallery.json or copy.json.",
			inputSchema: {
				type: "object",
				properties: {
					...listingArg,
					gallery: {
						type: "string",
						description: "The gallery, e.g. phone, tablet7, tablet10, readme."
					},
					card: {
						type: "integer",
						description: "The card's index in the gallery (0-based)."
					},
					locale: {
						type: "string",
						description: "The language (default: the default language)."
					}
				},
				required: ["gallery", "card"]
			},
			async call(args) {
				const listing = where(args);
				const { defaultLocale } = loadListing(listing);
				const result = await exportListing({
					listing,
					locales: [typeof args.locale === "string" ? args.locale : defaultLocale],
					kind: String(args.gallery),
					card: Number(args.card),
					log: () => {}
				});
				if (!result.ok || !result.cards.length) return [text(`Render failed: ${result.error || "no such card"}`)];
				const card = result.cards[0];
				return [await image(node_path.default.join(listing, card.file), 1400), text({
					file: card.file,
					notes: card.notes,
					layout: card.layout,
					warnings: result.warnings
				})];
			}
		},
		{
			name: "export",
			description: "Render and check every card (optionally one language or gallery) and write the images. Returns every file written, notes per card, and warnings such as seams that break between cards or images no card writes any more.",
			inputSchema: {
				type: "object",
				properties: {
					...listingArg,
					locale: {
						type: "string",
						description: "Only this language."
					},
					gallery: {
						type: "string",
						description: "Only this gallery."
					},
					strict: {
						type: "boolean",
						description: "Fail on warnings and untranslated words."
					}
				}
			},
			async call(args) {
				const result = await exportListing({
					listing: where(args),
					locales: typeof args.locale === "string" ? [args.locale] : void 0,
					kind: typeof args.gallery === "string" ? args.gallery : void 0,
					strict: !!args.strict,
					log: () => {}
				});
				return [text(result)];
			}
		},
		{
			name: "view_image",
			description: "Look at an image in the listing: an exported card, a contact sheet (contact-phone.jpg shows the whole strip, to judge it as a set), or a raw capture. The path is relative to the store-listing folder.",
			inputSchema: {
				type: "object",
				properties: {
					...listingArg,
					file: {
						type: "string",
						description: "e.g. en-US/contact-phone.jpg or en-US/raw/phone/01-home.png"
					}
				},
				required: ["file"]
			},
			async call(args) {
				const listing = where(args);
				const file = node_path.default.resolve(listing, String(args.file));
				if (!file.startsWith(listing + node_path.default.sep)) throw new Error("The file must be inside the store-listing folder.");
				if (!node_fs.default.existsSync(file)) throw new Error(`${args.file} doesn't exist. Export first, or check the path with describe_listing.`);
				return [await image(file, 1600)];
			}
		},
		{
			name: "emulator_screen",
			description: "Look at the capture emulator: a screenshot and every labelled element with its bounds, read exactly as a capture tour reads it. Use it to write or fix the tour (store-listing/capture.tour.mjs): each label is what d.tap(\"…\") takes. An Android emulator, or a booted iOS simulator with `simulator`; never a phone.",
			inputSchema: {
				type: "object",
				properties: {
					serial: {
						type: "string",
						description: "The emulator (default: the capture emulator, emulator-5578)."
					},
					simulator: {
						type: "string",
						description: "iOS instead: a booted simulator, by name or UDID."
					},
					app: {
						type: "string",
						description: "iOS: the app whose screen to read (default: the listing's iOS app)."
					}
				}
			},
			async call(args) {
				const { emulator, readScreen, formatScreen } = await Promise.resolve().then(() => (init_emulator(), emulator_exports));
				const screen = await readScreen(emulator(typeof args.serial === "string" ? args.serial : void 0, typeof args.simulator === "string" ? args.simulator : void 0, typeof args.app === "string" ? args.app : void 0));
				return [await image(screen.png, 1400), text(formatScreen(screen))];
			}
		},
		{
			name: "emulator_tap",
			description: "Move around the app on the capture emulator (or a simulator), to find the screens a tour should capture: tap an element by its label (as emulator_screen lists it) or a point \"x,y\", or \"back\". Returns the screen after the tap.",
			inputSchema: {
				type: "object",
				properties: {
					target: {
						type: "string",
						description: "A label, \"x,y\" in screen pixels, or \"back\"."
					},
					serial: {
						type: "string",
						description: "The emulator (default: the capture emulator, emulator-5578)."
					},
					simulator: {
						type: "string",
						description: "iOS instead: a booted simulator, by name or UDID."
					},
					app: {
						type: "string",
						description: "iOS: the app whose screen to read (default: the listing's iOS app)."
					}
				},
				required: ["target"]
			},
			async call(args) {
				const { emulator, readScreen, formatScreen, tapScreen } = await Promise.resolve().then(() => (init_emulator(), emulator_exports));
				const device = emulator(typeof args.serial === "string" ? args.serial : void 0, typeof args.simulator === "string" ? args.simulator : void 0, typeof args.app === "string" ? args.app : void 0);
				const tapped = await tapScreen(String(args.target), device);
				await new Promise((resolve) => setTimeout(resolve, 1200));
				const screen = await readScreen(device);
				return [await image(screen.png, 1400), text(`tapped ${tapped}\n${formatScreen(screen)}`)];
			}
		}
	];
}
/** An image as MCP content: large ones are scaled to fit maxSide and sent as JPEG, so they stay within an agent's limits. */
async function image(source, maxSide) {
	const data = typeof source === "string" ? node_fs.default.readFileSync(source) : source;
	const png = typeof source === "string" ? /\.png$/i.test(source) : data[0] === 137;
	if (data.length <= 6e5) return {
		type: "image",
		data: data.toString("base64"),
		mimeType: png ? "image/png" : "image/jpeg"
	};
	browser ||= launchBrowser(() => {});
	const page = await (await browser).newPage();
	try {
		return {
			type: "image",
			data: await page.evaluate(async ({ src, maxSide }) => {
				const img = new Image();
				img.src = src;
				await img.decode();
				const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
				const canvas = Object.assign(document.createElement("canvas"), {
					width: Math.round(img.naturalWidth * scale),
					height: Math.round(img.naturalHeight * scale)
				});
				canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
				return canvas.toDataURL("image/jpeg", .85).split(",")[1];
			}, {
				src: `data:image/${png ? "png" : "jpeg"};base64,${data.toString("base64")}`,
				maxSide
			}),
			mimeType: "image/jpeg"
		};
	} finally {
		await page.close();
	}
}
/** `mcp [--listing path]`: serve until stdin closes. */
async function run$1(argv) {
	const at = argv.indexOf("--listing");
	const tools = createTools(at >= 0 ? argv[at + 1] : void 0);
	const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
	const version = (() => {
		try {
			return node_fs.default.readFileSync(node_path.default.join(__dirname, "VERSION"), "utf8").trim();
		} catch {
			return "1.0";
		}
	})();
	console.log = (...parts) => process.stderr.write(parts.join(" ") + "\n");
	const input = node_readline.default.createInterface({ input: process.stdin });
	for await (const line of input) {
		if (!line.trim()) continue;
		let request;
		try {
			request = JSON.parse(line);
		} catch {
			send({
				jsonrpc: "2.0",
				id: null,
				error: {
					code: -32700,
					message: "Parse error"
				}
			});
			continue;
		}
		const reply = (result) => request.id !== void 0 && send({
			jsonrpc: "2.0",
			id: request.id,
			result
		});
		const fail = (code, message) => request.id !== void 0 && send({
			jsonrpc: "2.0",
			id: request.id,
			error: {
				code,
				message
			}
		});
		switch (request.method) {
			case "initialize":
				reply({
					protocolVersion: PROTOCOL,
					capabilities: { tools: {} },
					serverInfo: {
						name: "screenshot-studio",
						version
					},
					instructions: "Make and check app store screenshots from real app captures. Start with describe_listing, edit theme.css / gallery.json / <locale>/copy.json, then check, render_card to see a card (its layout gives every box in card pixels), and view_image en-US/contact-phone.jpg after export to judge the whole strip. To capture the app itself, emulator_screen shows the capture emulator and the labels a tour taps, and emulator_tap moves around the app."
				});
				break;
			case "notifications/initialized":
			case "notifications/cancelled": break;
			case "ping":
				reply({});
				break;
			case "tools/list":
				reply({ tools: tools.map(({ name, description, inputSchema }) => ({
					name,
					description,
					inputSchema
				})) });
				break;
			case "tools/call": {
				const tool = tools.find((t) => t.name === request.params?.name);
				if (!tool) {
					fail(-32602, `Unknown tool ${String(request.params?.name)}`);
					break;
				}
				try {
					reply({ content: await tool.call(request.params?.arguments || {}) });
				} catch (error) {
					reply({
						content: [text(error.message)],
						isError: true
					});
				}
				break;
			}
			default: fail(-32601, `Method not found: ${request.method}`);
		}
	}
	if (browser) await (await browser).close();
	return 0;
}
var PROTOCOL, text, listingArg, browser;
var init_mcp = __esmMin((() => {
	init_check();
	init_export();
	init_project();
	init_playwright();
	init_gallery();
	PROTOCOL = "2025-06-18";
	text = (value) => ({
		type: "text",
		text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
	});
	listingArg = { listing: {
		type: "string",
		description: "The app folder or its store-listing folder. Defaults to the one the server was started in."
	} };
	browser = null;
}));
// src/node/readme-preview.ts
/**
* Render the repository README the way GitHub shows it and save a full-page screenshot.
*   npx screenshot-studio readme [--repo .] [--out /tmp/readme.png] [--width 1012]
* Uses GitHub's Markdown API through the gh CLI (so HTML and tables render exactly as on github.com) and
* GitHub's light stylesheet. Relative image paths load from the working tree, so unpushed images show too.
* The repository defaults to the git root around the store listing. Exits 1 when a local image is missing.
* previewReadme() does the same from code.
*/
var readme_preview_exports = /* @__PURE__ */ __exportAll({
	previewReadme: () => previewReadme,
	run: () => run
});
/** The git root containing the store listing, else the folder two up from this studio copy. */
function defaultRepo() {
	const listing = findListing();
	if (listing) try {
		return (0, node_child_process.execFileSync)("git", [
			"-C",
			listing,
			"rev-parse",
			"--show-toplevel"
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
	} catch {}
	return node_path.default.resolve(__dirname, "..", "..");
}
/** README.md as GitHub renders it (HTML), through `gh api /markdown`. */
function renderMarkdown(text) {
	try {
		return (0, node_child_process.execFileSync)("gh", [
			"api",
			"-X",
			"POST",
			"/markdown",
			"--input",
			"-"
		], {
			input: JSON.stringify({
				text,
				mode: "gfm"
			}),
			encoding: "utf8",
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			maxBuffer: 67108864
		});
	} catch (error) {
		const failure = error;
		if (failure.code === "ENOENT") throw new Error("The readme preview needs the GitHub CLI: install gh (https://cli.github.com) and run `gh auth login`.");
		throw new Error(`GitHub couldn't render the README: ${String(failure.stderr || failure.message).trim()}. Is gh signed in (gh auth status)?`);
	}
}
async function previewReadme(options = {}) {
	const repo = node_path.default.resolve(options.repo || defaultRepo());
	const out = node_path.default.resolve(options.out || node_path.default.join(node_os.default.tmpdir(), "readme-preview.png"));
	const width = options.width ?? 1012;
	if (!Number.isFinite(width) || width <= 0) throw new Error(`The width must be a positive number of pixels, not ${width}.`);
	const readme = node_path.default.join(repo, "README.md");
	if (!node_fs.default.existsSync(readme)) throw new Error(`No README.md in ${repo}. Pass --repo with the repository folder.`);
	const body = renderMarkdown(node_fs.default.readFileSync(readme, "utf8"));
	const html = `<!doctype html><meta charset="utf-8"><base href="${(0, node_url.pathToFileURL)(repo).href}/">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css">
<style>body{margin:0;background:#fff}.markdown-body{box-sizing:border-box;max-width:${width}px;margin:0 auto;padding:32px}</style>
<article class="markdown-body">${body}</article>`;
	const page = node_path.default.join(node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "readme-preview-")), "readme.html");
	node_fs.default.writeFileSync(page, html);
	const browser = await launchBrowser();
	try {
		const tab = await browser.newPage({
			viewport: {
				width: width + 64,
				height: 900
			},
			deviceScaleFactor: 1
		});
		await tab.goto((0, node_url.pathToFileURL)(page).href);
		await tab.waitForLoadState("networkidle");
		const missingImages = await tab.evaluate(() => [...document.images].filter((image) => !image.naturalWidth && !/^https?:/.test(image.getAttribute("src") || "")).map((image) => image.getAttribute("src") || ""));
		node_fs.default.mkdirSync(node_path.default.dirname(out), { recursive: true });
		await tab.screenshot({
			path: out,
			fullPage: true
		});
		return {
			file: out,
			missingImages
		};
	} finally {
		await browser.close();
	}
}
async function run(argv) {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE);
		return 0;
	}
	const options = {};
	for (let i = 0; i < argv.length; i += 2) {
		const [flag, value] = [argv[i], argv[i + 1]];
		if (value === void 0 || value.startsWith("--")) {
			console.error(USAGE);
			return 1;
		}
		if (flag === "--repo") options.repo = value;
		else if (flag === "--out") options.out = value;
		else if (flag === "--width") options.width = Number(value);
		else {
			console.error(USAGE);
			return 1;
		}
	}
	try {
		const { file, missingImages } = await previewReadme(options);
		console.log(file);
		if (missingImages.length) {
			console.error(`Missing images:\n${missingImages.join("\n")}`);
			return 1;
		}
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
var USAGE;
var init_readme_preview = __esmMin((() => {
	init_project();
	init_playwright();
	USAGE = "Usage: npx screenshot-studio readme [--repo <folder>] [--out <file.png>] [--width 1012]";
}));
// src/cli/main.ts
/**
* screenshot-studio: one command for everything. Run it in an app (or anywhere below one); every command finds the
* app's store-listing/ from there, or from `--listing <path>`.
*/
init_export();
init_recapture();
init_tour();
init_simulator();
init_check();
init_project();
init_server();
init_store();
init_gallery();
init_validate();
init_screen();
const COMMANDS = {
	init: {
		summary: "Set up Screenshot Studio in an app (or from a folder of screenshots)",
		usage: "init [app] [--name \"My App\"] [--package com.example.app] [--theme starter] [--screenshots ./folder] [--locales en-US,de-DE] [--platform ios]",
		run: async (argv) => (await Promise.resolve().then(() => (init_init(), init_exports))).run(argv)
	},
	demo: {
		summary: "See it work in a minute: a finished example, exported and opened in the editor",
		usage: "demo [folder] [--theme aurora] [--3d] [--no-open]",
		run: async (argv) => (await Promise.resolve().then(() => (init_demo(), demo_exports))).run(argv)
	},
	themes: {
		summary: "List the themes init can start from",
		usage: "themes",
		run: async () => {
			const { themes } = await Promise.resolve().then(() => (init_init(), init_exports));
			for (const t of themes()) console.log(`${t.name.padEnd(14)} ${t.description}`);
			return 0;
		}
	},
	studio: {
		summary: "Open the editor",
		usage: "studio [port] [--open] [--add /path/to/app]…",
		run: async (argv) => (await Promise.resolve().then(() => (init_server(), server_exports))).run(argv)
	},
	check: {
		summary: "Check every file without rendering (fast; run it after each edit)",
		usage: "check [--json]",
		run: async (argv) => (await Promise.resolve().then(() => (init_check(), check_exports))).run(argv)
	},
	export: {
		summary: "Render and check every card",
		usage: "export [--locale de-DE] [--kind phone] [--card 0] [--strict] [--fastlane] [--prune] [--jobs 4] [--json]",
		run: async (argv) => (await Promise.resolve().then(() => (init_export(), export_exports))).run(argv)
	},
	recapture: {
		summary: "Build the app, capture on the emulator or simulator and export",
		usage: "recapture [locale…] [--boot] [--profile phone] [--serial emulator-5578] [--simulator \"iPhone 17 Pro Max\"] [--no-build] [--no-capture] [--no-export] [--dry-run]",
		run: async (argv) => (await Promise.resolve().then(() => (init_recapture(), recapture_exports))).run(argv)
	},
	tour: {
		summary: "Run the capture tour by hand: one language, on the capture emulator or simulators",
		usage: "tour [--locale en-US] [--profile phone,tablet7] [--only 01-home,02-log] [--serial emulator-5578 | --simulator \"iPhone 17 Pro Max\"] [--<option> value…]",
		run: async (argv) => {
			const option = (name) => {
				const i = argv.indexOf(`--${name}`);
				return i >= 0 ? argv[i + 1] : void 0;
			};
			const { requireListing, loadListing } = await Promise.resolve().then(() => (init_project(), project_exports));
			const listing = requireListing();
			const { tourFile } = await Promise.resolve().then(() => (init_recapture(), recapture_exports));
			const list = (name) => option(name)?.split(",").map((s) => s.trim()).filter(Boolean);
			const options = {};
			for (let i = 0; i < argv.length; i++) {
				const name = argv[i].match(/^--(.+)$/)?.[1];
				if (!name) continue;
				const value = argv[i + 1] !== void 0 && !argv[i + 1].startsWith("--") ? argv[++i] : true;
				if (![
					"locale",
					"profile",
					"only",
					"serial",
					"simulator"
				].includes(name)) options[name.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
			}
			try {
				const file = tourFile(listing);
				const { runTour } = await Promise.resolve().then(() => (init_tour(), tour_exports));
				const { DEFAULT_SERIAL } = await Promise.resolve().then(() => (init_recapture(), recapture_exports));
				const written = await runTour(file, {
					listing,
					locale: option("locale") || loadListing(listing).defaultLocale,
					profiles: list("profile"),
					only: list("only"),
					serial: option("serial") || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL,
					simulator: option("simulator") || process.env.CAPTURE_SIMULATOR,
					options
				});
				console.log(`${written.length} capture(s) written`);
				return 0;
			} catch (error) {
				console.error(error.message);
				return 1;
			}
		}
	},
	screen: {
		summary: "What the capture emulator (or a simulator) shows: a screenshot and every element to tap, for writing a tour",
		usage: "screen [--serial emulator-5578 | --simulator \"iPhone 17 Pro Max\"] [--out screen.png] [--json] [--tap \"Settings\" | --tap 540,1200 | --back]",
		run: async (argv) => (await Promise.resolve().then(() => (init_emulator(), emulator_exports))).run(argv)
	},
	reset: {
		summary: "Undo a capture that was interrupted (display size, density, demo mode; a simulator's status bar and appearance)",
		usage: "reset [--serial emulator-5578 | --simulator \"iPhone 17 Pro Max\"]",
		run: async (argv) => {
			const option = (name) => {
				const i = argv.indexOf(`--${name}`);
				return i >= 0 ? argv[i + 1] : void 0;
			};
			try {
				if (option("simulator")) {
					const { findSimulator } = await Promise.resolve().then(() => (init_ios(), ios_exports));
					const { Simulator } = await Promise.resolve().then(() => (init_simulator(), simulator_exports));
					const found = findSimulator(option("simulator"));
					new Simulator(found.udid, found.name).reset();
					console.log(`${found.name} reset`);
					return 0;
				}
				const { Emulator } = await Promise.resolve().then(() => (init_emulator$1(), emulator_exports$1));
				const { DEFAULT_SERIAL } = await Promise.resolve().then(() => (init_recapture(), recapture_exports));
				const serial = option("serial") || process.env.CAPTURE_SERIAL || DEFAULT_SERIAL;
				new Emulator(serial).reset();
				console.log(`${serial} reset`);
				return 0;
			} catch (error) {
				console.error(error.message);
				return 1;
			}
		}
	},
	locales: {
		summary: "Language coverage, or add a language",
		usage: "locales [--init de-DE]",
		run: async (argv) => (await Promise.resolve().then(() => (init_locales(), locales_exports))).run(argv)
	},
	icons: {
		summary: "Every app icon from one drawing",
		usage: "icons [brand/icon.json] | icons --import drawable.xml",
		run: async (argv) => (await Promise.resolve().then(() => (init_icon(), icon_exports))).run(argv)
	},
	fixtures: {
		summary: "Build fictional apps to install on the capture emulator",
		usage: "fixtures fixture-apps.json [--install emulator-5578] [--uninstall emulator-5578]",
		run: async (argv) => (await Promise.resolve().then(() => (init_fixture_apps(), fixture_apps_exports))).run(argv)
	},
	mcp: {
		summary: "Run as an MCP server, so agents can check, render and look at cards",
		usage: "mcp [--listing path/to/app]",
		run: async (argv) => (await Promise.resolve().then(() => (init_mcp(), mcp_exports))).run(argv)
	},
	readme: {
		summary: "Preview the README as GitHub shows it",
		usage: "readme [--out file.png] [--width 1012]",
		run: async (argv) => (await Promise.resolve().then(() => (init_readme_preview(), readme_preview_exports))).run(argv)
	}
};
const ALIASES = {
	serve: "studio",
	editor: "studio",
	icon: "icons",
	"fixture-apps": "fixtures",
	"readme-preview": "readme"
};
const version = () => {
	try {
		return node_fs.default.readFileSync(node_path.default.join(__dirname, "VERSION"), "utf8").trim();
	} catch {
		return "?";
	}
};
function help() {
	console.log(`Screenshot Studio ${version()}: real app screens in, store and README art out.\n\nUsage: npx screenshot-studio <command> [options]\n`);
	for (const [name, command] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(11)} ${command.summary}`);
	console.log("\nEvery command works on the app you run it in, or on `--listing path/to/app`.");
	console.log("Run `npx screenshot-studio <command> --help` for its options. Docs: https://github.com/bernaferrari/screenshot-studio");
}
async function main(argv) {
	const at = argv.indexOf("--listing");
	if (at >= 0) {
		const target = node_path.default.resolve(argv[at + 1] || "");
		if (!node_fs.default.existsSync(target)) {
			console.error(`No folder ${target}`);
			return 1;
		}
		process.chdir(node_path.default.basename(target) === "store-listing" ? node_path.default.dirname(target) : target);
		argv = argv.filter((_, i) => i !== at && i !== at + 1);
	}
	const [first, ...rest] = argv;
	if (!first || first === "help" || first === "--help" || first === "-h") {
		help();
		return 0;
	}
	if (first === "--version" || first === "-v" || first === "version") {
		console.log(version());
		return 0;
	}
	const name = ALIASES[first] || first;
	const command = COMMANDS[name];
	if (!command) {
		console.error(`Unknown command "${first}".\n`);
		help();
		return 1;
	}
	if (rest.includes("--help") || rest.includes("-h")) {
		console.log(`${command.summary}\n\n  npx screenshot-studio ${command.usage}`);
		return 0;
	}
	try {
		return await command.run(rest);
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}
if (require.main === module) main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
}, (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
exports.TapMap = TapMap;
exports.appleLanguage = appleLanguage;
exports.bootEmulator = bootEmulator;
exports.boundsFor = boundsFor;
exports.boundsProblem = boundsProblem;
exports.calloutPlacement = calloutPlacement;
exports.cardsFor = cardsFor;
exports.checkListing = checkListing;
exports.copyKeys = copyKeys;
exports.createWorkspaceStore = createWorkspaceStore;
exports.devicesFor = devicesFor;
exports.exportListing = exportListing;
exports.findListing = findListing;
exports.followCallout = followCallout;
exports.formatIssues = formatIssues;
exports.formatSummary = formatSummary;
exports.frameSize = frameSize;
exports.hasDeviceRatio = hasDeviceRatio;
exports.imageSize = imageSize;
exports.isWidow = isWidow;
exports.loadListing = loadListing;
exports.main = main;
exports.matcher = matcher;
exports.nodesFile = nodesFile;
exports.outputFile = outputFile;
exports.parseHeadline = parseHeadline;
exports.parseHighlight = parseHighlight;
exports.readJson = readJson;
exports.recapture = recapture;
exports.requireListing = requireListing;
exports.requiredCopyFields = requiredCopyFields;
exports.runTour = runTour;
exports.serve = serve;
exports.tourFile = tourFile;
exports.validate = validate;
exports.withCopy = withCopy;
exports.withoutMeta = withoutMeta;
exports.writeJson = writeJson;
