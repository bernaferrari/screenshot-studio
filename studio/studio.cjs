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
let node_child_process = require("node:child_process");
let node_os = require("node:os");
node_os = __toESM(node_os, 1);
let node_http = require("node:http");
node_http = __toESM(node_http, 1);
let node_crypto = require("node:crypto");
let node_util = require("node:util");
let node_url = require("node:url");
// src/core/gallery.ts
var gallery_exports = /* @__PURE__ */ __exportAll({
	cardsFor: () => cardsFor,
	copyKeys: () => copyKeys,
	devicesFor: () => devicesFor,
	followCallout: () => followCallout,
	nodesFile: () => nodesFile,
	outputFile: () => outputFile,
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
* The store-listing folder for a command: an explicit path (an app folder or its store-listing), else the folder
* this studio copy lives in, else the nearest store-listing/ above the working directory.
*/
function findListing(explicit, from = process.cwd()) {
	const resolve = (dir) => {
		if (node_fs.default.existsSync(node_path.default.join(dir, "studio.json"))) return dir;
		if (node_fs.default.existsSync(node_path.default.join(dir, "store-listing", "studio.json"))) return node_path.default.join(dir, "store-listing");
		return null;
	};
	if (explicit) return resolve(node_path.default.resolve(explicit));
	const own = node_path.default.resolve(__dirname, "..");
	if (node_fs.default.existsSync(node_path.default.join(own, "studio.json"))) return own;
	for (let dir = node_path.default.resolve(from);; dir = node_path.default.dirname(dir)) {
		const found = resolve(dir);
		if (found) return found;
		if (node_path.default.dirname(dir) === dir) return null;
	}
}
var readCopy;
var init_project = __esmMin((() => {
	init_gallery();
	readCopy = (listing, locale) => readJson(node_path.default.join(listing, locale, "copy.json"), {});
}));
// src/node/workspace/store.ts
/** Local project registration and coverage. It never modifies a connected project's files. */
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
			else if (entry.isFile() && IMAGE.test(entry.name) && !seen.has(file)) {
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
			const { cardsFor, devicesFor, nodesFile, outputFile } = await Promise.resolve().then(() => (init_gallery(), gallery_exports));
			const reference = config.defaultLocale || "en-US", languages = config.locales || [reference];
			if (!languages.length || languages.some((locale) => !localePattern.test(locale))) throw Error("studio.json has an invalid language list.");
			const copy = readJson(node_path.default.join(listing, reference, "copy.json"), {});
			const fields = Object.entries(copy).flatMap(([key, values]) => Object.keys(values).map((field) => ({
				key,
				field
			})));
			const raws = /* @__PURE__ */ new Set(), outputs = [], galleries = [];
			const requiredRaws = (card) => [...devicesFor(card).map((d) => d.raw), ...(card.callouts || []).map((c) => c.raw).filter((raw) => Boolean(raw))];
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
						raws: requiredRaws(card)
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
				const translated = fields.filter(({ key, field }) => {
					const text = own?.[key]?.[field];
					return typeof text === "string" && text.trim();
				}).length;
				const captures = [...raws].filter((raw) => {
					const file = fileIn(locale, "raw", raw);
					return file && exists(file);
				}).length;
				const layouts = [...raws].filter((raw) => {
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
				const complete = requiredOutputs.length > 0 && translated === fields.length && captures === raws.size && layouts === raws.size && exported === requiredOutputs.length;
				const next = translated < fields.length ? "copy" : captures < raws.size ? "capture" : layouts < raws.size ? "layout" : exported < requiredOutputs.length ? "export" : requiredOutputs.length ? "review" : "cards";
				locales.push({
					locale,
					translated,
					fields: fields.length,
					captures,
					expectedCaptures: raws.size,
					layouts,
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
			if (studio || markers || depth > 0 && /screenshots?/i.test(node_path.default.basename(dir)) && entries.some((entry) => entry.isFile() && IMAGE.test(entry.name))) {
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
var SKIP, MARKERS, IMAGE, errorCode, localePattern, exists, inside, statusError, assetURL;
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
	IMAGE = /\.(png|jpe?g|webp)$/i;
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
			const match = pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(files|reveal))?$/);
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
* Local Screenshot Studio server. In the master repository it opens the project overview;
* in an app repository it also keeps the standalone editor available.
*   node studio/server.cjs [port] [--add /path/to/app] [--registry /path/to/projects.json]
*/
var server_exports = /* @__PURE__ */ __exportAll({
	run: () => run$8,
	serve: () => serve
});
function writable(file, listingRoot) {
	const relative = node_path.default.relative(listingRoot, file).split(node_path.default.sep);
	return relative.length === 1 && relative[0] === "gallery.json" || relative.length === 2 && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(relative[0]) && relative[1] === "copy.json";
}
function serve(root, port = 0, { editable = false, workspace = null, activeProjectId = null, selectFolder } = {}) {
	root = node_path.default.resolve(root);
	const hub = workspace ? workspaceRoutes({
		store: workspace,
		uiDirectory: __dirname,
		activeProjectId,
		selectFolder
	}) : null;
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
				response.writeHead(failure.code === "ENOENT" ? 404 : request.method === "PUT" ? 400 : 500).end(failure.code === "ENOENT" ? "Not found" : failure.message);
			}
		}
		try {
			if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host || "")) {
				response.writeHead(403).end("Use the local Studio address");
				return;
			}
			const pathname = decodeURIComponent(new URL(request.url || "/", "http://local").pathname);
			if (hub && await hub(request, response, pathname, serveFile)) return;
			await serveFile(root, pathname);
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
async function run$8(argv) {
	const value = (flag) => {
		const index = argv.indexOf(flag);
		return index < 0 ? void 0 : argv[index + 1];
	};
	const port = Number(value("--port") || (argv[0] && !argv[0].startsWith("--") ? argv[0] : 8790));
	const workspace = createWorkspaceStore({ registryFile: value("--registry") });
	const app = node_fs.default.existsSync(node_path.default.join(listing, "studio.json"));
	const root = app ? node_path.default.dirname(listing) : listing;
	let activeProjectId = null;
	if (app) activeProjectId = (await workspace.add([root]))[0].id;
	for (let index = 0; index < argv.length; index++) if (argv[index] === "--add") await workspace.add([argv[++index]]);
	await serve(root, port, {
		editable: true,
		workspace,
		activeProjectId
	});
	const url = app ? `http://127.0.0.1:${port}/store-listing/studio/` : `http://127.0.0.1:${port}/studio/`;
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
var types, listing;
var init_server = __esmMin((() => {
	init_store();
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
	listing = node_path.default.resolve(__dirname, "..");
}));
// src/node/export.ts
/**
* Render every card to a store-ready image and check the composition. Requires Playwright
* (set PLAYWRIGHT_MODULE to an existing installation if it is not resolvable from here).
*   node store-listing/studio/export.cjs [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--json]
* Without --locale every locale in studio.json is rendered. --strict fails when a non-default locale
* still borrows default-locale words or captures, or a callout could not follow its UI element.
* It also warns (and --strict fails) when a gallery folder holds images no card writes any more, when a
* continuous background (theme `continuous`) breaks at a seam, and when <locale>/listing.json is over Play's
* limits. --fastlane writes fastlane/metadata/android/<locale>/ text and screenshots (studio.json "fastlane").
* --json prints the result as JSON (for agents and tools); exportListing() returns the same result.
*/
var export_exports = /* @__PURE__ */ __exportAll({
	exportListing: () => exportListing,
	formatSummary: () => formatSummary,
	run: () => run$7
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
/** Render, check and write a listing's cards. Never throws for a card problem: the result says what failed. */
async function exportListing(options = {}) {
	const log = options.log || ((line) => console.log(line));
	const listing = options.listing ? node_path.default.resolve(options.listing) : node_path.default.resolve(__dirname, "..");
	const repo = node_path.default.dirname(listing);
	const { config, profiles, galleries } = loadListing(listing);
	const defaultLocale = config.defaultLocale || "en-US";
	const warnings = [];
	const cards = [];
	const tallies = [];
	const staged = [];
	const warn = (message) => {
		warnings.push(message);
		log(`warning: ${message}`);
	};
	const lane = {
		dir: "fastlane/metadata/android",
		screenshots: { phone: "images/phoneScreenshots" },
		screenshotLocales: [defaultLocale],
		locales: {},
		...config.fastlane
	};
	const laneDir = (locale) => node_path.default.join(repo, lane.dir, lane.locales[locale] || locale);
	const laneShots = (locale, kind) => options.fastlane && lane.screenshots[kind] && (lane.screenshotLocales === "all" || lane.screenshotLocales.includes(locale)) ? node_path.default.join(laneDir(locale), lane.screenshots[kind]) : null;
	const listingFor = (locale) => {
		const json = readJson(node_path.default.join(listing, locale, "listing.json"), null);
		return json && {
			...json,
			title: json.title ?? json.appName
		};
	};
	const { cardsFor, devicesFor, outputFile } = await Promise.resolve().then(() => (init_gallery(), gallery_exports));
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
	let server = null, browser = null;
	let failures = 0;
	try {
		server = await serve(repo);
		const address = server.address();
		const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/${node_path.default.relative(repo, listing).split(node_path.default.sep).join("/")}`;
		browser = await chromium.launch();
		for (const locale of options.locales?.length ? options.locales : config.locales || [defaultLocale]) {
			const dir = node_path.default.join(listing, locale);
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
			for (const kind of Object.keys(galleries)) {
				if (options.kind && options.kind !== kind) continue;
				if (profiles[kind].defaultLocaleOnly && locale !== defaultLocale) continue;
				const slides = cardsFor(galleries, kind);
				const { width, height } = profiles[kind];
				manifest.galleries[kind] = [];
				const edges = [];
				const destination = options.card === void 0 ? laneShots(locale, kind) : null;
				const shots = destination ? node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "studio-fastlane-")) : null;
				if (shots && destination) staged.push({
					shots,
					destination
				});
				for (const [i, slide] of slides.entries()) {
					if (options.card !== void 0 && options.card !== i) continue;
					const file = outputFile(kind, slide, i);
					const page = await browser.newPage({
						viewport: {
							width,
							height
						},
						deviceScaleFactor: config.supersample || 1,
						locale
					});
					const errors = [];
					page.on("pageerror", (e) => errors.push(e.message));
					page.on("requestfailed", (r) => errors.push(`Failed to load ${r.url()}`));
					page.on("response", (r) => {
						if (r.status() >= 400 && !/\/(copy|[^/]+\.nodes)\.json$|\/raw\//.test(new URL(r.url()).pathname)) errors.push(`${r.status()} ${r.url()}`);
					});
					const label = `${locale}/${file}`;
					await page.goto(`${base}/studio/preview.html?locale=${locale}&kind=${kind}&slide=${i}`);
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
					const bytes = png && slide.transparent ? await rgba(page, shot) : shot;
					node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, file)), { recursive: true });
					node_fs.default.writeFileSync(node_path.default.join(dir, file), bytes);
					written.add(node_path.default.join(dir, file));
					if (shots) node_fs.default.writeFileSync(node_path.default.join(shots, `${i + 1}.png`), await page.screenshot({
						type: "png",
						scale: "css"
					}));
					if (report.continuous && !profiles[kind].defaultLocaleOnly) edges[i] = await edgeColumns(page, width, height);
					await page.close();
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
					cards.push(card);
					manifest.galleries[kind].push({
						...card,
						file,
						slide: i,
						sources: devicesFor(slide).map((d) => `raw/${d.raw}`)
					});
					log(`${label}${notes.length ? `  (${notes.join("; ")})` : ""}`);
				}
				for (let i = 0; i + 1 < edges.length; i++) {
					const rows = edges[i] && edges[i + 1] ? seamBreak(edges[i][1], edges[i + 1][0]) : null;
					if (rows !== null) warn(`${locale}/${kind}: the background breaks at the seam between cards ${i + 1} and ${i + 2} (${rows}% of rows differ)`);
				}
				if (options.card !== void 0 || slides.length < 2 || profiles[kind].defaultLocaleOnly || (config.contactSheets || {})[kind] === false) continue;
				const h = width > height ? 600 : 960, w = Math.round(h * width / height);
				const sheet = await browser.newPage({ viewport: {
					width: w * slides.length,
					height: h
				} });
				await sheet.setContent(`<body style="margin:0;display:flex">${manifest.galleries[kind].map((m) => `<img src="${base}/${locale}/${m.file}?t=${Date.now()}" style="height:${h}px;width:${w}px">`).join("")}</body>`);
				await sheet.waitForLoadState("networkidle");
				const sheetName = (config.contactSheets || {})[kind] || `contact-${kind}.jpg`;
				written.add(node_path.default.join(dir, sheetName));
				node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, sheetName)), { recursive: true });
				await sheet.screenshot({
					path: node_path.default.join(dir, sheetName),
					type: "jpeg",
					quality: 90
				});
				await sheet.close();
			}
			for (const strip of locale === defaultLocale && options.card === void 0 ? config.readmeStrips || [] : []) {
				if (options.kind && options.kind !== strip.kind && options.kind !== "strips") continue;
				const { width, height } = profiles[strip.kind];
				const shots = [];
				for (const [n, i] of strip.cards.entries()) {
					const position = strip.cards.length === 1 ? "only" : n === 0 ? "first" : n === strip.cards.length - 1 ? "last" : "middle";
					const page = await browser.newPage({
						viewport: {
							width,
							height
						},
						deviceScaleFactor: config.supersample || 1,
						locale
					});
					await page.goto(`${base}/studio/preview.html?locale=${locale}&kind=${strip.kind}&slide=${i}&strip=${position}`);
					await page.locator("html[data-ready=\"true\"]").waitFor({ timeout: 3e4 });
					shots.push((await page.screenshot({
						type: "png",
						scale: "css"
					})).toString("base64"));
					await page.close();
				}
				const h = strip.height || 1200, w = Math.round(h * width / height);
				const sheet = await browser.newPage({ viewport: {
					width: w * shots.length,
					height: h
				} });
				await sheet.setContent(`<body style="margin:0;display:flex">${shots.map((s) => `<img src="data:image/png;base64,${s}" style="height:${h}px;width:${w}px">`).join("")}</body>`);
				await sheet.waitForLoadState("load");
				node_fs.default.mkdirSync(node_path.default.dirname(node_path.default.join(dir, strip.file)), { recursive: true });
				written.add(node_path.default.join(dir, strip.file));
				await sheet.screenshot({
					path: node_path.default.join(dir, strip.file),
					type: "jpeg",
					quality: config.jpegQuality || 92
				});
				await sheet.close();
				log(`${locale}/${strip.file}  (strip of ${strip.kind} ${strip.cards.map((i) => i + 1).join(", ")})`);
			}
			if (!options.kind) {
				const files = Object.values(manifest.galleries).flat().map((m) => node_path.default.join(dir, m.file));
				for (const folder of new Set(files.map((f) => node_path.default.dirname(f)))) for (const f of node_fs.default.readdirSync(folder)) if (IMAGES.test(f) && !written.has(node_path.default.join(folder, f))) warn(`${node_path.default.relative(listing, node_path.default.join(folder, f))} is no longer in the gallery; delete it`);
			}
			const words = listingFor(locale);
			for (const [field, max] of words ? LIMITS$1 : []) {
				const value = words[field];
				const length = typeof value === "string" ? [...value].length : 0;
				if (length > max) warn(`${locale}/listing.json ${String(field)} has ${length} characters; Play allows ${max}`);
			}
			if (options.fastlane && words) {
				node_fs.default.mkdirSync(laneDir(locale), { recursive: true });
				for (const [field, name] of [
					["title", "title"],
					["shortDescription", "short_description"],
					["fullDescription", "full_description"]
				]) {
					const value = words[field];
					if (typeof value === "string") node_fs.default.writeFileSync(node_path.default.join(laneDir(locale), `${name}.txt`), `${value.trimEnd()}\n`);
				}
			}
			if (config.writeAssets !== false && !options.kind) node_fs.default.writeFileSync(node_path.default.join(dir, "assets.json"), JSON.stringify(manifest, null, 2) + "\n");
			tallies.push(tally);
			if (options.strict && locale !== defaultLocale && (tally.untranslated || tally.borrowedCaptures || tally.fixedCallouts)) failures++;
		}
		if (failures) throw new Error(`--strict: ${failures} locale(s) still borrow ${defaultLocale} words, captures or callout positions`);
		if (options.strict && warnings.length) throw new Error(`--strict: ${warnings.length} warning(s)`);
		for (const { shots, destination } of staged) {
			node_fs.default.mkdirSync(destination, { recursive: true });
			for (const f of node_fs.default.readdirSync(destination)) if (IMAGES.test(f)) node_fs.default.rmSync(node_path.default.join(destination, f));
			for (const f of node_fs.default.readdirSync(shots)) node_fs.default.copyFileSync(node_path.default.join(shots, f), node_path.default.join(destination, f));
		}
		return {
			ok: true,
			cards,
			warnings,
			locales: tallies
		};
	} catch (error) {
		return {
			ok: false,
			cards,
			warnings,
			locales: tallies,
			error: error instanceof Error ? error.message : String(error)
		};
	} finally {
		for (const { shots } of staged) node_fs.default.rmSync(shots, {
			recursive: true,
			force: true
		});
		await browser?.close();
		server?.close();
	}
}
/** The summary table the command line prints. */
function formatSummary(result) {
	const lines = ["locale      cards  untranslated  borrowed captures  moved callouts  unresolved callouts  shrunk copy"];
	for (const t of result.locales) lines.push(`${t.locale.padEnd(10)}  ${String(t.cards).padStart(5)}  ${String(t.untranslated).padStart(12)}  ${String(t.borrowedCaptures).padStart(17)}  ${String(t.movedCallouts).padStart(14)}  ${String(t.fixedCallouts).padStart(19)}  ${String(t.shrunk).padStart(11)}`);
	if (result.warnings.length) lines.push("", `${result.warnings.length} warning(s):`, ...result.warnings.map((w) => `  ${w}`));
	return lines.join("\n");
}
/** `export [--locale de-DE] [--kind phone] [--card 3] [--strict] [--fastlane] [--json]` */
async function run$7(argv) {
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const json = argv.includes("--json");
	const card = arg("card");
	const result = await exportListing({
		locales: arg("locale") ? [arg("locale")] : void 0,
		kind: arg("kind"),
		card: card === void 0 ? void 0 : Number(card),
		strict: argv.includes("--strict"),
		fastlane: argv.includes("--fastlane"),
		listing: arg("listing"),
		log: json ? () => {} : void 0
	});
	if (json) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`\n${formatSummary(result)}`);
		if (result.error) console.error(`\n${result.error}`);
	}
	return result.ok ? 0 : 1;
}
var LIMITS$1, IMAGES;
var init_export = __esmMin((() => {
	init_project();
	init_server();
	LIMITS$1 = [
		["title", 30],
		["shortDescription", 80],
		["fullDescription", 4e3]
	];
	IMAGES = /\.(jpe?g|png|webp)$/i;
}));
// src/node/recapture.ts
/**
* Rebuild the capture app, capture on the emulator, and export, as studio.json's "capture" block says:
*   node store-listing/studio/recapture.cjs [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]
* Without locales every locale in studio.json is exported, and captured where a run asks for it.
*
*   "capture": {
*     "build": "./gradlew :app:assembleStoreCapture",               shell command, run from the repository
*     "install": [{"apk": "app/build/…/app-storeCapture.apk", "package": "com.example.storecapture"}],
*     "runs": [{"script": "store-listing/capture-emulator.py",      (the default)
*               "args": ["--theme", "dark"],                         ${NAME} reads an environment variable
*               "profiles": ["phone", "tablet7"],                    default: every capture profile; false: no --profile
*               "locales": "default"}],                              "all" (default), "default" or a list
*     "retries": 2,                                                  per capture run
*     "serial": "emulator-5578",                                     the capture emulator (or CAPTURE_SERIAL)
*     "avd": "Pixel_9_API_36",                                       what --boot starts when it isn't running
*     "export": "cd store-listing && node render.mjs --locale {locale}",  instead of studio/export.cjs, per locale
*     "after": ["python3 store-listing/prepare.py"]                  shell commands once everything is exported
*   }
*
* Each run is `python3 <script> --serial <emulator> --locale <locale> [--profile <profile>] <args>`, through
* `uv run --with pillow` when uv is installed. The default locale goes first, since it records the tap map
* other locales replay. --boot starts the capture emulator headless when it isn't running and waits for it.
*/
var recapture_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_SERIAL: () => DEFAULT_SERIAL,
	bootEmulator: () => bootEmulator,
	booted: () => booted,
	recapture: () => recapture,
	run: () => run$6
});
/** Whether the emulator is attached and has finished booting. */
function booted(serial) {
	return adb(serial, "shell", "getprop", "sys.boot_completed").stdout?.trim() === "1";
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
	const { config, profiles, repo, defaultLocale, locales: configured } = loadListing(options.listing ? node_path.default.resolve(options.listing) : node_path.default.resolve(__dirname, ".."));
	const capture = config.capture;
	const locales = options.locales?.length ? [...options.locales] : [...configured];
	const result = {
		ok: false,
		locales,
		failedExports: []
	};
	try {
		if (!capture) throw new Error("studio.json has no \"capture\" block; see docs/capture.md");
		const serial = options.serial || capture.serial || process.env.CAPTURE_SERIAL || "emulator-5578";
		if (!serial.startsWith("emulator-")) throw new Error("Use a capture emulator, never a physical phone.");
		const unknown = locales.filter((locale) => !configured.includes(locale));
		if (unknown.length) throw new Error(`Not in studio.json locales: ${unknown.join(", ")}`);
		locales.sort((a, b) => Number(b === defaultLocale) - Number(a === defaultLocale));
		const captureProfiles = Object.keys(profiles).filter((name) => profiles[name].captureDensity);
		if (options.profile && !profiles[options.profile]?.captureWidth) throw new Error(`No capture profile ${options.profile} in profiles.json`);
		const python = has("uv") ? [
			"uv",
			"run",
			"-q",
			"--with",
			"pillow",
			"python3"
		] : ["python3"];
		const env = {
			...process.env,
			CAPTURE_SERIAL: serial,
			ANDROID_SERIAL: serial
		};
		const expand = (word) => String(word).replace(/\$\{(\w+)\}/g, (_, name) => {
			if (env[name] === void 0) throw new Error(`Set ${name} for this capture (studio.json capture args use it)`);
			return env[name];
		});
		const run = (command, args = [], { shell = false, check = true } = {}) => {
			const line = shell ? command : [command, ...args].join(" ");
			log(`\n$ ${line}`);
			if (options.dryRun) return true;
			const done = shell ? (0, node_child_process.spawnSync)("sh", ["-c", command], {
				cwd: repo,
				env,
				stdio: "inherit"
			}) : (0, node_child_process.spawnSync)(command, args, {
				cwd: repo,
				env,
				stdio: "inherit"
			});
			if (done.status !== 0 && check) throw new Error(`Failed (${done.status ?? done.signal}): ${line}`);
			return done.status === 0;
		};
		const studioPy = node_path.default.relative(repo, node_path.default.join(__dirname, "capture.py"));
		if (options.build !== false && capture.build) run(capture.build, [], { shell: true });
		if (options.capture !== false) {
			if (options.boot && !options.dryRun) await bootEmulator(serial, capture.avd, log);
			for (const { apk, package: id } of capture.install || []) run(python[0], [
				...python.slice(1),
				studioPy,
				"install",
				apk,
				"--package",
				id,
				"--serial",
				serial
			]);
			for (const locale of locales) for (const spec of capture.runs || [{}]) {
				const wanted = spec.locales || "all";
				if (wanted === "default" ? locale !== defaultLocale : Array.isArray(wanted) && !wanted.includes(locale)) continue;
				const runProfiles = spec.profiles === false ? [null] : (spec.profiles || captureProfiles).filter((name) => !options.profile || name === options.profile);
				for (const profile of runProfiles) {
					const args = [
						...python.slice(1),
						spec.script || "store-listing/capture-emulator.py",
						"--serial",
						serial,
						"--locale",
						locale,
						...profile ? ["--profile", profile] : [],
						...(spec.args || []).map(expand)
					];
					const attempts = (capture.retries ?? 2) + 1;
					for (let attempt = 1;; attempt++) {
						if (run(python[0], args, { check: attempt === attempts })) break;
						log(`Capture failed; reset the emulator and try again (${attempt + 1}/${attempts})`);
						run(python[0], [
							...python.slice(1),
							studioPy,
							"reset",
							"--serial",
							serial
						]);
					}
				}
			}
		}
		if (options.export !== false) {
			result.failedExports = locales.filter((locale) => !(capture.export ? run(capture.export.replaceAll("{locale}", locale), [], {
				shell: true,
				check: false
			}) : run("node", [
				node_path.default.relative(repo, node_path.default.join(__dirname, "studio.cjs")),
				"export",
				"--locale",
				locale
			], { check: false })));
			if (result.failedExports.length) throw new Error(`Export failed for ${result.failedExports.join(", ")}; captures are in place. Fix those and export again.`);
			for (const command of capture.after || []) run(command, [], { shell: true });
		}
		log(`\nRecaptured ${locales.join(", ")}${options.dryRun ? " (dry run)" : ""}.`);
		result.ok = true;
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
	}
	return result;
}
/** `recapture [locale…] [--profile phone] [--boot] [--no-build] [--no-capture] [--no-export] [--dry-run]` */
async function run$6(argv) {
	const flag = (name) => argv.includes(`--${name}`);
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const values = new Set([
		"profile",
		"serial",
		"listing"
	].map(option).filter(Boolean));
	const result = await recapture({
		locales: argv.filter((word) => !word.startsWith("--") && !values.has(word)),
		profile: option("profile"),
		serial: option("serial"),
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
var DEFAULT_SERIAL, sdkRoot, has, adb;
var init_recapture = __esmMin((() => {
	init_project();
	DEFAULT_SERIAL = "emulator-5578";
	sdkRoot = () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || [node_path.default.join(node_os.default.homedir(), "Library/Android/sdk"), node_path.default.join(node_os.default.homedir(), "Android/Sdk")].find((dir) => node_fs.default.existsSync(dir)) || "";
	has = (command) => (0, node_child_process.spawnSync)("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
	adb = (serial, ...args) => (0, node_child_process.spawnSync)("adb", [
		"-s",
		serial,
		...args
	], { encoding: "utf8" });
}));
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
	run: () => run$5
});
/** Width and height of a PNG or JPEG, read from its header. */
function imageSize(file) {
	const fd = node_fs.default.openSync(file, "r");
	try {
		const head = Buffer.alloc(65536);
		const length = node_fs.default.readSync(fd, head, 0, head.length, 0);
		if (head.readUInt32BE(0) === 2303741511) return {
			width: head.readUInt32BE(16),
			height: head.readUInt32BE(20)
		};
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
	const listing = listingDir ? node_path.default.resolve(listingDir) : node_path.default.resolve(__dirname, "..");
	const schemas = node_path.default.join(__dirname, "schemas");
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
		if (definition) for (const problem of validate(value, definition)) error(file, problem.message, { path: problem.path });
		return value;
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
	const locales = config.locales || [defaultLocale];
	counted.locales = locales.length;
	if (!locales.includes(defaultLocale)) error("studio.json", `defaultLocale ${defaultLocale} isn't in locales`, {
		path: "locales",
		fix: `Add "${defaultLocale}" to locales.`
	});
	for (const file of ["theme.css"]) if (!node_fs.default.existsSync(node_path.default.join(listing, file))) warn(file, "is missing; cards render unstyled");
	const ratios = Object.values(profiles).filter((p) => p.captureWidth && p.captureHeight).flatMap((p) => [p.captureWidth / p.captureHeight, p.captureHeight / p.captureWidth]);
	const defaultCopy = load(`${defaultLocale}/copy.json`, "copy", {}) || {};
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
		counted.galleries++;
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
	for (const key of Object.keys(defaultCopy)) if (!used.has(key)) warn(`${defaultLocale}/copy.json`, `"${key}" isn't used by any card`, {
		path: key,
		fix: "Remove it, or fix the card's feature name."
	});
	for (const locale of locales) {
		if (locale !== defaultLocale) {
			const file = `${locale}/copy.json`;
			if (!node_fs.default.existsSync(node_path.default.join(listing, file))) warn(file, "is missing; this language shows the default words", { fix: `Run \`npx screenshot-studio locales --init ${locale}\`.` });
			else load(file, "copy");
		}
		const words = readJson(node_path.default.join(listing, locale, "listing.json"), null);
		for (const [field, max] of words ? LIMITS : []) {
			const value = field === "title" ? words[field] ?? words.appName : words[field];
			const length = typeof value === "string" ? [...value].length : 0;
			if (length > max) error(`${locale}/listing.json`, `${String(field)} has ${length} characters; Play allows ${max}`, { path: String(field) });
		}
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
async function run$5(argv) {
	const at = argv.indexOf("--listing");
	const result = checkListing(at >= 0 ? argv[at + 1] : void 0);
	console.log(argv.includes("--json") ? JSON.stringify(result, null, 2) : formatIssues(result));
	return result.ok ? 0 : 1;
}
var LIMITS;
var init_check = __esmMin((() => {
	init_validate();
	init_gallery();
	init_project();
	LIMITS = [
		["title", 30],
		["shortDescription", 80],
		["fullDescription", 4e3]
	];
}));
// src/node/init.ts
/**
* Set up Screenshot Studio in an app, and keep its copy of the studio current.
*   npx screenshot-studio init [app-folder] [--name "My App"] [--package com.example.app] [--theme starter]
*                              [--screenshots ./folder] [--locales en-US,de-DE]
*   npx screenshot-studio sync [app-folder] [--check]
* `init` creates store-listing/ (never overwriting a file), copies the studio into store-listing/studio/, and with
* --screenshots builds the galleries from images you already have, so the first cards render with no emulator.
*/
var init_exports = /* @__PURE__ */ __exportAll({
	init: () => init,
	run: () => run$4,
	runSync: () => runSync,
	studioDrift: () => studioDrift,
	syncStudio: () => syncStudio,
	themes: () => themes,
	version: () => version$1
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
/** Copy the package's studio into the app (store-listing/studio/), replacing the old copy. */
function syncStudio(app) {
	const target = node_path.default.join(node_path.default.resolve(app), "store-listing", "studio");
	node_fs.default.rmSync(target, {
		recursive: true,
		force: true
	});
	node_fs.default.cpSync(STUDIO, target, {
		recursive: true,
		filter: (source) => !/(__pycache__|\.pyc$|\.DS_Store$)/.test(source)
	});
	return target;
}
/** Files that differ between the package's studio and the app's copy. */
function studioDrift(app) {
	const target = node_path.default.join(node_path.default.resolve(app), "store-listing", "studio");
	const list = (root) => node_fs.default.existsSync(root) ? node_fs.default.readdirSync(root, {
		recursive: true,
		withFileTypes: true
	}).filter((entry) => entry.isFile() && !/(__pycache__|\.pyc$|\.DS_Store$)/.test(node_path.default.join(entry.parentPath, entry.name))).map((entry) => node_path.default.relative(root, node_path.default.join(entry.parentPath, entry.name))) : [];
	const ours = new Set(list(STUDIO)), theirs = new Set(list(target));
	return [.../* @__PURE__ */ new Set([...ours, ...theirs])].filter((file) => !ours.has(file) || !theirs.has(file) || !node_fs.default.readFileSync(node_path.default.join(STUDIO, file)).equals(node_fs.default.readFileSync(node_path.default.join(target, file)))).sort();
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
function importScreenshots(folder, listing, locale, log) {
	const images = node_fs.default.readdirSync(folder).filter((file) => /\.(png|jpe?g|webp)$/i.test(file)).sort();
	if (!images.length) throw new Error(`No PNG, JPEG or WebP images in ${folder}`);
	const profiles = {}, galleries = {}, copy = {};
	for (const file of images) {
		const size = imageSize(node_path.default.join(folder, file));
		const target = size && galleryFor(size.width, size.height);
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
		node_fs.default.copyFileSync(node_path.default.join(folder, file), node_path.default.join(listing, locale, "raw", raw));
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
	if (!Object.keys(galleries).length) throw new Error(`None of the images in ${folder} has a phone or tablet shape`);
	return {
		profiles,
		galleries,
		copy
	};
}
function init(options = {}) {
	requirePackage();
	const log = options.log || ((line) => console.log(line));
	const app = node_path.default.resolve(options.app || ".");
	const listing = node_path.default.join(app, "store-listing");
	const name = options.name || node_path.default.basename(app);
	const pkg = options.package || "";
	const theme = options.theme || "starter";
	if (!node_fs.default.existsSync(node_path.default.join(THEMES, theme, "theme.css"))) throw new Error(`No theme "${theme}". Available: ${themes().map((t) => t.name).join(", ")}`);
	const locales = [.../* @__PURE__ */ new Set(["en-US", ...options.locales || []])];
	const result = {
		listing,
		created: [],
		kept: [],
		cards: 0,
		theme
	};
	const fill = (text) => text.replaceAll("{{name}}", name).replaceAll("{{package}}", pkg || "com.example.app");
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
	const template = (relative, target = relative) => write(target, fill(node_fs.default.readFileSync(node_path.default.join(TEMPLATES, relative), "utf8")));
	node_fs.default.mkdirSync(listing, { recursive: true });
	const config = {
		...readJson(node_path.default.join(TEMPLATES, "studio.json")),
		app: name,
		locales
	};
	if (pkg) config.package = pkg;
	else delete config.package;
	if (options.screenshots) {
		const imported = importScreenshots(node_path.default.resolve(options.screenshots), listing, "en-US", log);
		write("studio.json", config);
		write("profiles.json", {
			$schema: "./studio/schemas/profiles.schema.json",
			...imported.profiles
		});
		write("gallery.json", {
			$schema: "./studio/schemas/gallery.schema.json",
			...imported.galleries
		});
		write("en-US/copy.json", {
			$schema: "../studio/schemas/copy.schema.json",
			...imported.copy
		});
		result.cards = Object.values(imported.galleries).reduce((n, cards) => n + cards.length, 0);
	} else {
		if (pkg) config.capture = {
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
		if (pkg) template("capture-emulator.py");
		result.cards = 4;
	}
	template("en-US/listing.json");
	template("gitignore", ".gitignore");
	template("README.md");
	for (const file of ["theme.css", "theme.js"]) {
		const source = node_path.default.join(THEMES, theme, file);
		if (node_fs.default.existsSync(source)) write(file, fill(node_fs.default.readFileSync(source, "utf8")));
	}
	for (const asset of node_fs.default.existsSync(node_path.default.join(THEMES, theme, "assets")) ? node_fs.default.readdirSync(node_path.default.join(THEMES, theme, "assets")) : []) {
		const target = node_path.default.join(listing, "assets", asset);
		if (node_fs.default.existsSync(target)) {
			result.kept.push(`assets/${asset}`);
			continue;
		}
		node_fs.default.mkdirSync(node_path.default.dirname(target), { recursive: true });
		node_fs.default.copyFileSync(node_path.default.join(THEMES, theme, "assets", asset), target);
		result.created.push(`assets/${asset}`);
	}
	syncStudio(app);
	log(`synced    store-listing/studio (v${version$1()})`);
	return result;
}
/** `init [app] [--name …] [--package …] [--theme …] [--screenshots folder] [--locales a,b]` */
async function run$4(argv) {
	const option = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : void 0;
	};
	const values = new Set([
		"name",
		"package",
		"theme",
		"screenshots",
		"locales"
	].map(option));
	const app = argv.find((word) => !word.startsWith("--") && !values.has(word));
	try {
		const result = init({
			app,
			name: option("name"),
			package: option("package"),
			theme: option("theme"),
			screenshots: option("screenshots"),
			locales: option("locales")?.split(",").map((l) => l.trim()).filter(Boolean)
		});
		const where = node_path.default.relative(process.cwd(), node_path.default.dirname(result.listing)) || ".";
		const cd = where === "." ? "" : `cd ${where} && `;
		console.log(`\nReady: ${result.cards} card(s) with the ${result.theme} theme.\n`);
		console.log(option("screenshots") ? `Next:\n  ${cd}npx screenshot-studio export        render the cards\n  npx screenshot-studio studio --open  edit words and look in the editor` : `Next:\n  1. Add a capture build that fills the app with sample data (docs/playbook.md, section 1)\n  2. Write the tour in store-listing/capture-emulator.py\n  3. ${cd}npx screenshot-studio recapture --boot`);
		return 0;
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}
/** `sync [app] [--check]` */
async function runSync(argv) {
	requirePackage();
	const app = node_path.default.resolve(argv.find((word) => !word.startsWith("--")) || ".");
	if (!node_fs.default.existsSync(node_path.default.join(app, "store-listing", "studio.json"))) {
		console.error(`No store-listing/studio.json in ${app}`);
		return 1;
	}
	if (argv.includes("--check")) {
		const drift = studioDrift(app);
		console.log(drift.length ? `${drift.length} file(s) differ from v${version$1()}:\n${drift.map((f) => `  ${f}`).join("\n")}` : `store-listing/studio is current (v${version$1()}).`);
		return drift.length ? 1 : 0;
	}
	syncStudio(app);
	console.log(`Synced studio v${version$1()} into ${node_path.default.join(app, "store-listing", "studio")}`);
	return 0;
}
var PACKAGE, STUDIO, TEMPLATES, THEMES, version$1, requirePackage, slug, words;
var init_init = __esmMin((() => {
	init_check();
	init_project();
	PACKAGE = node_path.default.resolve(__dirname, "..");
	STUDIO = node_path.default.join(PACKAGE, "studio");
	TEMPLATES = node_path.default.join(PACKAGE, "templates", "starter");
	THEMES = node_path.default.join(PACKAGE, "themes");
	version$1 = () => node_fs.default.readFileSync(node_path.default.join(STUDIO, "VERSION"), "utf8").trim();
	requirePackage = () => {
		if (!node_fs.default.existsSync(TEMPLATES)) throw new Error("Run this from the Screenshot Studio package: `npx screenshot-studio init`.");
	};
	slug = (text) => text.toLowerCase().replace(/\.[a-z]+$/, "").replace(/^\d+[-_ ]*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
	words = (text) => slug(text).replace(/-/g, " ");
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
	run: () => run$3
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
	const fields = fieldCount(defaultCopy);
	const rows = locales.map((locale) => {
		const raws = [...capturesFor(files, locale)];
		const copy = readCopy(files.listing, locale);
		let done = 0;
		for (const [key, entry] of Object.entries(defaultCopy)) for (const field of Object.keys(entry)) if (copy[key]?.[field]?.trim()) done++;
		const exists = (file) => node_fs.default.existsSync(node_path.default.join(files.listing, locale, "raw", file));
		return {
			locale,
			isDefault: locale === defaultLocale,
			words: {
				done,
				total: fields
			},
			captures: {
				done: raws.filter((raw) => exists(raw)).length,
				total: raws.length
			},
			sidecars: {
				done: raws.filter((raw) => exists(nodesFile(raw))).length,
				total: raws.length
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
		"locale      words        captures     layout sidecars",
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
async function run$3(argv) {
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
var LOCALE, resolveListing, fieldCount, USAGE$3;
var init_locales = __esmMin((() => {
	init_gallery();
	init_project();
	LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
	resolveListing = (listing) => listing ? node_path.default.resolve(listing) : node_path.default.resolve(__dirname, "..");
	fieldCount = (copy) => Object.values(copy).reduce((n, entry) => n + Object.keys(entry).length, 0);
	USAGE$3 = `Usage:
  npx screenshot-studio locales                 words translated, captures present and layout sidecars per locale
  npx screenshot-studio locales --init de-DE    add a locale with empty copy fields to fill in the editor`;
}));
// src/node/icon.ts
/**
* The icon factory: one drawing, every icon an app ships.
*   npx screenshot-studio icons [store-listing/brand/icon.json]
*   npx screenshot-studio icons --import drawable.xml > store-listing/brand/foreground.svg
* Needs Playwright (set PLAYWRIGHT_MODULE to an existing installation if it is not resolvable from here).
*
* An app draws its icon once, as SVG layers on Android's 108 x 108 adaptive canvas (launchers show the
* middle 72, from 18 to 90; keep the mark inside the 66-wide safe circle centred on 54, 54):
*   store-listing/brand/background.svg   the full-bleed ground
*   store-listing/brand/foreground.svg   the mark, on transparent
*   store-listing/brand/monochrome.svg   the mark in one colour, for Android's themed icons (optional)
* and lists where the icons go in store-listing/brand/icon.json, with paths from the repository root:
*   {
*     "android": {"res": "app/src/main/res", "legacy": true},
*     "files": [
*       {"path": "store-listing/brand/icon.png", "size": 512, "shape": "square"},
*       {"path": "web/favicon.svg", "shape": "circle"},
*       {"path": "web/favicon.ico", "shape": "rounded"},
*       {"path": "desktop/AppIcon.icns", "shape": "rounded"}
*     ]
*   }
* "opaque": true writes a PNG with no transparency (Apple's 1024px App Store icon must be opaque).
* A target's "scale" grows or shrinks the mark on its ground (an Apple icon shows the whole square, so
* its mark is usually larger than Android's safe zone allows). Shapes: "square" (full bleed; Play and app stores mask their own), "rounded" (a 22% corner, like a
* launcher), "circle", and "mark" (the foreground alone, on transparent); {"layer": "name"} draws one
* extra layer, brand/name.svg, alone. A path ending in .svg is written as vector, .ico holds 16-256px
* PNG entries, .icns is built with macOS's iconutil, and any other path is a PNG of the given size.
* A path ending in .icon is an Apple Icon Composer icon: {"path": "ios/AppIcon.icon", "apple":
* {"Background": "background", "Mark": "foreground"}} writes each layer as Assets/<Name>.png at 1024px
* (glass layers stay separate, so iOS can light them), keeps an existing icon.json (its glass, dark and
* tinted settings are tuned in Icon Composer) or writes a plain one, and checks it with Xcode's ictool.
*
* An existing Android vector drawable can become a layer as is: `npx screenshot-studio icons --import
* drawable.xml > brand/foreground.svg` (paths, groups, clips, alphas and gradients).
*
* Layers may embed bitmap art: an <image href="art.png"> beside the SVG is inlined when it is read.
* An app with several icons (launcher shortcuts, say) lists them as {"icons": [{"layers": "todo",
* "android": {...}, "files": [...]}, ...]}, each drawn in its own brand/<layers>/ folder; a layer missing
* there comes from brand/ itself, so a variant (a build flavour's tinted ground) redraws only what changes; "monochrome": false on an
* icon leaves out the themed layer.
*
* Android gets adaptive icons from bitmap layers at every density (foreground, background and, when
* monochrome.svg exists, a themed-icon layer), plus ic_launcher and ic_launcher_round PNGs for older
* launchers when "legacy" is true. "name" (default ic_launcher) and "type" ("mipmap", the default, or
* "drawable") match what the manifest refers to. Every run also writes store-listing/brand/icon-preview.png: the icon
* in every shape, at launcher sizes on light and dark, and themed, to check it at a glance.
* buildIcons() does the same from code and returns every file it wrote.
*/
var icon_exports = /* @__PURE__ */ __exportAll({
	buildIcons: () => buildIcons,
	importVector: () => importVector,
	run: () => run$2
});
/** Android VectorDrawable XML as an SVG on the 108 canvas: `npx screenshot-studio icons --import drawable.xml > layer.svg`. */
function importVector(file) {
	const text = node_fs.default.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
	const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1].replace(/^android:/, ""), m[2]]));
	const colour = (value, alpha = 1) => {
		if (!value || value === "@android:color/transparent") return ["none", 1];
		let hex = value.replace("#", "");
		if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
		if (hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
		let a = 1;
		if (hex.length === 8) {
			a = parseInt(hex.slice(0, 2), 16) / 255;
			hex = hex.slice(2);
		}
		return [`#${hex}`, +(a * alpha).toFixed(3)];
	};
	const vector = text.match(/<vector\b[^>]*>/);
	if (!vector) throw new Error(`${node_path.default.basename(file)} is not an Android vector drawable`);
	const root = attrs(vector[0]);
	const vw = parseFloat(root.viewportWidth), vh = parseFloat(root.viewportHeight);
	let out = "", ids = 0;
	const defs = [];
	const tokens = text.match(/<\/?(group|path|clip-path|aapt:attr|gradient|item)\b[^>]*>/g) || [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i], a = attrs(token);
		if (token.startsWith("</group")) {
			out += "</g>";
			continue;
		}
		if (token.startsWith("<group")) {
			const px = +(a.pivotX || 0), py = +(a.pivotY || 0);
			const t = [
				`translate(${+(a.translateX || 0) + px} ${+(a.translateY || 0) + py})`,
				`rotate(${a.rotation || 0})`,
				`scale(${a.scaleX || 1} ${a.scaleY || 1})`,
				`translate(${-px} ${-py})`
			];
			out += `<g transform="${t.join(" ")}">`;
			if (token.endsWith("/>")) out += "</g>";
		} else if (token.startsWith("<clip-path")) {
			const id = `clip${ids++}`;
			defs.push(`<clipPath id="${id}"><path d="${a.pathData}"/></clipPath>`);
			out += `<g clip-path="url(#${id})">`;
			let depth = 0;
			for (let j = i + 1; j < tokens.length; j++) {
				if (tokens[j].startsWith("<group") && !tokens[j].endsWith("/>")) depth++;
				if (tokens[j].startsWith("</group")) {
					if (depth === 0) {
						tokens.splice(j, 0, "</groupclip>");
						break;
					}
					depth--;
				}
			}
		} else if (token === "</groupclip>") out += "</g>";
		else if (token.startsWith("<path")) {
			let fill = colour(a.fillColor, +(a.fillAlpha ?? 1)), stroke = colour(a.strokeColor, +(a.strokeAlpha ?? 1));
			if (!token.endsWith("/>")) for (let j = i + 1; j < tokens.length && !tokens[j].startsWith("</path"); j++) {
				const attr = tokens[j].match(/name="android:(fillColor|strokeColor)"/);
				if (!attr) continue;
				const g = attrs(tokens[j + 1]), id = `grad${ids++}`, stops = [];
				for (let k = j + 2; k < tokens.length && tokens[k].startsWith("<item"); k++) {
					const item = attrs(tokens[k]), [c, o] = colour(item.color);
					stops.push(`<stop offset="${item.offset}" stop-color="${c}" stop-opacity="${o}"/>`);
				}
				defs.push(g.type === "radial" ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${g.centerX}" cy="${g.centerY}" r="${g.gradientRadius}">${stops.join("")}</radialGradient>` : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.startX}" y1="${g.startY}" x2="${g.endX}" y2="${g.endY}">${stops.join("")}</linearGradient>`);
				if (attr[1] === "fillColor") fill = [`url(#${id})`, 1];
				else stroke = [`url(#${id})`, 1];
			}
			const parts = [`d="${a.pathData}"`, `fill="${fill[0]}"`];
			if (fill[1] !== 1) parts.push(`fill-opacity="${fill[1]}"`);
			if (a.fillType === "evenOdd") parts.push("fill-rule=\"evenodd\"");
			if (stroke[0] !== "none" && +(a.strokeWidth ?? 0) > 0) {
				parts.push(`stroke="${stroke[0]}"`, `stroke-width="${a.strokeWidth}"`);
				if (stroke[1] !== 1) parts.push(`stroke-opacity="${stroke[1]}"`);
				if (a.strokeLineCap) parts.push(`stroke-linecap="${a.strokeLineCap}"`);
				if (a.strokeLineJoin) parts.push(`stroke-linejoin="${a.strokeLineJoin}"`);
				if (a.strokeMiterLimit) parts.push(`stroke-miterlimit="${a.strokeMiterLimit}"`);
			}
			out += `<path ${parts.join(" ")}/>`;
		}
	}
	const scale = `scale(${108 / vw} ${108 / vh})`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">\n  <!-- Imported from ${node_path.default.basename(file)}. -->\n  <defs>${defs.join("")}</defs>\n  <g transform="${scale}">${out}</g>\n</svg>\n`;
}
/** Draw every icon brand/icon.json lists, plus brand/icon-preview.png (one per icon). */
async function buildIcons(options = {}) {
	const log = options.log || ((line) => console.log(line));
	const listing = options.listing ? node_path.default.resolve(options.listing) : node_path.default.resolve(__dirname, "..");
	const specFile = options.spec ? node_path.default.resolve(options.spec) : node_path.default.join(listing, "brand", "icon.json");
	if (!node_fs.default.existsSync(specFile)) throw new Error(`No ${specFile}. Draw brand/background.svg and brand/foreground.svg, then list the targets in brand/icon.json.`);
	const brand = node_path.default.dirname(specFile);
	const root = node_path.default.resolve(brand, "..", "..");
	const spec = readJson(specFile);
	const rel = (file) => node_path.default.relative(root, file);
	const written = [];
	function write(file, data) {
		node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
		node_fs.default.writeFileSync(file, data);
		written.push(rel(file));
		log(rel(file));
	}
	function readLayer(dir, name, required = true) {
		let file = node_path.default.join(dir, `${name}.svg`);
		if (!node_fs.default.existsSync(file) && dir !== brand) file = node_path.default.join(brand, `${name}.svg`);
		if (!node_fs.default.existsSync(file)) {
			if (required) throw new Error(`Missing ${rel(file)}`);
			return null;
		}
		const folder = node_path.default.dirname(file);
		const text = node_fs.default.readFileSync(file, "utf8");
		const open = text.match(/<svg\b[^>]*>/);
		if (!open || !/viewBox="0 0 108 108"/.test(open[0])) throw new Error(`${rel(file)} must be an <svg viewBox="0 0 108 108">`);
		const prefix = name.replace(/[^a-z0-9]/gi, "");
		return text.slice(open.index + open[0].length, text.lastIndexOf("</svg>")).replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`).replace(/(xlink:)?href="#([^"]+)"/g, `href="#${prefix}-$2"`).replace(/(xlink:)?href="(?!#|data:|https?:)([^"]+)"/g, (_, __, art) => {
			const source = node_path.default.join(folder, art);
			if (!node_fs.default.existsSync(source)) throw new Error(`${rel(file)} embeds ${art}, which is not in ${rel(folder) || "."}`);
			return `href="data:${MIME[node_path.default.extname(art).toLowerCase()] || "application/octet-stream"};base64,${node_fs.default.readFileSync(source).toString("base64")}"`;
		});
	}
	let page;
	const raster = async (svg, size, opaque = false) => {
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
	};
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
	const browser = await chromium.launch();
	try {
		page = await browser.newPage();
		for (const job of spec.icons || [spec]) {
			const dir = node_path.default.join(brand, job.layers || ".");
			const background = readLayer(dir, "background");
			const foreground = readLayer(dir, "foreground");
			const monochrome = job.monochrome === false ? null : readLayer(dir, "monochrome", false);
			/** The icon as one SVG document, showing the launcher's visible 72 x 72. */
			const icon = (shape, scale = 1) => {
				const mark = scale === 1 ? foreground : `<g transform="translate(54 54) scale(${scale}) translate(-54 -54)">${foreground}</g>`;
				if (shape === "mark") return visible(mark);
				if (!CLIP[shape]) throw new Error(`Unknown shape "${shape}"; use square, rounded, circle or mark`);
				return visible(`<defs><clipPath id="icon-shape">${CLIP[shape]}</clipPath></defs><g clip-path="url(#icon-shape)">${background}${mark}</g>`);
			};
			if (job.android) await writeAndroid(job.android, {
				background,
				foreground,
				monochrome
			}, icon);
			for (const target of job.files || []) await writeFile(target, dir, icon);
			await writePreview(dir, icon, monochrome);
		}
	} finally {
		await browser.close();
	}
	return { written };
	async function writeAndroid(android, layers, icon) {
		const res = node_path.default.join(root, android.res);
		const name = android.name || "ic_launcher";
		const type = android.type || "mipmap";
		const round = android.round !== false;
		const parts = [
			"background",
			"foreground",
			"monochrome"
		].filter((part) => layers[part] !== null);
		for (const [density, factor] of Object.entries(DENSITIES)) {
			const folder = node_path.default.join(res, `${type}-${density}`);
			for (const part of parts) write(node_path.default.join(folder, `${name}_${part}.png`), await raster(canvas(layers[part]), 108 * factor));
			if (android.legacy) {
				write(node_path.default.join(folder, `${name}.png`), await raster(icon("rounded"), 48 * factor));
				if (round) write(node_path.default.join(folder, `${name}_round.png`), await raster(icon("circle"), 48 * factor));
			}
		}
		const adaptive = [
			"<?xml version=\"1.0\" encoding=\"utf-8\"?>",
			"<!-- Generated by `npx screenshot-studio icons` from store-listing/brand. -->",
			"<adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">",
			...parts.map((part) => `    <${part} android:drawable="@${type}/${name}_${part}" />`),
			"</adaptive-icon>",
			""
		].join("\n");
		write(node_path.default.join(res, `${type}-anydpi-v26/${name}.xml`), adaptive);
		if (round) write(node_path.default.join(res, `${type}-anydpi-v26/${name}_round.xml`), adaptive);
	}
	async function writeFile(target, dir, icon) {
		const file = node_path.default.join(root, target.path);
		const draw = () => icon(target.shape || "rounded", target.scale || 1);
		const size = () => {
			if (!target.size) throw new Error(`${target.path} in ${rel(specFile)} needs a "size"`);
			return target.size;
		};
		if (file.endsWith(".icon")) await writeAppleIcon(file, target.apple || {
			Background: "background",
			Mark: "foreground"
		}, dir);
		else if (target.layer) write(file, await raster(visible(readLayer(dir, target.layer)), size()));
		else if (file.endsWith(".svg")) write(file, draw());
		else if (file.endsWith(".ico")) {
			const images = [];
			for (const s of ICO_SIZES) images.push(await raster(draw(), s));
			write(file, ico(images));
		} else if (file.endsWith(".icns")) {
			if (process.platform !== "darwin") {
				log(`Skipped ${target.path}: iconutil needs macOS`);
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
				node_fs.default.writeFileSync(node_path.default.join(set, `icon_${s}x${s}.png`), await raster(draw(), s));
				node_fs.default.writeFileSync(node_path.default.join(set, `icon_${s}x${s}@2x.png`), await raster(draw(), s * 2));
			}
			node_fs.default.mkdirSync(node_path.default.dirname(file), { recursive: true });
			(0, node_child_process.execFileSync)("/usr/bin/iconutil", [
				"-c",
				"icns",
				"-o",
				file,
				set
			]);
			written.push(rel(file));
			log(rel(file));
		} else write(file, await raster(draw(), size(), target.opaque));
	}
	async function writeAppleIcon(bundle, layers, dir) {
		for (const [name, layerName] of Object.entries(layers)) write(node_path.default.join(bundle, "Assets", `${name}.png`), await raster(visible(readLayer(dir, layerName)), 1024));
		const json = node_path.default.join(bundle, "icon.json");
		if (!node_fs.default.existsSync(json)) {
			const names = Object.keys(layers).filter((name) => layers[name] !== "background");
			write(json, JSON.stringify({
				groups: [{
					layers: [...names.map((name) => ({
						"image-name": `${name}.png`,
						name
					})), ...Object.values(layers).includes("background") ? [{
						"image-name": "Background.png",
						name: "Background",
						glass: false
					}] : []],
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
			const out = node_fs.default.mkdtempSync(node_path.default.join(node_os.default.tmpdir(), "apple-icon-"));
			try {
				(0, node_child_process.execFileSync)("/usr/bin/xcrun", [
					"ictool",
					bundle,
					"--compile",
					out,
					"--platform",
					"iphoneos",
					"--minimum-deployment-target",
					"26.0"
				], { stdio: "pipe" });
			} catch (error) {
				const failure = error;
				throw new Error(`Xcode rejected ${rel(bundle)}: ${failure.stderr || failure.message}`);
			}
		}
	}
	async function writePreview(dir, icon, monochrome) {
		const img = (svg, size) => `<img width="${size}" height="${size}" src="${dataUri(svg)}">`;
		const themed = monochrome ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><circle cx="54" cy="54" r="36" fill="#3b4a3a"/><g style="filter:brightness(0) invert(.9) sepia(.3) hue-rotate(60deg)">${monochrome}</g></svg>` : null;
		const sizes = [
			[72, "rounded"],
			[48, "circle"],
			[32, "rounded"],
			[16, "rounded"]
		];
		const row = (bg) => `<div style="background:${bg};border-radius:18px;padding:18px;display:flex;gap:18px;align-items:end">${sizes.map(([s, shape]) => img(icon(shape), s)).join("")}${themed ? img(themed, sizes[0][0]) : ""}</div>`;
		await page.setViewportSize({
			width: 1200,
			height: 600
		});
		await page.setContent(`<body style="margin:0;padding:24px;background:#fff;font:14px sans-serif;display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;gap:24px;align-items:end">${img(icon("square"), 220)}${img(icon("rounded"), 180)}${img(icon("circle"), 180)}${img(icon("mark"), 180)}</div>
      ${row("#ece6e2")}
      ${row("#1d1b20")}
    </body>`);
		await page.waitForTimeout(200);
		write(node_path.default.join(dir, "icon-preview.png"), await page.screenshot({ fullPage: true }));
	}
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
async function run$2(argv) {
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
var MIME, CLIP, DENSITIES, ICO_SIZES, canvas, visible, dataUri, USAGE$2;
var init_icon = __esmMin((() => {
	init_project();
	MIME = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".webp": "image/webp",
		".svg": "image/svg+xml"
	};
	CLIP = {
		square: "<rect x=\"18\" y=\"18\" width=\"72\" height=\"72\"/>",
		rounded: "<rect x=\"18\" y=\"18\" width=\"72\" height=\"72\" rx=\"16\"/>",
		circle: "<circle cx=\"54\" cy=\"54\" r=\"36\"/>"
	};
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
	canvas = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${inner}</svg>`;
	visible = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${inner}</svg>\n`;
	dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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
* Needs the Android SDK (ANDROID_HOME or ~/Library/Android/sdk) and Playwright (PLAYWRIGHT_MODULE) for the icons.
* Builds into <spec dir>/.fixture-apps/ (keep it git-ignored) and signs with the local debug keystore; an unchanged
* spec reuses the APKs already there. --install and --uninstall only ever talk to an emulator, never a phone.
* buildFixtureApps() does the same from code and returns the packages and APKs.
*/
var fixture_apps_exports = /* @__PURE__ */ __exportAll({
	buildFixtureApps: () => buildFixtureApps,
	run: () => run$1
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
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
	const browser = await chromium.launch();
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
async function run$1(argv) {
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
	numeric = (a, b) => a.localeCompare(b, void 0, { numeric: true });
	USAGE$1 = "Usage: npx screenshot-studio fixtures fixture-apps.json [--install <emulator-serial>] [--uninstall <emulator-serial>]";
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
	const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
	const browser = await chromium.launch();
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
	USAGE = "Usage: npx screenshot-studio readme [--repo <folder>] [--out <file.png>] [--width 1012]";
}));
// src/cli/main.ts
/**
* screenshot-studio: one command for everything. From the package (`npx screenshot-studio …`) it sets apps up and
* runs every other command through the app's own copy of the studio (store-listing/studio/), so an app's images
* always come from the studio version it was made with. Inside an app, `node store-listing/studio/studio.cjs …`
* runs the same commands directly.
*/
init_project();
init_export();
init_recapture();
init_check();
init_server();
init_store();
init_gallery();
init_validate();
const COMMANDS = {
	init: {
		summary: "Set up Screenshot Studio in an app (or from a folder of screenshots)",
		package: true,
		usage: "init [app] [--name \"My App\"] [--package com.example.app] [--theme starter] [--screenshots ./folder] [--locales en-US,de-DE]",
		run: async (argv) => (await Promise.resolve().then(() => (init_init(), init_exports))).run(argv)
	},
	sync: {
		summary: "Update the app's copy of the studio to this version",
		package: true,
		usage: "sync [app] [--check]",
		run: async (argv) => (await Promise.resolve().then(() => (init_init(), init_exports))).runSync(argv)
	},
	themes: {
		summary: "List the themes init can start from",
		package: true,
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
		usage: "export [--locale de-DE] [--kind phone] [--card 0] [--strict] [--fastlane] [--json]",
		run: async (argv) => (await Promise.resolve().then(() => (init_export(), export_exports))).run(argv)
	},
	recapture: {
		summary: "Build the app, capture on the emulator and export",
		usage: "recapture [locale…] [--boot] [--profile phone] [--no-build] [--no-capture] [--no-export] [--dry-run]",
		run: async (argv) => (await Promise.resolve().then(() => (init_recapture(), recapture_exports))).run(argv)
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
/** This file's folder: the package's studio/, or an app's store-listing/studio/. */
const HERE = __dirname;
const VENDORED = node_fs.default.existsSync(node_path.default.join(HERE, "..", "studio.json"));
const version = () => {
	try {
		return node_fs.default.readFileSync(node_path.default.join(HERE, "VERSION"), "utf8").trim();
	} catch {
		return "?";
	}
};
function help() {
	console.log(`Screenshot Studio ${version()}: real app screens in, store and README art out.\n\nUsage: npx screenshot-studio <command> [options]\n`);
	for (const [name, command] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(11)} ${command.summary}`);
	console.log("\nRun `npx screenshot-studio <command> --help` for its options. Docs: https://github.com/bernaferrari/screenshot-studio");
}
/** Run a command in the app's own copy of the studio, with Playwright found. */
function delegate(listing, name, argv) {
	const entry = node_path.default.join(listing, "studio", "studio.cjs");
	if (!node_fs.default.existsSync(entry)) {
		console.error(`${node_path.default.relative(process.cwd(), listing) || "."} has an older copy of the studio. Update it with \`npx screenshot-studio sync\`.`);
		return 1;
	}
	const theirs = node_fs.default.readFileSync(node_path.default.join(listing, "studio", "VERSION"), "utf8").trim();
	if (theirs !== version()) console.error(`(The app uses studio ${theirs}; this is ${version()}. \`npx screenshot-studio sync\` updates it.)`);
	const env = { ...process.env };
	if (!env.PLAYWRIGHT_MODULE) try {
		env.PLAYWRIGHT_MODULE = node_path.default.dirname(require.resolve("playwright/package.json"));
	} catch {}
	return (0, node_child_process.spawnSync)(process.execPath, [
		entry,
		name,
		...argv
	], {
		stdio: "inherit",
		env
	}).status ?? 1;
}
async function main(argv) {
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
	if (command.package) {
		if (VENDORED) {
			console.error(`Run \`${name}\` from the package: npx screenshot-studio ${name}`);
			return 1;
		}
		return command.run(rest);
	}
	if (VENDORED) return command.run(rest);
	const at = rest.indexOf("--listing");
	const listing = findListing(at >= 0 ? rest[at + 1] : void 0);
	if (!listing) {
		if (name === "studio") return command.run(rest);
		console.error("No store-listing/studio.json here or above. Set one up with `npx screenshot-studio init`.");
		return 1;
	}
	return delegate(listing, name, at >= 0 ? rest.filter((_, i) => i !== at && i !== at + 1) : rest);
}
if (require.main === module) main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
}, (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
exports.bootEmulator = bootEmulator;
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
exports.imageSize = imageSize;
exports.loadListing = loadListing;
exports.main = main;
exports.nodesFile = nodesFile;
exports.outputFile = outputFile;
exports.readJson = readJson;
exports.recapture = recapture;
exports.serve = serve;
exports.validate = validate;
exports.withCopy = withCopy;
exports.withoutMeta = withoutMeta;
exports.writeJson = writeJson;
