import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataDirectory = new URL("../public/data/", import.meta.url);
const overviewBytes = await readFile(new URL("china-map-overview.json", dataDirectory));
const overview = JSON.parse(overviewBytes.toString("utf8"));
const original = JSON.parse(await readFile(new URL("china-cities.json", dataDirectory), "utf8"));
const detailDirectory = new URL("map-provinces/", dataDirectory);

function uniqueById(items, label) {
  assert.ok(Array.isArray(items), `${label} must be an array`);
  const indexed = new Map();
  for (const item of items) {
    assert.equal(typeof item.id, "string", `${label} has a missing id`);
    assert.ok(!indexed.has(item.id), `${label} has duplicate id ${item.id}`);
    indexed.set(item.id, item);
  }
  return indexed;
}

function validPoint(value, label) {
  assert.ok(Array.isArray(value) && value.length === 2 && value.every(Number.isFinite), `${label} must be a finite point`);
}

function validBounds(value, label) {
  assert.ok(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite), `${label} must have four finite bounds`);
  assert.ok(value[0] <= value[2] && value[1] <= value[3], `${label} has inverted bounds`);
}

function containsBounds(outer, inner, label) {
  assert.ok(outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3], label);
}

const provinces = uniqueById(overview.provinces, "Overview provinces");
const metadata = uniqueById(overview.cities, "Overview cities");
const legacyCities = uniqueById(original.cities, "Legacy cities");
assert.equal(provinces.size, 34, "Overview must cover 34 provinces");
assert.equal(metadata.size, 391, "Overview must cover 391 cities");
assert.equal(legacyCities.size, 391, "Legacy map must cover 391 cities");
assert.ok(overviewBytes.length < 200_000, `Overview exceeds the first-load budget: ${overviewBytes.length} bytes`);
assert.deepEqual(overview.viewBox, original.viewBox, "Overview projection changed");
assert.deepEqual([...metadata.keys()].sort(), [...legacyCities.keys()].sort(), "Metadata does not exactly cover legacy cities");
for (const id of ["710000", "810000", "820000"]) assert.ok(provinces.has(id), `Missing province ${id}`);

const registeredFiles = new Set();
const chunkCities = new Map();
for (const province of provinces.values()) {
  assert.match(province.id, /^\d{6}$/, `Invalid province id: ${province.id}`);
  assert.equal(province.detailUrl, `/data/map-provinces/${province.id}.json`, `Invalid detailUrl for ${province.id}`);
  assert.equal(typeof province.path, "string", `Missing province path: ${province.id}`);
  assert.ok(province.path.length, `Empty province path: ${province.id}`);
  validPoint(province.center, `Province ${province.id} center`);
  validBounds(province.bounds, `Province ${province.id}`);
  assert.ok(Array.isArray(province.cityIds) && province.cityIds.length > 0, `Province ${province.id} has no cities`);
  assert.equal(new Set(province.cityIds).size, province.cityIds.length, `Duplicate cityIds in ${province.id}`);

  const filename = `${province.id}.json`;
  registeredFiles.add(filename);
  const chunkUrl = new URL(filename, detailDirectory);
  const chunk = JSON.parse(await readFile(chunkUrl, "utf8"));
  assert.equal(chunk.provinceId, province.id, `Wrong provinceId in ${filename}`);
  const cities = uniqueById(chunk.cities, filename);
  assert.deepEqual([...cities.keys()].sort(), [...province.cityIds].sort(), `Unregistered or missing cities in ${filename}`);

  for (const city of cities.values()) {
    const label = `City ${city.id} in ${filename}`;
    assert.ok(!chunkCities.has(city.id), `${label} occurs in more than one chunk`);
    assert.ok(legacyCities.has(city.id), `${label} is absent from the legacy map`);
    assert.ok(metadata.has(city.id), `${label} is absent from overview metadata`);
    assert.equal(city.provinceId, province.id, `${label} belongs to another province`);
    assert.equal(city.province, province.name, `${label} has the wrong province name`);
    const legacyCity = legacyCities.get(city.id);
    const cityMetadata = metadata.get(city.id);
    for (const key of ["id", "name", "province", "path", "center"]) {
      assert.deepEqual(city[key], legacyCity[key], `${label} changed legacy ${key}`);
    }
    for (const key of ["id", "name", "province", "provinceId", "center"]) {
      assert.deepEqual(cityMetadata[key], city[key], `${label} disagrees with metadata ${key}`);
    }
    validPoint(city.center, `${label} center`);
    validBounds(city.bounds, label);
    containsBounds(province.bounds, city.bounds, `${label} falls outside province bounds`);

    // Existing detailed paths use absolute M/L coordinates. Include every ring,
    // especially the distant South China Sea islands, when checking bounds.
    assert.match(city.path, /^(?:[ML]-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?|Z)+$/, `${label} uses an unexpected SVG command`);
    const points = [...city.path.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => [Number(match[1]), Number(match[2])]);
    assert.ok(points.length > 0, `${label} has no path coordinates`);
    const pathBounds = [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)),
      Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))];
    containsBounds(city.bounds, pathBounds, `${label} bounds exclude part of its path`);
    chunkCities.set(city.id, city);
  }
}

assert.deepEqual([...chunkCities.keys()].sort(), [...legacyCities.keys()].sort(), "Chunks do not exactly cover registered legacy cities");
assert.equal([...chunkCities.values()].filter((city) => city.provinceId === "710000").length, 22, "Taiwan chunk must contain 22 city units");
const chunkFiles = (await readdir(fileURLToPath(detailDirectory), { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
assert.deepEqual(chunkFiles.sort(), [...registeredFiles].sort(), "Unregistered or missing province chunk files");

console.log(`Progressive map verified: ${provinces.size} provinces, ${chunkCities.size} cities; overview ${overviewBytes.length.toLocaleString("en-US")} bytes.`);
