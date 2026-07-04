const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const remainingFile = path.join(ROOT, 'data_export', 'missing_sight_images_remaining.txt');
const citiesFile = path.join(ROOT, 'data_export', 'cities.json');
const attractionsFile = path.join(ROOT, 'data_export', 'city_attractions.json');
const outputFile = path.join(ROOT, 'data_export', 'missing_sight_images_remaining_clean.txt');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function get(obj, names) {
  for (const name of names) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
  }
  return null;
}

function cleanPinyin(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function main() {
  if (!fs.existsSync(remainingFile)) {
    console.error('找不到剩余清单：data_export/missing_sight_images_remaining.txt');
    process.exit(1);
  }

  if (!fs.existsSync(citiesFile)) {
    console.error('找不到城市数据：data_export/cities.json');
    process.exit(1);
  }

  if (!fs.existsSync(attractionsFile)) {
    console.error('找不到景点数据：data_export/city_attractions.json');
    process.exit(1);
  }

  const rawLines = fs.readFileSync(remainingFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(Boolean);

  const ids = new Set();

  for (const line of rawLines) {
    const nums = line.match(/\b\d+\b/g) || [];
    if (nums.length >= 1) {
      ids.add(Number(nums[0]));
    }
  }

  const cities = readJson(citiesFile);
  const attractions = readJson(attractionsFile);

  const cityMap = new Map();

  for (const city of cities) {
    const id = Number(get(city, ['id', 'ID']));
    if (!id) continue;
    cityMap.set(id, city);
  }

  const lines = [];
  const missingCity = [];
  const missingAttraction = [];

  for (const id of ids) {
    const attraction = attractions.find(a => {
      const aid = Number(get(a, ['id', 'ID']));
      return aid === id;
    });

    if (!attraction) {
      missingAttraction.push(id);
      continue;
    }

    const attractionId = Number(get(attraction, ['id', 'ID']));
    const cityId = Number(get(attraction, ['city_id', 'cityId', 'cityID', 'CITY_ID']));
    const attractionName = String(get(attraction, ['name', 'Name', 'attractionName']) || '').trim();

    const city = cityMap.get(cityId);

    if (!city) {
      missingCity.push({ attractionId, cityId, attractionName });
      continue;
    }

    const cityName = String(get(city, ['name', 'Name']) || '').trim();
    const pinyin = cleanPinyin(get(city, ['pinyin', 'Pinyin']));

    if (!cityName || !pinyin || !attractionId || !cityId || !attractionName) continue;

    lines.push([
      cityName,
      pinyin,
      attractionId,
      cityId,
      attractionName
    ].join('\t'));
  }

  fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');

  console.log(`原剩余清单：${rawLines.length} 条`);
  console.log(`提取景点ID：${ids.size} 条`);
  console.log(`重新生成干净清单：${lines.length} 条`);
  console.log(`输出文件：${outputFile}`);

  if (missingAttraction.length) {
    console.log(`找不到景点数据：${missingAttraction.length} 条`);
  }

  if (missingCity.length) {
    console.log(`找不到城市数据：${missingCity.length} 条`);
  }
}

main();