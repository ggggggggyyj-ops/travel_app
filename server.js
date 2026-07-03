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
            sql: `SELECT * FROM cities WHERE (?='all' OR region=?) ORDER BY score DESC LIMIT 30`,
            timeout: 30000
        },
        [region, region],
        (err, data) => {
            if (err) {
                console.error('/api/top30 查询失败:', err.message);
                return pool.query(
                    {
                        sql: `SELECT * FROM cities LIMIT 30`,
                        timeout: 30000
                    },
                    (fallbackErr, fallbackData) => {
                        if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
                        res.json(fillCityImages(fallbackData));
                    }
                );
            }
            res.json(fillCityImages(data));
        }
    );
});

app.get('/api/search/keyword', (req, res) => {
    const q = req.query.q || '';
    const like = `%${q}%`;

    pool.query(
        `SELECT * FROM cities WHERE name LIKE ? OR intro LIKE ? ORDER BY score DESC LIMIT 30`,
        [like, like],
        (err, data) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(fillCityImages(data));
        }
    );
});

app.get('/api/search/filter', (req, res) => {
    const region = normalizeRegion(req.query.region || 'all');
    let sql = `SELECT * FROM cities WHERE 1=1`;
    const params = [];

    if (region !== 'all') {
        sql += ` AND region=?`;
        params.push(region);
    }

    if (req.query.budget) {
        sql += ` AND budget <= ?`;
        params.push(Number(req.query.budget));
    }

    if (req.query.days) {
        sql += ` AND days_min <= ?`;
        params.push(Number(req.query.days));
    }

    if (req.query.tags) {
        const tags = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
        tags.forEach(tag => {
            sql += ` AND tags LIKE ?`;
            params.push(`%${tag}%`);
        });
    }

    sql += ` ORDER BY score DESC LIMIT 30`;

    pool.query(sql, params, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(fillCityImages(data));
    });
});

app.get('/api/search/full', (req, res) => {
    const region = normalizeRegion(req.query.region || 'all');
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

    let sql = hasLocation
        ? `SELECT *, (6371 * ACOS(COS(RADIANS(?)) * COS(RADIANS(lat)) * COS(RADIANS(lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(lat)))) AS distance FROM cities WHERE 1=1`
        : `SELECT * FROM cities WHERE 1=1`;

    const params = hasLocation ? [lat, lng, lat] : [];

    if (region !== 'all') {
        sql += ` AND region=?`;
        params.push(region);
    }

    if (req.query.budget) {
        sql += ` AND budget <= ?`;
        params.push(Number(req.query.budget));
    }

    if (req.query.days) {
        sql += ` AND days_min <= ?`;
        params.push(Number(req.query.days));
    }

    if (req.query.tags) {
        const tags = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
        tags.forEach(tag => {
            sql += ` AND tags LIKE ?`;
            params.push(`%${tag}%`);
        });
    }

    sql += hasLocation ? ` ORDER BY distance ASC, score DESC LIMIT 30` : ` ORDER BY score DESC LIMIT 30`;

    pool.query(sql, params, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(fillCityImages(data));
    });
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

    sql += ` ORDER BY pinyin ASC, name ASC LIMIT 300`;

    pool.query(sql, params, (err, data) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(data);
    });
});

app.get('/api/city', (req, res) => {
    pool.query(
        `SELECT * FROM cities WHERE name=?`,
        [req.query.name],
        (err, data) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(fillCityImage(data[0] || null));
        }
    );
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

        const [cityRows] = await db.query(
            `SELECT * FROM cities WHERE name=? LIMIT 1`,
            [name]
        );

        const city = cityRows[0];

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

        if (!city) {
            return res.json([]);
        }

        const orderSql = sort === 'new'
            ? `created_at DESC`
            : `like_count DESC, created_at DESC`;

        const [rows] = await db.query(
            `SELECT * FROM (
                SELECT id, city_name, username, content, COALESCE(likes, 0) AS like_count, created_at, 'travel_comments' AS source
                FROM travel_comments
                WHERE city_name=?
                UNION ALL
                SELECT uc.id, uc.city_name, COALESCE(u.nickname, u.phone) AS username, uc.content, COALESCE(uc.like_count, 0) AS like_count, uc.created_at, 'user_comments' AS source
                FROM user_comments uc
                LEFT JOIN users u ON uc.user_id=u.id
                WHERE uc.city_name=? AND uc.status=1
            ) AS all_comments
            ORDER BY ${orderSql}`,
            [city, city]
        );

        res.json(rows.map(row => ({
            id: row.id,
            city_name: row.city_name,
            username: row.username,
            content: row.content,
            likes: row.like_count,
            like_count: row.like_count,
            created_at: row.created_at,
            source: row.source
        })));
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
            `SELECT uc.id, uc.city_name, COALESCE(u.nickname, u.phone) AS username, uc.content, uc.like_count, uc.created_at FROM user_comments uc LEFT JOIN users u ON uc.user_id=u.id WHERE uc.id=? LIMIT 1`,
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

        if (!user) {
            return res.status(401).json({ error: '请先登录' });
        }

        if (!commentId) {
            return res.status(400).json({ error: '缺少评论ID' });
        }

        await db.query(
            `INSERT IGNORE INTO comment_likes (user_id, comment_id) VALUES (?, ?)`,
            [user.id, commentId]
        );

        await db.query(
            `UPDATE user_comments SET like_count=(SELECT COUNT(*) FROM comment_likes WHERE comment_id=?) WHERE id=?`,
            [commentId, commentId]
        );

        const [rows] = await db.query(
            `SELECT like_count FROM user_comments WHERE id=? LIMIT 1`,
            [commentId]
        );

        res.json({ ok: true, like_count: rows[0]?.like_count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/comments/reply', async (req, res) => {
    try {
        const fromUser = await findUserByIdentifier({ user_id: req.body.from_user_id || req.body.fromUserId, phone: req.body.from_phone });
        const toUser = await findUserByIdentifier({ user_id: req.body.to_user_id || req.body.toUserId, phone: req.body.to_phone });
        const commentId = req.body.comment_id || req.body.commentId;
        const content = String(req.body.content || '').trim();

        if (!fromUser) return res.status(401).json({ error: '请先登录' });
        if (!toUser) return res.status(404).json({ error: '被回复用户不存在' });
        if (!commentId) return res.status(400).json({ error: '缺少评论ID' });
        if (!content) return res.status(400).json({ error: '请输入回复内容' });

        const [result] = await db.query(
            `INSERT INTO comment_replies (comment_id, from_user_id, to_user_id, content) VALUES (?, ?, ?, ?)`,
            [commentId, fromUser.id, toUser.id, content]
        );

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