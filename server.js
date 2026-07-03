const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const fs = require('fs');

/* =========================
   读取本地 .env
   只修复：本地 node server.js 时环境变量没加载
========================= */
function loadLocalEnv() {
    const envPath = path.resolve(__dirname, '.env');

    if (!fs.existsSync(envPath)) return;

    try {
        const content = fs.readFileSync(envPath, 'utf8');

        content.split(/\r?\n/).forEach(line => {
            const text = line.trim().replace(/^\uFEFF/, '');

            if (!text || text.startsWith('#')) return;

            const eqIndex = text.indexOf('=');
            if (eqIndex === -1) return;

            const key = text.slice(0, eqIndex).trim();
            let value = text.slice(eqIndex + 1).trim();

            value = value.replace(/^['"]|['"]$/g, '');

            if (key && process.env[key] === undefined) {
                process.env[key] = value;
            }
        });
    } catch (e) {
        console.error('.env 读取失败:', e.message);
    }
}

loadLocalEnv();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const frontendDir = path.resolve(__dirname, 'frontend');
const frontendPath = fs.existsSync(path.join(frontendDir, 'index.html')) ? frontendDir : __dirname;

function normalizeWebImageUrl(url) {
    if (!url) return "";

    let u = String(url).trim().replace(/\\/g, "/");

    if (!u) return "";

    if (/^https?:\/\//i.test(u)) {
        return u;
    }

    u = u.replace(/^\.?\//, "");
    u = u.replace(/^frontend\//, "");

    return u;
}

function localImageExists(webPath) {
    const clean = normalizeWebImageUrl(webPath);

    if (!clean) return false;
    if (/^https?:\/\//i.test(clean)) return false;

    const absPath = path.resolve(frontendPath, clean);
    const rootPath = path.resolve(frontendPath);

    if (!absPath.startsWith(rootPath)) return false;

    return fs.existsSync(absPath);
}

function listLocalImages(webDir) {
    const cleanDir = normalizeWebImageUrl(webDir);

    if (!cleanDir) return [];
    if (/^https?:\/\//i.test(cleanDir)) return [];

    const absDir = path.resolve(frontendPath, cleanDir);
    const rootPath = path.resolve(frontendPath);

    if (!absDir.startsWith(rootPath)) return [];
    if (!fs.existsSync(absDir)) return [];

    try {
        return fs.readdirSync(absDir)
            .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
            .sort((a, b) => {
                const na = Number(String(a).match(/\d+/)?.[0] || 0);
                const nb = Number(String(b).match(/\d+/)?.[0] || 0);

                if (na && nb && na !== nb) return na - nb;

                return a.localeCompare(b);
            })
            .map(file => `${cleanDir.replace(/\/$/, "")}/${file}`);
    } catch (e) {
        return [];
    }
}

function listAllCityImages() {
    return listLocalImages('images/cities');
}

function makeSlugVariants(value) {
    if (!value) return [];

    const raw = String(value).trim().toLowerCase();

    const variants = [
        raw,
        raw.replace(/\s+/g, "_"),
        raw.replace(/\s+/g, ""),
        raw.replace(/-/g, "_"),
        raw.replace(/_/g, "-"),
        raw.replace(/_/g, " "),
        raw.replace(/-/g, " ")
    ];

    return [...new Set(variants.filter(Boolean))];
}

const CITY_ALIAS = {
    "纽约": ["new_york", "niuyue"],
    "香港": ["hong_kong", "hongkong", "xianggang"],
    "澳门": ["aomen", "macau", "macao"],
    "伦敦": ["london", "lundun"],
    "巴黎": ["paris", "bali"],
    "东京": ["tokyo", "dongjing"],
    "大阪": ["osaka", "daban"],
    "京都": ["kyoto", "jingdu"],
    "首尔": ["seoul", "shouer"],
    "曼谷": ["bangkok", "mangu"],
    "罗马": ["rome", "luoma"],
    "悉尼": ["sydney", "xini"],
    "墨尔本": ["melbourne", "moerben"],
    "奥克兰": ["auckland", "aokelan"],
    "布鲁塞尔": ["brussels", "bulusaier"],
    "布达佩斯": ["budapest", "budapeisi"],
    "莫斯科": ["moscow", "mosike"],
    "阿姆斯特丹": ["amsterdam", "amusitedan"],
    "哈尔滨": ["haerbin", "harbin"],
    "张家界": ["zhangjiajie"],
    "呼伦贝尔": ["hulunbeier"],
    "乌鲁木齐": ["wulumuqi"],
    "西双版纳": ["xishuangbanna"],
    "香格里拉": ["xianggelila"],
    "桂林": ["guilin"],
    "成都": ["chengdu"],
    "重庆": ["chongqing"],
    "厦门": ["xiamen"],
    "北京": ["beijing"],
    "上海": ["shanghai"],
    "西安": ["xian"],
    "广州": ["guangzhou"],
    "深圳": ["shenzhen"],
    "杭州": ["hangzhou"],
    "长沙": ["changsha"],
    "南京": ["nanjing"],
    "青岛": ["qingdao"],
    "丽江": ["lijiang"],
    "大理": ["dali"],
    "三亚": ["sanya"],
    "苏州": ["suzhou"]
};

function pushImageCandidates(candidates, folder, slug) {
    if (!slug) return;

    makeSlugVariants(slug).forEach(s => {
        candidates.push(`${folder}/${s}.jpg`);
        candidates.push(`${folder}/${s}.jpeg`);
        candidates.push(`${folder}/${s}.png`);
        candidates.push(`${folder}/${s}.webp`);
    });
}

function findFirstLocalImage(candidates) {
    for (const item of candidates) {
        const clean = normalizeWebImageUrl(item);

        if (clean && !/^https?:\/\//i.test(clean) && localImageExists(clean)) {
            return clean;
        }
    }

    return "";
}

function fillCityImage(city) {
    if (!city) return city;

    const candidates = [];

    if (city.image_url) {
        candidates.push(normalizeWebImageUrl(city.image_url));
    }

    pushImageCandidates(candidates, "images/cities", city.name_en);
    pushImageCandidates(candidates, "images/cities", city.pinyin);

    const aliases = CITY_ALIAS[city.name] || [];
    aliases.forEach(alias => {
        pushImageCandidates(candidates, "images/cities", alias);
    });

    const found = findFirstLocalImage(candidates);

    if (found) {
        city.image_url = found;
        return city;
    }

    if (city.image_url && /^https?:\/\//i.test(String(city.image_url))) {
        city.image_url = normalizeWebImageUrl(city.image_url);
        return city;
    }

    if (city.image_url && localImageExists(city.image_url)) {
        city.image_url = normalizeWebImageUrl(city.image_url);
        return city;
    }

    const allCityImages = listAllCityImages();

    if (allCityImages.length) {
        const seed = Number(city.id || 0) || String(city.name || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
        city.image_url = allCityImages[Math.abs(seed) % allCityImages.length];
    } else if (city.image_url) {
        city.image_url = normalizeWebImageUrl(city.image_url);
    }

    return city;
}

function fillCityImages(list) {
    return Array.isArray(list) ? list.map(fillCityImage) : [];
}

function getAttractionFolderCandidates(item) {
    const folders = [];

    const keys = [
        item.city_name_en,
        item.city_pinyin
    ];

    keys.forEach(key => {
        makeSlugVariants(key).forEach(slug => {
            folders.push(`images/sights/${slug}`);
        });
    });

    const aliases = CITY_ALIAS[item.city_name] || [];
    aliases.forEach(alias => {
        makeSlugVariants(alias).forEach(slug => {
            folders.push(`images/sights/${slug}`);
        });
    });

    if (item.image_url) {
        const clean = normalizeWebImageUrl(item.image_url);

        if (clean && !/^https?:\/\//i.test(clean)) {
            const parts = clean.split("/");
            const idx = parts.findIndex(p => p === "sights");

            if (idx >= 0 && parts[idx + 1]) {
                folders.push(parts.slice(0, idx + 2).join("/"));
            }
        }
    }

    return [...new Set(folders.filter(Boolean))];
}

function fillAttractionImage(item, index = 0, used = new Set()) {
    if (!item) return item;

    const candidates = [];

    if (item.image_url) {
        candidates.push(normalizeWebImageUrl(item.image_url));
    }

    const folders = getAttractionFolderCandidates(item);

    folders.forEach(folder => {
        const order = item.sort_order || index + 1;

        candidates.push(`${folder}/${order}.jpg`);
        candidates.push(`${folder}/${order}.jpeg`);
        candidates.push(`${folder}/${order}.png`);
        candidates.push(`${folder}/${order}.webp`);

        if (item.id) {
            candidates.push(`${folder}/${item.id}.jpg`);
            candidates.push(`${folder}/${item.id}.jpeg`);
            candidates.push(`${folder}/${item.id}.png`);
            candidates.push(`${folder}/${item.id}.webp`);
        }
    });

    let found = findFirstLocalImage(candidates);

    if (!found) {
        for (const folder of folders) {
            const files = listLocalImages(folder);
            const unused = files.find(file => !used.has(file));

            if (unused) {
                found = unused;
                break;
            }
        }
    }

    if (found) {
        item.image_url = found;
        used.add(found);
    } else if (item.image_url) {
        item.image_url = normalizeWebImageUrl(item.image_url);
    } else {
        item.image_url = "";
    }

    return item;
}

function fillAttractionImages(list) {
    const used = new Set();
    return Array.isArray(list) ? list.map((item, index) => fillAttractionImage(item, index, used)) : [];
}

function parseHighlightList(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.map(x => String(x).trim()).filter(Boolean);
    }

    const text = String(value).trim();

    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map(x => String(x).trim()).filter(Boolean);
        }
    } catch (e) {}

    return text
        .split(/[，、,]/)
        .map(x => x.trim())
        .filter(Boolean);
}

function buildFallbackAttractions(city) {
    const names = parseHighlightList(city.highlights).slice(0, 6);

    const fallbackNames = names.length ? names : [
        "城市地标",
        "历史街区",
        "特色美食",
        "自然风光",
        "文化景点",
        "夜景漫游"
    ];

    return fallbackNames.map((name, index) => ({
        id: null,
        city_id: city.id,
        name,
        image_url: "",
        sort_order: index + 1,
        is_recommended: 1,
        search_override: null,
        city_name: city.name,
        city_pinyin: city.pinyin,
        city_name_en: city.name_en
    }));
}

/* =========================
   ✅ 静态资源目录
========================= */
app.use(express.static(frontendPath));

/* =========================
   ✅ 首页
========================= */
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

/* =========================
   数据库连接
========================= */
function getDbConfig() {
    const urlValue =
        process.env.DATABASE_URL ||
        process.env.MYSQL_URL ||
        process.env.MYSQL_PUBLIC_URL ||
        process.env.MYSQL_PRIVATE_URL ||
        process.env.RAILWAY_DATABASE_URL ||
        "";

    if (urlValue) {
        try {
            const u = new URL(urlValue);
            return {
                host: u.hostname,
                port: Number(u.port || 3306),
                user: decodeURIComponent(u.username || 'root'),
                password: decodeURIComponent(u.password || ''),
                database: decodeURIComponent((u.pathname || '').replace(/^\//, '') || 'railway'),
                waitForConnections: true,
                connectionLimit: 10,
                connectTimeout: 30000
            };
        } catch (e) {
            console.error('数据库 URL 解析失败:', e.message);
        }
    }

    return {
        host: process.env.MYSQLHOST || process.env.DB_HOST || 'reseau.proxy.rlwy.net',
        port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 46086),
        user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
        password: process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD || process.env.DB_PASSWORD || '',
        database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || process.env.DB_NAME || 'railway',
        waitForConnections: true,
        connectionLimit: 10,
        connectTimeout: 30000
    };
}

const pool = mysql.createPool(getDbConfig());

const db = pool.promise();

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';

function normalizeRegion(region) {
    if (!region || region === 'all') return 'all';
    if (region === 'domestic') return '国内';
    if (region === 'abroad' || region === 'foreign') return '国外';
    return region;
}

function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 100000;
    const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
    return `pbkdf2_sha512$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash) return false;

    if (storedHash === password) return true;

    const parts = String(storedHash).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha512') return false;

    const iterations = Number(parts[1]);
    const salt = parts[2];
    const originalHash = parts[3];

    if (!iterations || !salt || !originalHash) return false;

    try {
        const checkHash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
        const a = Buffer.from(originalHash, 'hex');
        const b = Buffer.from(checkHash, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch (e) {
        return false;
    }
}

function safeUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        phone: row.phone,
        username: row.phone,
        nickname: row.nickname || row.phone,
        avatar: row.avatar_url || DEFAULT_AVATAR,
        avatar_url: row.avatar_url || DEFAULT_AVATAR,
        created_at: row.created_at,
        last_login_at: row.last_login_at,
        comments: [],
        likes: [],
        replies: []
    };
}

async function findUserByIdentifier(data) {
    const userId = data.user_id || data.userId || data.id;
    const phone = data.phone || data.username;

    if (userId) {
        const [rows] = await db.query(
            `SELECT id, phone, nickname, avatar_url, created_at, last_login_at, status 
             FROM users 
             WHERE id=? AND status=1 
             LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    }

    if (phone) {
        const [rows] = await db.query(
            `SELECT id, phone, nickname, avatar_url, created_at, last_login_at, status 
             FROM users 
             WHERE phone=? AND status=1 
             LIMIT 1`,
            [phone]
        );
        return rows[0] || null;
    }

    return null;
}


/* =========================
   数据字段兼容工具
   只修复：数据库字段没被前端完整使用、搜索条件过严导致空结果
========================= */
function firstFilled(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return value;
        }
    }
    return null;
}

function tryParseJSON(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

function normalizeLongText(value) {
    if (value === undefined || value === null) return '';

    if (Array.isArray(value)) {
        return value.map(item => normalizeLongText(item)).filter(Boolean).join('\n');
    }

    if (typeof value === 'object') {
        return Object.values(value).map(item => normalizeLongText(item)).filter(Boolean).join('\n');
    }

    const parsed = tryParseJSON(value);

    if (parsed && parsed !== value) {
        return normalizeLongText(parsed);
    }

    return String(value)
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .trim();
}

function splitTextList(value) {
    if (value === undefined || value === null || value === '') return [];

    const parsed = tryParseJSON(value);

    if (Array.isArray(parsed)) {
        return parsed.map(item => String(item).trim()).filter(Boolean);
    }

    if (Array.isArray(value)) {
        return value.map(item => String(item).trim()).filter(Boolean);
    }

    return String(value)
        .replace(/\\n/g, '\n')
        .split(/[，、,;；\n]/)
        .map(item => item.trim())
        .filter(Boolean);
}

function numberFromText(value) {
    if (value === undefined || value === null || value === '') return null;

    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = String(value);
    const match = text.match(/\d+(?:\.\d+)?/);

    return match ? Number(match[0]) : null;
}

function parseDaysValue(value) {
    if (value === undefined || value === null || value === '') return null;

    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const text = String(value);
    const dayMatch = text.match(/(\d+)\s*天/);

    if (dayMatch) return Number(dayMatch[1]);

    return numberFromText(text);
}

function normalizeCityRow(city) {
    if (!city) return city;

    city.detail_intro = firstFilled(
        city.detail_intro,
        city.detailIntro,
        city.detailintro,
        city.city_intro,
        city.long_intro,
        city.description,
        city.desc,
        city.content,
        city.detail,
        city.details,
        city.city_detail,
        city.intro
    );

    city.food = firstFilled(
        city.food,
        city.foods,
        city.foodTips,
        city.foodRecommend,
        city.food_tips,
        city.food_recommend,
        city.food_recommendation,
        city.foods_recommendation,
        city.food_list,
        city.food_detail,
        city.food_desc
    );

    city.stay_tips = firstFilled(
        city.stay_tips,
        city.stayTips,
        city.staytips,
        city.accommodationTips,
        city.accommodationtips,
        city.hotelTips,
        city.hoteltips,
        city.hotel,
        city.hotels,
        city.stay,
        city.accommodation,
        city.accommodation_tips,
        city.hotel_tips,
        city.hotel_recommend,
        city.stay_recommend,
        city.stay_recommendation,
        city.stay_detail,
        city.hotel_detail,
        city.accommodation_detail,
        city.lodging,
        city.lodging_tips
    );

    city.transport_tips = firstFilled(
        city.transport_tips,
        city.transportTips,
        city.transporttips,
        city.trafficTips,
        city.traffictips,
        city.transportationTips,
        city.transportationtips,
        city.transport,
        city.traffic,
        city.traffic_tips,
        city.transportation,
        city.transportation_tips,
        city.transport_recommend,
        city.transport_recommendation,
        city.transport_detail,
        city.traffic_detail,
        city.traffic_recommend,
        city.route_transport
    );

    city.budgetPlans = firstFilled(
        city.budgetPlans,
        city.budgetPlan,
        city.budgetplans,
        city.routePlan,
        city.routeplan,
        city.travelPlan,
        city.travelplan,
        city.budget_plan_json,
        city.plans_json,
        city.budget_plans,
        city.budget_plan,
        city.plans,
        city.plan,
        city.route_plan,
        city.travel_plan,
        city.itinerary,
        city.schedule,
        city.specific_plan,
        city.specificPlan,
        city.strategy,
        city.guide,
        city.route,
        city.routes,
        city.plan_text,
        city.detail_plan
    );

    city.tags = firstFilled(
        city.tags,
        city.type,
        city.types,
        city.travel_type,
        city.travel_types,
        city.tourism_type,
        city.tourism_types,
        city.category,
        city.categories
    );

    city.score = firstFilled(city.score, city.rating, city.rate, city.recommend_score);
    city.budget = firstFilled(city.budget, city.budget_max, city.avg_budget, city.average_budget, city.cost, city.price);
    city.days_min = firstFilled(city.days_min, city.min_days, city.days);
    city.days_max = firstFilled(city.days_max, city.max_days, city.days);

    return city;
}

function normalizeCityRows(list) {
    return Array.isArray(list) ? list.map(item => normalizeCityRow(item)) : [];
}

function isFilledValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function cleanCityNameValue(value) {
    return String(value || '').replace(/[\s　]/g, '').trim();
}

function valueRichness(value) {
    if (!isFilledValue(value)) return 0;

    if (Array.isArray(value)) {
        return value.map(item => valueRichness(item)).reduce((sum, item) => sum + item, 0);
    }

    if (typeof value === 'object') {
        return Object.values(value).map(item => valueRichness(item)).reduce((sum, item) => sum + item, 0);
    }

    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return 0;

    return text.length;
}

const CITY_RICH_TEXT_FIELDS = new Set([
    'intro',
    'detail_intro',
    'city_intro',
    'long_intro',
    'description',
    'desc',
    'content',
    'food',
    'foods',
    'food_tips',
    'food_recommend',
    'stay_tips',
    'stay',
    'hotel',
    'accommodation',
    'transport_tips',
    'transport',
    'traffic',
    'budgetPlans',
    'budgetPlan',
    'budgetplans',
    'budget_plans',
    'budget_plan',
    'plans',
    'plan',
    'route_plan',
    'travel_plan',
    'itinerary',
    'schedule',
    'tags',
    'type',
    'types',
    'travel_type',
    'travel_types',
    'tourism_type',
    'tourism_types',
    'category',
    'categories',
    'highlights'
]);

function cityCompletenessScore(row) {
    if (!row) return 0;

    const c = normalizeCityRow({ ...row });

    return [
        c.name,
        c.pinyin,
        c.province,
        c.region,
        c.highlights,
        c.tags,
        c.score,
        c.heat,
        c.budget,
        c.intro,
        c.detail_intro,
        c.food,
        c.lat,
        c.lng,
        c.budgetPlans,
        c.stay_tips,
        c.transport_tips,
        c.image_url,
        c.img
    ].reduce((sum, item) => sum + valueRichness(item), 0);
}

function mergeBestCityFields(city, extra) {
    if (!city || !extra) return city;

    Object.keys(extra).forEach(key => {
        const next = extra[key];
        if (!isFilledValue(next)) return;

        const current = city[key];

        if (!isFilledValue(current)) {
            city[key] = next;
            return;
        }

        if (CITY_RICH_TEXT_FIELDS.has(key) && valueRichness(next) > valueRichness(current)) {
            city[key] = next;
        }
    });

    return city;
}

function mergeCityRows(rows) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];

    if (!list.length) return null;

    const sorted = [...list].sort((a, b) => {
        const scoreDiff = cityCompletenessScore(b) - cityCompletenessScore(a);
        if (scoreDiff !== 0) return scoreDiff;

        return Number(b.id || 0) - Number(a.id || 0);
    });

    const city = { ...sorted[0] };

    sorted.forEach(row => mergeBestCityFields(city, row));

    return normalizeCityRow(city);
}

function collapseCityRows(rows) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const groups = new Map();

    list.forEach(row => {
        const key = cleanCityNameValue(row.name) || String(row.id || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });

    return [...groups.values()]
        .map(group => mergeCityRows(group))
        .filter(Boolean)
        .sort((a, b) => {
            const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
            if (scoreDiff !== 0) return scoreDiff;

            return Number(b.heat || 0) - Number(a.heat || 0);
        });
}

async function getMergedCityByName(name) {
    const cleanName = cleanCityNameValue(name);

    if (!cleanName) return null;

    const [rows] = await db.query(
        `SELECT * FROM cities 
         WHERE name=? 
            OR REPLACE(REPLACE(TRIM(name),' ',''),'　','')=?
            OR pinyin=?
            OR name LIKE ?
         ORDER BY score DESC, heat DESC, id DESC
         LIMIT 80`,
        [name, cleanName, name, `%${name}%`]
    );

    if (!rows || !rows.length) return null;

    const exactRows = rows.filter(row => cleanCityNameValue(row.name) === cleanName || String(row.pinyin || '').trim().toLowerCase() === String(name).trim().toLowerCase());

    return mergeCityRows(exactRows.length ? exactRows : rows);
}

function mergeMissingCityFields(city, extra) {
    if (!city || !extra) return city;

    mergeBestCityFields(city, extra);

    return normalizeCityRow(city);
}

async function enrichCityDetails(city) {
    if (!city) return city;

    const candidates = [
        'city_details',
        'city_detail',
        'travel_city_details',
        'city_plans',
        'city_info',
        'city_infos',
        'travel_plans',
        'city_routes'
    ];

    for (const tableName of candidates) {
        try {
            const cols = await getTableColumns(tableName);
            if (!cols.length) continue;

            const cityIdCol = pickColumn(cols, ['city_id', 'cityId', 'cid']);
            const cityNameCol = pickColumn(cols, ['city_name', 'city', 'name']);
            const where = [];
            const params = [];

            if (cityIdCol && city.id) {
                where.push(`\`${cityIdCol}\`=?`);
                params.push(city.id);
            }

            if (cityNameCol && city.name) {
                where.push(`\`${cityNameCol}\`=?`);
                params.push(city.name);
            }

            if (!where.length) continue;

            const [rows] = await db.query(
                `SELECT * FROM \`${tableName}\` WHERE ${where.join(' OR ')} LIMIT 20`,
                params
            );

            if (rows && rows.length) {
                rows.forEach(row => mergeMissingCityFields(city, row));
            }
        } catch (e) {}
    }

    return normalizeCityRow(city);
}

function citySearchText(city) {
    return [
        city.name,
        city.province,
        city.region,
        city.highlights,
        city.tags,
        city.type,
        city.types,
        city.travel_type,
        city.travel_types,
        city.tourism_type,
        city.tourism_types,
        city.category,
        city.categories,
        city.intro,
        city.detail_intro,
        city.food,
        city.stay_tips,
        city.transport_tips,
        city.budgetPlans
    ].map(normalizeLongText).join(' ');
}

function getCityBudgetValue(city) {
    const direct = numberFromText(firstFilled(city.budget, city.budget_max, city.avg_budget, city.average_budget, city.cost, city.price));

    if (direct !== null) return direct;

    const text = normalizeLongText(firstFilled(city.budgetPlans, city.budget_plans, city.budget_plan, city.plan, city.plans));
    const nums = [...text.matchAll(/\d+/g)].map(item => Number(item[0])).filter(Number.isFinite);

    return nums.length ? Math.min(...nums) : null;
}

function getCityBudgetDiffValue(city, budgetLimit) {
    const cityBudget = getCityBudgetValue(city);

    if (cityBudget === null || !budgetLimit) return 999999;

    return Math.abs(cityBudget - budgetLimit);
}

function getCityDaysDiffValue(city, daysTarget) {
    if (!daysTarget) return 999999;

    const range = getCityDaysRange(city);

    if (range.min === null && range.max === null) return 999999;

    if (daysTarget >= 4) {
        if (range.max !== null && range.max >= 4) return 0;
        if (range.min !== null && range.min >= 4) return 0;
        return Math.abs(4 - Number(range.max || range.min || 0));
    }

    if (range.min !== null && range.max !== null) {
        if (range.min <= daysTarget && daysTarget <= range.max) return 0;
        return Math.min(Math.abs(range.min - daysTarget), Math.abs(range.max - daysTarget));
    }

    return Math.abs(Number(range.min || range.max || 0) - daysTarget);
}

function estimateDaysByBudget(city) {
    const budget = getCityBudgetValue(city);

    if (budget === null) return null;

    if (budget <= 1200) return 1;
    if (budget <= 2600) return 2;
    if (budget <= 4200) return 3;

    return 4;
}

function getCityDaysRange(city) {
    const minDirect = parseDaysValue(firstFilled(city.days_min, city.min_days));
    const maxDirect = parseDaysValue(firstFilled(city.days_max, city.max_days));
    const daysDirect = parseDaysValue(city.days);

    let min = minDirect;
    let max = maxDirect;
    let inferred = false;

    if (min === null && max === null && daysDirect !== null) {
        min = daysDirect;
        max = daysDirect;
    }

    const text = normalizeLongText(firstFilled(city.days_text, city.duration, city.budgetPlans, city.budget_plans, city.budget_plan, city.plan, city.plans));
    const nums = [...text.matchAll(/(\d+)\s*天/g)].map(item => Number(item[1])).filter(Number.isFinite);

    if (nums.length) {
        if (min === null) min = Math.min(...nums);
        if (max === null) max = Math.max(...nums);
    }

    if (min === null && max === null) {
        const estimated = estimateDaysByBudget(city);

        if (estimated !== null) {
            min = estimated;
            max = 4;
            inferred = true;
        }
    }

    return { min, max, inferred };
}

function cityMatchesSearch(city, filters) {
    const budgetLimit = numberFromText(filters.budget);
    const daysTarget = parseDaysValue(filters.days);
    const tags = String(filters.tags || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    if (budgetLimit) {
        const cityBudget = getCityBudgetValue(city);

        if (cityBudget === null) return false;

        const allowedRange = Math.max(600, budgetLimit * 0.35);

        if (Math.abs(cityBudget - budgetLimit) > allowedRange) return false;
    }

    if (daysTarget) {
        const range = getCityDaysRange(city);

        if (range.min === null && range.max === null) return false;

        if (daysTarget >= 4) {
            if (range.max !== null && range.max < 4) return false;
            if (range.max === null && range.min !== null && range.min < 4) return false;
        } else {
            if (range.min !== null && daysTarget < range.min) return false;
            if (range.max !== null && daysTarget > range.max) return false;
        }
    }

    if (tags.length) {
        const text = citySearchText(city);
        const ok = tags.every(tag => text.includes(tag));
        if (!ok) return false;
    }

    return true;
}

async function getSearchCandidateCities(region) {
    let sql = `SELECT * FROM cities WHERE 1=1`;
    const params = [];

    if (region !== 'all') {
        sql += ` AND region=?`;
        params.push(region);
    }

    sql += ` ORDER BY score DESC LIMIT 1000`;

    const [rows] = await db.query(sql, params);
    return fillCityImages(collapseCityRows(rows));
}

async function searchCitiesWithFilters(region, filters, origin) {
    let list = await getSearchCandidateCities(region);
    const budgetLimit = numberFromText(filters.budget);
    const daysTarget = parseDaysValue(filters.days);

    list = list.filter(city => cityMatchesSearch(city, filters));

    if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
        list = list
            .map(city => {
                const lat = Number(city.lat);
                const lng = Number(city.lng);
                const distance = Number.isFinite(lat) && Number.isFinite(lng)
                    ? Math.round(6371 * 2 * Math.atan2(
                        Math.sqrt(
                            Math.sin(((lat - origin.lat) * Math.PI / 180) / 2) ** 2 +
                            Math.cos(origin.lat * Math.PI / 180) *
                            Math.cos(lat * Math.PI / 180) *
                            Math.sin(((lng - origin.lng) * Math.PI / 180) / 2) ** 2
                        ),
                        Math.sqrt(1 - (
                            Math.sin(((lat - origin.lat) * Math.PI / 180) / 2) ** 2 +
                            Math.cos(origin.lat * Math.PI / 180) *
                            Math.cos(lat * Math.PI / 180) *
                            Math.sin(((lng - origin.lng) * Math.PI / 180) / 2) ** 2
                        ))
                    ))
                    : 999999;

                return { ...city, distance };
            })
            .filter(city => {
                const originId = Number(origin.id);
                const cityId = Number(city.id);
                const sameId = Number.isFinite(originId) && Number.isFinite(cityId) && cityId === originId;
                return !sameId && city.name !== origin.name;
            })
            .sort((a, b) => {
                const distanceDiff = a.distance - b.distance;
                if (distanceDiff !== 0) return distanceDiff;

                if (budgetLimit) {
                    const budgetDiff = getCityBudgetDiffValue(a, budgetLimit) - getCityBudgetDiffValue(b, budgetLimit);
                    if (budgetDiff !== 0) return budgetDiff;
                }

                if (daysTarget) {
                    const daysDiff = getCityDaysDiffValue(a, daysTarget) - getCityDaysDiffValue(b, daysTarget);
                    if (daysDiff !== 0) return daysDiff;
                }

                return Number(b.score || 0) - Number(a.score || 0);
            });
    } else {
        list = list.sort((a, b) => {
            if (budgetLimit) {
                const budgetDiff = getCityBudgetDiffValue(a, budgetLimit) - getCityBudgetDiffValue(b, budgetLimit);
                if (budgetDiff !== 0) return budgetDiff;
            }

            if (daysTarget) {
                const daysDiff = getCityDaysDiffValue(a, daysTarget) - getCityDaysDiffValue(b, daysTarget);
                if (daysDiff !== 0) return daysDiff;
            }

            return Number(b.score || 0) - Number(a.score || 0);
        });
    }

    return list.slice(0, 30);
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return [];

    if (tableColumnsCache.has(tableName)) {
        return tableColumnsCache.get(tableName);
    }

    try {
        const [rows] = await db.query(`SHOW COLUMNS FROM \`${tableName}\``);
        const cols = rows.map(row => row.Field);
        tableColumnsCache.set(tableName, cols);
        return cols;
    } catch (e) {
        tableColumnsCache.set(tableName, []);
        return [];
    }
}

function pickColumn(cols, names) {
    return names.find(name => cols.includes(name));
}

async function readCommentsFromTable(tableName, cityName, cityId, sort) {
    const cols = await getTableColumns(tableName);

    if (!cols.length) return [];

    const cityNameCol = pickColumn(cols, ['city_name', 'city', 'name']);
    const cityIdCol = pickColumn(cols, ['city_id']);
    const contentCol = pickColumn(cols, ['content', 'comment', 'text', 'body']);

    if (!contentCol || (!cityNameCol && !cityIdCol)) return [];

    const idCol = pickColumn(cols, ['id']) || 'id';
    const userIdCol = pickColumn(cols, ['user_id', 'uid', 'author_id']);
    const userCol = pickColumn(cols, ['username', 'nickname', 'user_name', 'phone', 'author']);
    const avatarCol = pickColumn(cols, ['avatar_url', 'avatar', 'user_avatar']);
    const likeCol = pickColumn(cols, ['like_count', 'likes', 'liked_count']);
    const timeCol = pickColumn(cols, ['created_at', 'time', 'createdAt', 'create_time', 'updated_at']);
    const statusCol = pickColumn(cols, ['status']);
    const ratingCol = pickColumn(cols, ['rating', 'score', 'rate']);

    const selectList = [
        `\`${idCol}\` AS id`,
        cityNameCol ? `\`${cityNameCol}\` AS city_name` : `NULL AS city_name`,
        cityIdCol ? `\`${cityIdCol}\` AS city_id` : `NULL AS city_id`,
        userIdCol ? `\`${userIdCol}\` AS user_id` : `NULL AS user_id`,
        userCol ? `\`${userCol}\` AS username` : `'游客' AS username`,
        avatarCol ? `\`${avatarCol}\` AS avatar_url` : `NULL AS avatar_url`,
        `\`${contentCol}\` AS content`,
        likeCol ? `COALESCE(\`${likeCol}\`, 0) AS like_count` : `0 AS like_count`,
        ratingCol ? `\`${ratingCol}\` AS rating` : `NULL AS rating`,
        timeCol ? `\`${timeCol}\` AS created_at` : `NULL AS created_at`,
        `'${tableName}' AS source`
    ];

    const cleanCity = String(cityName || '').replace(/[\s　]/g, '');
    const where = [];
    const params = [];

    if (cityNameCol && cleanCity) {
        where.push(`REPLACE(REPLACE(TRIM(\`${cityNameCol}\`),' ',''),'　','')=?`);
        params.push(cleanCity);

        where.push(`\`${cityNameCol}\` LIKE ?`);
        params.push(`%${cityName}%`);
    }

    if (cityIdCol && cityId) {
        where.push(`\`${cityIdCol}\`=?`);
        params.push(cityId);
    }

    if (!where.length) return [];

    let sql = `SELECT ${selectList.join(', ')} FROM \`${tableName}\` WHERE (${where.join(' OR ')})`;

    if (statusCol) {
        sql += ` AND (\`${statusCol}\`=1 OR \`${statusCol}\`='1' OR \`${statusCol}\`='active')`;
    }

    sql += sort === 'new'
        ? ` ORDER BY ${timeCol ? `\`${timeCol}\`` : `\`${idCol}\``} DESC LIMIT 100`
        : ` ORDER BY ${likeCol ? `\`${likeCol}\` DESC, ` : ''}${timeCol ? `\`${timeCol}\`` : `\`${idCol}\``} DESC LIMIT 100`;

    try {
        const [rows] = await db.query(sql, params);
        return rows;
    } catch (e) {
        console.error(`/api/comments 读取 ${tableName} 失败:`, e.message);
        return [];
    }
}

async function getUsersMap(userIds) {
    const ids = [...new Set((userIds || []).map(id => Number(id)).filter(Number.isFinite))];
    const map = new Map();

    if (!ids.length) return map;

    try {
        const [rows] = await db.query(
            `SELECT id, phone, nickname, avatar_url FROM users WHERE id IN (?)`,
            [ids]
        );

        rows.forEach(row => {
            map.set(Number(row.id), row);
        });
    } catch (e) {}

    return map;
}

async function getLikedCommentSet(user, commentIds) {
    const ids = [...new Set((commentIds || []).map(id => Number(id)).filter(Number.isFinite))];
    const set = new Set();

    if (!user || !ids.length) return set;

    try {
        const [rows] = await db.query(
            `SELECT comment_id FROM comment_likes WHERE user_id=? AND comment_id IN (?)`,
            [user.id, ids]
        );

        rows.forEach(row => set.add(Number(row.comment_id)));
    } catch (e) {}

    return set;
}

async function getCommentReplies(commentIds) {
    const ids = [...new Set((commentIds || []).map(id => Number(id)).filter(Number.isFinite))];

    if (!ids.length) return new Map();

    const cols = await getTableColumns('comment_replies');
    const map = new Map();

    if (!cols.length) return map;

    const idCol = pickColumn(cols, ['id']) || 'id';
    const commentIdCol = pickColumn(cols, ['comment_id', 'commentId']);
    const parentCol = pickColumn(cols, ['parent_reply_id', 'parent_id', 'reply_to_id']);
    const fromCol = pickColumn(cols, ['from_user_id', 'user_id', 'uid']);
    const toCol = pickColumn(cols, ['to_user_id']);
    const contentCol = pickColumn(cols, ['content', 'reply', 'text', 'body']);
    const timeCol = pickColumn(cols, ['created_at', 'time', 'createdAt', 'create_time', 'updated_at']);
    const statusCol = pickColumn(cols, ['status']);

    if (!commentIdCol || !fromCol || !contentCol) return map;

    let sql = `
        SELECT
            r.\`${idCol}\` AS id,
            r.\`${commentIdCol}\` AS comment_id,
            ${parentCol ? `r.\`${parentCol}\`` : 'NULL'} AS parent_reply_id,
            r.\`${fromCol}\` AS from_user_id,
            ${toCol ? `r.\`${toCol}\`` : 'NULL'} AS to_user_id,
            r.\`${contentCol}\` AS content,
            ${timeCol ? `r.\`${timeCol}\`` : 'NULL'} AS created_at,
            COALESCE(fu.nickname, fu.phone, '用户') AS from_username,
            fu.avatar_url AS from_avatar,
            COALESCE(tu.nickname, tu.phone, '') AS to_username,
            tu.avatar_url AS to_avatar
        FROM comment_replies r
        LEFT JOIN users fu ON r.\`${fromCol}\` = fu.id
        LEFT JOIN users tu ON ${toCol ? `r.\`${toCol}\`` : 'NULL'} = tu.id
        WHERE r.\`${commentIdCol}\` IN (?)
    `;

    if (statusCol) {
        sql += ` AND (r.\`${statusCol}\`=1 OR r.\`${statusCol}\`='1' OR r.\`${statusCol}\`='active')`;
    }

    sql += ` ORDER BY ${timeCol ? `r.\`${timeCol}\`` : `r.\`${idCol}\``} ASC`;

    try {
        const [rows] = await db.query(sql, [ids]);

        rows.forEach(row => {
            const key = Number(row.comment_id);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(row);
        });
    } catch (e) {}

    return map;
}

async function adjustCommentLikeCount(commentId, source, delta) {
    const tables = source ? [source] : ['user_comments', 'travel_comments', 'comments', 'city_comments'];

    for (const tableName of tables) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) continue;

        const cols = await getTableColumns(tableName);
        if (!cols.length || !cols.includes('id')) continue;

        const likeCol = pickColumn(cols, ['like_count', 'likes', 'liked_count']);
        if (!likeCol) continue;

        try {
            await db.query(
                `UPDATE \`${tableName}\` SET \`${likeCol}\`=GREATEST(COALESCE(\`${likeCol}\`,0)+?,0) WHERE id=?`,
                [delta, commentId]
            );
        } catch (e) {}
    }
}

async function getCommentLikeCount(commentId, source) {
    const tables = source ? [source] : ['user_comments', 'travel_comments', 'comments', 'city_comments'];

    for (const tableName of tables) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) continue;

        const cols = await getTableColumns(tableName);
        if (!cols.length || !cols.includes('id')) continue;

        const likeCol = pickColumn(cols, ['like_count', 'likes', 'liked_count']);
        if (!likeCol) continue;

        try {
            const [rows] = await db.query(
                `SELECT COALESCE(\`${likeCol}\`,0) AS like_count FROM \`${tableName}\` WHERE id=? LIMIT 1`,
                [commentId]
            );

            if (rows[0]) return Number(rows[0].like_count || 0);
        } catch (e) {}
    }

    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM comment_likes WHERE comment_id=?`,
            [commentId]
        );

        return Number(rows[0]?.cnt || 0);
    } catch (e) {
        return 0;
    }
}

async function findCommentOwner(commentId) {
    for (const tableName of ['user_comments', 'travel_comments', 'comments', 'city_comments']) {
        const cols = await getTableColumns(tableName);
        if (!cols.length || !cols.includes('id')) continue;

        const userIdCol = pickColumn(cols, ['user_id', 'uid', 'author_id']);
        if (!userIdCol) continue;

        try {
            const [rows] = await db.query(
                `SELECT \`${userIdCol}\` AS user_id FROM \`${tableName}\` WHERE id=? LIMIT 1`,
                [commentId]
            );

            if (rows[0]?.user_id) return Number(rows[0].user_id);
        } catch (e) {}
    }

    return null;
}

/* =========================
   图片代理
========================= */
app.get('/proxy-image', (req, res) => {
    const rawUrl = req.query.url;

    if (!rawUrl) {
        return res.status(400).send('missing url');
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (e) {
        return res.status(400).send('invalid url');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).send('invalid protocol');
    }

    const client = parsed.protocol === 'https:' ? https : http;

    const request = client.get(parsed, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    }, (proxyRes) => {
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            res.redirect(`/proxy-image?url=${encodeURIComponent(proxyRes.headers.location)}`);
            proxyRes.resume();
            return;
        }

        res.status(proxyRes.statusCode || 200);
        res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        proxyRes.pipe(res);
    });

    request.on('error', () => {
        res.status(500).send('image proxy failed');
    });

    request.setTimeout(10000, () => {
        request.destroy();
        if (!res.headersSent) res.status(504).send('image proxy timeout');
    });
});

/* =========================
   城市 API
========================= */
app.get('/api/top30', (req, res) => {
    const region = normalizeRegion(req.query.region || 'all');

    pool.query(
        {
            sql: `SELECT * FROM cities WHERE (?='all' OR region=?) ORDER BY score DESC, heat DESC LIMIT 1000`,
            timeout: 30000
        },
        [region, region],
        (err, data) => {
            if (err) {
                console.error('/api/top30 查询失败:', err.message);
                return pool.query(
                    {
                        sql: `SELECT * FROM cities ORDER BY score DESC, heat DESC LIMIT 1000`,
                        timeout: 30000
                    },
                    (fallbackErr, fallbackData) => {
                        if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
                        res.json(fillCityImages(collapseCityRows(fallbackData).slice(0, 30)));
                    }
                );
            }
            res.json(fillCityImages(collapseCityRows(data).slice(0, 30)));
        }
    );
});

app.get('/api/search/keyword', (req, res) => {
    const q = req.query.q || '';
    const like = `%${q}%`;

    pool.query(
        `SELECT * FROM cities 
         WHERE name LIKE ? 
            OR pinyin LIKE ? 
            OR province LIKE ? 
            OR intro LIKE ? 
            OR detail_intro LIKE ? 
            OR tags LIKE ? 
            OR highlights LIKE ?
         ORDER BY score DESC, heat DESC LIMIT 1000`,
        [like, like, like, like, like, like, like],
        (err, data) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(fillCityImages(collapseCityRows(data).slice(0, 30)));
        }
    );
});

app.get('/api/search/filter', async (req, res) => {
    try {
        const region = normalizeRegion(req.query.region || 'all');
        const data = await searchCitiesWithFilters(region, {
            budget: req.query.budget,
            days: req.query.days,
            tags: req.query.tags
        });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/search/full', async (req, res) => {
    try {
        const region = normalizeRegion(req.query.region || 'all');
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

        const origin = hasLocation ? {
            id: req.query.city_id || req.query.cityId || null,
            name: req.query.city || req.query.city_name || req.query.name || '',
            lat,
            lng
        } : null;

        const data = await searchCitiesWithFilters(region, {
            budget: req.query.budget,
            days: req.query.days,
            tags: req.query.tags
        }, origin);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/picker/list', (req, res) => {
    const region = normalizeRegion(req.query.region || '国内');
    const keyword = String(req.query.keyword || '').trim();

    let sql = `SELECT name, pinyin, region FROM cities WHERE 1=1`;
    const params = [];

    if (region !== 'all') {
        sql += ` AND region=?`;
        params.push(region);
    }

    if (keyword) {
        sql += ` AND (name LIKE ? OR pinyin LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 1000);

    sql += ` ORDER BY pinyin ASC, name ASC LIMIT ${limit}`;

    pool.query(sql, params, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });

        const seen = new Set();
        const list = [];

        (Array.isArray(data) ? data : []).forEach(item => {
            const key = cleanCityNameValue(item.name);
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(item);
        });

        res.json(list);
    });
});

app.get('/api/city', async (req, res) => {
    try {
        const name = String(req.query.name || '').trim();

        if (!name) {
            return res.json(null);
        }

        let city = await getMergedCityByName(name);

        if (!city) {
            return res.json(null);
        }

        city = await enrichCityDetails(city);
        city = fillCityImage(normalizeCityRow(city));

        res.json(city);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   景点图片 API
========================= */
app.get('/api/city/attractions', async (req, res) => {
    try {
        const name = String(req.query.name || '').trim();

        if (!name) {
            return res.json([]);
        }

        const city = await getMergedCityByName(name);

        if (!city) {
            return res.json([]);
        }

        let rows = [];

        try {
            const [attractionRows] = await db.query(
                `
                SELECT 
                    a.*,
                    c.name AS city_name,
                    c.pinyin AS city_pinyin,
                    c.name_en AS city_name_en
                FROM city_attractions a
                INNER JOIN cities c ON a.city_id = c.id
                WHERE c.name = ?
                ORDER BY 
                    COALESCE(a.sort_order, 9999) ASC,
                    a.id ASC
                LIMIT 12
                `,
                [name]
            );

            rows = Array.isArray(attractionRows) ? attractionRows : [];
        } catch (e) {
            rows = [];
        }

        let list = rows.map(item => ({
            ...item,
            city_name: item.city_name || city.name,
            city_pinyin: item.city_pinyin || city.pinyin,
            city_name_en: item.city_name_en || city.name_en
        }));

        if (!list.length) {
            list = buildFallbackAttractions(city);
        }

        res.json(fillAttractionImages(list).slice(0, 12));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   用户账号 API
========================= */
app.post('/api/auth/register', async (req, res) => {
    try {
        const phone = String(req.body.phone || req.body.username || '').trim();
        const password = String(req.body.password || '').trim();
        const nickname = String(req.body.nickname || phone).trim();
        const avatarUrl = req.body.avatar_url || req.body.avatar || DEFAULT_AVATAR;

        if (!phone || !password) {
            return res.status(400).json({ error: '请输入手机号和密码' });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ error: '请输入正确手机号' });
        }

        const [exists] = await db.query(
            `SELECT id FROM users WHERE phone=? LIMIT 1`,
            [phone]
        );

        if (exists.length) {
            return res.status(409).json({ error: '手机号已注册' });
        }

        const passwordHash = hashPassword(password);

        const [result] = await db.query(
            `INSERT INTO users (phone, password_hash, nickname, avatar_url) VALUES (?, ?, ?, ?)`,
            [phone, passwordHash, nickname, avatarUrl]
        );

        const [rows] = await db.query(
            `SELECT id, phone, nickname, avatar_url, created_at, last_login_at, status FROM users WHERE id=? LIMIT 1`,
            [result.insertId]
        );

        res.json({ ok: true, user: safeUser(rows[0]) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const phone = String(req.body.phone || req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!phone || !password) {
            return res.status(400).json({ error: '请输入手机号和密码' });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ error: '请输入正确手机号' });
        }

        const [rows] = await db.query(
            `SELECT id, phone, password_hash, nickname, avatar_url, created_at, last_login_at, status FROM users WHERE phone=? AND status=1 LIMIT 1`,
            [phone]
        );

        const user = rows[0];

        if (!user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: '手机号或密码错误' });
        }

        if (user.password_hash === password) {
            await db.query(
                `UPDATE users SET password_hash=?, last_login_at=NOW() WHERE id=?`,
                [hashPassword(password), user.id]
            );
        } else {
            await db.query(
                `UPDATE users SET last_login_at=NOW() WHERE id=?`,
                [user.id]
            );
        }

        const [updatedRows] = await db.query(
            `SELECT id, phone, nickname, avatar_url, created_at, last_login_at, status FROM users WHERE id=? LIMIT 1`,
            [user.id]
        );

        res.json({ ok: true, user: safeUser(updatedRows[0]) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/profile', async (req, res) => {
    try {
        const user = await findUserByIdentifier(req.query);

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const [commentRows] = await db.query(
            `SELECT id, city_name AS city, content, like_count AS likes, created_at AS time FROM user_comments WHERE user_id=? AND status=1 ORDER BY created_at DESC`,
            [user.id]
        );

        const [likeRows] = await db.query(
            `SELECT cl.id, cl.comment_id, cl.created_at AS time, uc.city_name AS city, uc.content FROM comment_likes cl LEFT JOIN user_comments uc ON cl.comment_id=uc.id WHERE cl.user_id=? ORDER BY cl.created_at DESC`,
            [user.id]
        );

        const [replyRows] = await db.query(
            `SELECT cr.id, cr.content, cr.created_at AS time, fu.phone AS from_user, uc.city_name AS city, uc.content AS comment_content FROM comment_replies cr LEFT JOIN users fu ON cr.from_user_id=fu.id LEFT JOIN user_comments uc ON cr.comment_id=uc.id WHERE cr.to_user_id=? AND cr.status=1 ORDER BY cr.created_at DESC`,
            [user.id]
        );

        const result = safeUser(user);
        result.comments = commentRows;
        result.likes = likeRows;
        result.replies = replyRows.map(r => ({
            id: r.id,
            from: r.from_user,
            content: r.content,
            time: r.time,
            city: r.city,
            comment_content: r.comment_content
        }));

        res.json({ ok: true, user: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/profile/avatar', async (req, res) => {
    try {
        const user = await findUserByIdentifier(req.body);
        const avatarUrl = req.body.avatar_url || req.body.avatar;

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        if (!avatarUrl) {
            return res.status(400).json({ error: '缺少头像数据' });
        }

        await db.query(
            `UPDATE users SET avatar_url=?, updated_at=NOW() WHERE id=?`,
            [avatarUrl, user.id]
        );

        const [rows] = await db.query(
            `SELECT id, phone, nickname, avatar_url, created_at, last_login_at, status FROM users WHERE id=? LIMIT 1`,
            [user.id]
        );

        res.json({ ok: true, user: safeUser(rows[0]) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   评论 API
========================= */
app.get('/api/comments', async (req, res) => {
    try {
        const city = String(req.query.city || req.query.city_name || '').trim();
        const sort = req.query.sort === 'new' ? 'new' : 'hot';
        const viewer = await findUserByIdentifier(req.query).catch(() => null);

        if (!city) {
            return res.json([]);
        }

        const cleanCity = city.replace(/[\s　]/g, '');
        const [cityRows] = await db.query(
            `SELECT id, name FROM cities WHERE name=? OR REPLACE(REPLACE(TRIM(name),' ',''),'　','')=? OR name LIKE ? LIMIT 1`,
            [city, cleanCity, `%${city}%`]
        );

        const cityId = cityRows[0]?.id || null;

        const commentGroups = await Promise.all([
            readCommentsFromTable('travel_comments', city, cityId, sort),
            readCommentsFromTable('user_comments', city, cityId, sort),
            readCommentsFromTable('comments', city, cityId, sort),
            readCommentsFromTable('city_comments', city, cityId, sort)
        ]);

        let rows = commentGroups.flat().filter(row => row && row.content);

        const commentIds = rows.map(row => row.id).filter(Boolean);
        const userIds = rows.map(row => row.user_id).filter(Boolean);
        const usersMap = await getUsersMap(userIds);
        const likedSet = await getLikedCommentSet(viewer, commentIds);
        const repliesMap = await getCommentReplies(commentIds);

        rows = rows
            .map(row => {
                const user = row.user_id ? usersMap.get(Number(row.user_id)) : null;
                const username = user
                    ? (user.nickname || user.phone || row.username || '游客')
                    : (row.username || '游客');
                const avatarUrl = user
                    ? (user.avatar_url || DEFAULT_AVATAR)
                    : (row.avatar_url || DEFAULT_AVATAR);

                return {
                    id: row.id,
                    city_name: row.city_name || city,
                    city_id: row.city_id || cityId,
                    user_id: row.user_id || null,
                    username,
                    nickname: username,
                    avatar: avatarUrl,
                    avatar_url: avatarUrl,
                    content: row.content,
                    likes: Number(row.like_count || 0),
                    like_count: Number(row.like_count || 0),
                    liked_by_me: likedSet.has(Number(row.id)),
                    created_at: row.created_at || null,
                    source: row.source || '',
                    replies: repliesMap.get(Number(row.id)) || []
                };
            })
            .sort((a, b) => {
                if (sort === 'new') {
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                }

                const likeDiff = Number(b.like_count || 0) - Number(a.like_count || 0);
                if (likeDiff !== 0) return likeDiff;

                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            })
            .slice(0, 100);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/comments', async (req, res) => {
    try {
        const user = await findUserByIdentifier(req.body);
        const cityName = String(req.body.city_name || req.body.city || '').trim();
        const content = String(req.body.content || '').trim();

        if (!user) {
            return res.status(401).json({ error: '请先登录' });
        }

        if (!cityName) {
            return res.status(400).json({ error: '缺少城市名称' });
        }

        if (!content) {
            return res.status(400).json({ error: '请输入评论内容' });
        }

        const [result] = await db.query(
            `INSERT INTO user_comments (user_id, city_name, content) VALUES (?, ?, ?)`,
            [user.id, cityName, content]
        );

        const [rows] = await db.query(
            `SELECT uc.id, uc.city_name, uc.user_id, COALESCE(u.nickname, u.phone) AS username, u.avatar_url, uc.content, uc.like_count, uc.created_at FROM user_comments uc LEFT JOIN users u ON uc.user_id=u.id WHERE uc.id=? LIMIT 1`,
            [result.insertId]
        );

        res.json({ ok: true, comment: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/comments/like', async (req, res) => {
    try {
        const user = await findUserByIdentifier(req.body);
        const commentId = req.body.comment_id || req.body.commentId;
        const source = String(req.body.source || '').trim();
        const hasClientState = typeof req.body.currently_liked === 'boolean';
        const currentlyLiked = req.body.currently_liked === true;

        if (!user) {
            return res.status(401).json({ error: '请先登录' });
        }

        if (!commentId) {
            return res.status(400).json({ error: '缺少评论ID' });
        }

        const likeCols = await getTableColumns('comment_likes');
        const hasSourceCol = likeCols.includes('source') || likeCols.includes('comment_source') || likeCols.includes('table_name');
        const sourceCol = likeCols.includes('source') ? 'source' : (likeCols.includes('comment_source') ? 'comment_source' : (likeCols.includes('table_name') ? 'table_name' : null));

        let exists = [];

        try {
            if (sourceCol && source) {
                const [rows] = await db.query(
                    `SELECT id FROM comment_likes WHERE user_id=? AND comment_id=? AND \`${sourceCol}\`=? LIMIT 1`,
                    [user.id, commentId, source]
                );
                exists = rows;
            } else {
                const [rows] = await db.query(
                    `SELECT id FROM comment_likes WHERE user_id=? AND comment_id=? LIMIT 1`,
                    [user.id, commentId]
                );
                exists = rows;
            }
        } catch (e) {
            exists = [];
        }

        let liked;
        let delta;

        if (hasClientState) {
            liked = !currentlyLiked;
            delta = liked ? 1 : -1;
        } else if (exists.length) {
            liked = false;
            delta = -1;
        } else {
            liked = true;
            delta = 1;
        }

        try {
            if (!liked) {
                if (sourceCol && source) {
                    await db.query(
                        `DELETE FROM comment_likes WHERE user_id=? AND comment_id=? AND \`${sourceCol}\`=?`,
                        [user.id, commentId, source]
                    );
                } else {
                    await db.query(
                        `DELETE FROM comment_likes WHERE user_id=? AND comment_id=?`,
                        [user.id, commentId]
                    );
                }
            } else if (!exists.length) {
                if (sourceCol && source) {
                    await db.query(
                        `INSERT INTO comment_likes (user_id, comment_id, \`${sourceCol}\`) VALUES (?, ?, ?)`,
                        [user.id, commentId, source]
                    );
                } else {
                    await db.query(
                        `INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)`,
                        [user.id, commentId]
                    );
                }
            }
        } catch (e) {
            // 兼容历史表外键只指向 user_comments 的情况：仍更新原评论表点赞数，前端立即显示状态。
        }

        await adjustCommentLikeCount(commentId, source, delta);

        const likeCount = await getCommentLikeCount(commentId, source);

        res.json({ ok: true, liked, like_count: likeCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/comments/reply', async (req, res) => {
    try {
        const fromUser = await findUserByIdentifier(req.body);
        const commentId = req.body.comment_id || req.body.commentId;
        const parentReplyId = req.body.parent_reply_id || req.body.parentReplyId || null;
        const content = String(req.body.content || '').trim();

        if (!fromUser) return res.status(401).json({ error: '请先登录' });
        if (!commentId) return res.status(400).json({ error: '缺少评论ID' });
        if (!content) return res.status(400).json({ error: '请输入回复内容' });

        const cols = await getTableColumns('comment_replies');

        if (!cols.length) {
            return res.status(500).json({ error: '评论回复表不存在' });
        }

        const commentIdCol = pickColumn(cols, ['comment_id', 'commentId']);
        const parentCol = pickColumn(cols, ['parent_reply_id', 'parent_id', 'reply_to_id']);
        const fromCol = pickColumn(cols, ['from_user_id', 'user_id', 'uid']);
        const toCol = pickColumn(cols, ['to_user_id']);
        const contentCol = pickColumn(cols, ['content', 'reply', 'text', 'body']);
        const sourceCol = pickColumn(cols, ['source', 'comment_source', 'table_name']);
        const source = String(req.body.source || '').trim();

        if (!commentIdCol || !fromCol || !contentCol) {
            return res.status(500).json({ error: '评论回复表字段不完整' });
        }

        let toUserId = req.body.to_user_id || req.body.toUserId || null;

        if (!toUserId) {
            toUserId = await findCommentOwner(commentId);
        }

        if (!toUserId) {
            toUserId = fromUser.id;
        }

        const insertCols = [commentIdCol, fromCol, contentCol];
        const values = [commentId, fromUser.id, content];

        if (toCol) {
            insertCols.push(toCol);
            values.push(toUserId);
        }

        if (parentCol && parentReplyId) {
            insertCols.push(parentCol);
            values.push(parentReplyId);
        }

        if (sourceCol && source) {
            insertCols.push(sourceCol);
            values.push(source);
        }

        const placeholders = insertCols.map(() => '?').join(', ');
        const sql = `INSERT INTO comment_replies (${insertCols.map(col => `\`${col}\``).join(', ')}) VALUES (${placeholders})`;

        const [result] = await db.query(sql, values);

        res.json({ ok: true, reply_id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   404 处理
========================= */
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API not found' });
});

app.use((req, res, next) => {
    if (req.path.startsWith('/images/')) {
        return res.status(404).send('image not found');
    }
    next();
});

app.use((req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('server running:', PORT);
});