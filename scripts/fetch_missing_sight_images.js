const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT_DIR, 'data_export', 'missing_sight_images.txt');
const OUTPUT_SQL = path.join(ROOT_DIR, 'data_export', 'update_attraction_images.sql');
const OUTPUT_REPORT = path.join(ROOT_DIR, 'data_export', 'fetch_sight_images_report.json');
const IMAGE_ROOT = path.join(ROOT_DIR, 'frontend', 'images', 'sights');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 30000);
const DELAY_MS = Number(process.env.DELAY_MS || 1600);
const MAX_CANDIDATES = Number(process.env.MAX_CANDIDATES || 80);
const MIN_IMAGE_BYTES = Number(process.env.MIN_IMAGE_BYTES || 5 * 1024);
const STRICT_MATCH = process.env.STRICT_MATCH === '0' ? false : true;
const FALLBACK_UNMATCHED = process.env.FALLBACK_UNMATCHED === '0' ? false : true;
const DOWNLOAD_RETRY = Number(process.env.DOWNLOAD_RETRY || 3);

function readArg(name, fallback) {
    const prefix = `--${name}=`;
    const item = process.argv.find(v => v.startsWith(prefix));
    return item ? item.slice(prefix.length) : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/&nbsp;/g, '')
        .replace(/amp;/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\s\u3000]+/g, '')
        .replace(/[()（）\[\]【】《》<>“”"'‘’·,，.。:：;；!！?？/\\|_\-—]/g, '');
}

function removeBracketText(value) {
    return String(value || '')
        .replace(/（.*?）/g, '')
        .replace(/\(.*?\)/g, '')
        .trim();
}

function cleanAttractionName(value) {
    return String(value || '')
        .replace(/\bNULL\b/gi, '')
        .replace(/null$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function htmlDecode(value) {
    return String(value || '')
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function safeJsonUnescape(value) {
    let text = String(value || '');
    try {
        text = JSON.parse(`"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch (e) {}
    return htmlDecode(text);
}

function safeUrlDecode(value) {
    const text = String(value || '');
    try {
        return decodeURIComponent(text);
    } catch (e) {
        return text;
    }
}

function sqlEscape(value) {
    return String(value || '').replace(/'/g, "''");
}

function cleanPinyin(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
}

function imageExtFromContentType(contentType, url) {
    const ct = String(contentType || '').toLowerCase();

    if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
    if (ct.includes('image/png')) return 'png';
    if (ct.includes('image/webp')) return 'webp';

    const pathname = (() => {
        try {
            return new URL(url).pathname;
        } catch (e) {
            return '';
        }
    })();

    const ext = path.extname(pathname).replace('.', '').toLowerCase();

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
    }

    return 'jpg';
}

function existingImagePath(item) {
    const dir = path.join(IMAGE_ROOT, item.pinyin);
    const allow = ['jpg', 'jpeg', 'png', 'webp'];

    for (const ext of allow) {
        const filePath = path.join(dir, `${item.attractionId}.${ext}`);

        if (fs.existsSync(filePath) && fs.statSync(filePath).size >= MIN_IMAGE_BYTES) {
            return filePath;
        }
    }

    return '';
}

function webPathFromFile(filePath) {
    return path.relative(path.join(ROOT_DIR, 'frontend'), filePath).replace(/\\/g, '/');
}

function parseInput(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    const rows = [];

    for (const line of lines) {
        let parts = line.split(/\t+/).map(v => v.trim()).filter(v => v !== '');

        if (parts.length < 5) {
            parts = line.split(/\s{2,}/).map(v => v.trim()).filter(v => v !== '');
        }

        if (parts.length < 5) continue;

        const cityName = parts[0];
        const pinyin = cleanPinyin(parts[1]);
        const attractionId = Number(parts[2]);
        const cityId = Number(parts[3]);

        let rest = parts.slice(4);

        while (rest.length && /^null$/i.test(rest[rest.length - 1])) {
            rest.pop();
        }

        let attractionName = cleanAttractionName(rest.join(' '));

        if (!cityName || !pinyin || !attractionId || !cityId || !attractionName) continue;

        rows.push({
            cityName,
            pinyin,
            attractionId,
            cityId,
            attractionName
        });
    }

    return rows;
}

function buildQueries(item) {
    const city = cleanAttractionName(item.cityName);
    const name = cleanAttractionName(item.attractionName);
    const shortName = cleanAttractionName(removeBracketText(name));

    return [
        `${city} ${name}`,
        `${city}${name}`,
        `${city} ${name} 景点`,
        `${city} ${name} 图片`,
        `${city} ${name} 旅游`,
        `${city} ${shortName} 景点`,
        `${city} ${shortName} 图片`,
        `${shortName} ${city}`,
        `${shortName} 景点`,
        `${shortName} 旅游 图片`,
        `${name} ${city} scenic spot`,
        `${name} travel photo`
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);
}

function buildBingSearchUrl(query) {
    const u = new URL('https://www.bing.com/images/search');
    u.searchParams.set('q', query);
    u.searchParams.set('form', 'HDRSC2');
    u.searchParams.set('first', '1');
    u.searchParams.set('tsc', 'ImageBasicHover');
    u.searchParams.set('mkt', 'zh-CN');
    return u.toString();
}

function buildBaiduSearchUrl(query) {
    const u = new URL('https://image.baidu.com/search/acjson');
    u.searchParams.set('tn', 'resultjson_com');
    u.searchParams.set('ipn', 'rj');
    u.searchParams.set('ct', '201326592');
    u.searchParams.set('is', '');
    u.searchParams.set('fp', 'result');
    u.searchParams.set('queryWord', query);
    u.searchParams.set('cl', '2');
    u.searchParams.set('lm', '-1');
    u.searchParams.set('ie', 'utf-8');
    u.searchParams.set('oe', 'utf-8');
    u.searchParams.set('st', '-1');
    u.searchParams.set('ic', '0');
    u.searchParams.set('word', query);
    u.searchParams.set('face', '0');
    u.searchParams.set('istype', '2');
    u.searchParams.set('qc', '');
    u.searchParams.set('nc', '1');
    u.searchParams.set('pn', '0');
    u.searchParams.set('rn', '30');
    return u.toString();
}

function requestText(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https:') ? https : http;

        const req = lib.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
                ...extraHeaders
            },
            timeout: REQUEST_TIMEOUT
        }, res => {
            const chunks = [];

            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

        req.on('timeout', () => req.destroy(new Error('request timeout')));
        req.on('error', reject);
    });
}

function pushCandidate(list, seen, candidate) {
    if (!candidate || !candidate.url) return;

    let imageUrl = safeJsonUnescape(candidate.url).replace(/\\\//g, '/');
    imageUrl = safeUrlDecode(imageUrl);

    if (!/^https?:\/\//i.test(imageUrl)) return;
    if (/\.svg(\?|#|$)/i.test(imageUrl)) return;
    if (/logo|icon|avatar|favicon|blank|default|placeholder/i.test(imageUrl)) return;
    if (seen.has(imageUrl)) return;

    seen.add(imageUrl);

    list.push({
        url: imageUrl,
        title: htmlDecode(safeJsonUnescape(candidate.title || '')),
        pageUrl: htmlDecode(safeJsonUnescape(candidate.pageUrl || '')).replace(/\\\//g, '/'),
        desc: htmlDecode(safeJsonUnescape(candidate.desc || '')),
        source: candidate.source || 'unknown',
        query: candidate.query || ''
    });
}

async function searchBingImages(item) {
    const candidates = [];
    const seen = new Set();
    const queries = buildQueries(item);

    for (const query of queries) {
        if (candidates.length >= MAX_CANDIDATES) break;

        let html = '';

        try {
            html = await requestText(buildBingSearchUrl(query), {
                'Referer': 'https://www.bing.com/'
            });
        } catch (e) {
            await sleep(300);
            continue;
        }

        const decodedHtml = htmlDecode(html);
        let match;

        const reMurl = /"murl"\s*:\s*"(.*?)"/g;

        while ((match = reMurl.exec(decodedHtml)) !== null) {
            if (candidates.length >= MAX_CANDIDATES) break;

            const nearby = decodedHtml.slice(
                Math.max(0, match.index - 1200),
                Math.min(decodedHtml.length, match.index + 2200)
            );

            const titleMatch = nearby.match(/"t"\s*:\s*"(.*?)"/);
            const pageMatch = nearby.match(/"purl"\s*:\s*"(.*?)"/);
            const descMatch = nearby.match(/"desc"\s*:\s*"(.*?)"/);

            pushCandidate(candidates, seen, {
                url: match[1],
                title: titleMatch ? titleMatch[1] : query,
                pageUrl: pageMatch ? pageMatch[1] : '',
                desc: descMatch ? descMatch[1] : '',
                source: 'bing',
                query
            });
        }

        const reJson = /(?:"contentUrl"|"thumbnailUrl"|"imageUrl"|"mediaurl")\s*:\s*"(https?:\\?\/\\?\/.*?)(?<!\\)"/g;

        while ((match = reJson.exec(decodedHtml)) !== null) {
            if (candidates.length >= MAX_CANDIDATES) break;

            pushCandidate(candidates, seen, {
                url: match[1],
                title: query,
                source: 'bing-json',
                query
            });
        }

        const reImgurl = /(?:imgurl|mediaurl|murl)=([^&"'<>]+)/gi;

        while ((match = reImgurl.exec(decodedHtml)) !== null) {
            if (candidates.length >= MAX_CANDIDATES) break;

            pushCandidate(candidates, seen, {
                url: match[1],
                title: query,
                source: 'bing-param',
                query
            });
        }

        await sleep(400);
    }

    return candidates;
}

async function searchBaiduImages(item) {
    const candidates = [];
    const seen = new Set();
    const queries = buildQueries(item).slice(0, 6);

    for (const query of queries) {
        if (candidates.length >= MAX_CANDIDATES) break;

        let text = '';

        try {
            text = await requestText(buildBaiduSearchUrl(query), {
                'Referer': 'https://image.baidu.com/',
                'Accept': 'application/json,text/plain,*/*'
            });
        } catch (e) {
            await sleep(300);
            continue;
        }

        try {
            const json = JSON.parse(text);
            const data = Array.isArray(json.data) ? json.data : [];

            for (const row of data) {
                if (candidates.length >= MAX_CANDIDATES) break;

                const title = row.fromPageTitleEnc || row.fromPageTitle || row.keyword || query;
                const pageUrl = row.fromURL || row.fromUrl || row.bdSourceName || '';

                pushCandidate(candidates, seen, {
                    url: row.objURL || row.middleURL || row.thumbURL,
                    title,
                    pageUrl,
                    desc: row.desc || '',
                    source: 'baidu',
                    query
                });

                pushCandidate(candidates, seen, {
                    url: row.middleURL || row.thumbURL,
                    title,
                    pageUrl,
                    desc: row.desc || '',
                    source: 'baidu-thumb',
                    query
                });
            }
        } catch (e) {
            let match;

            const reObj = /"objURL"\s*:\s*"(.*?)"/g;
            while ((match = reObj.exec(text)) !== null) {
                if (candidates.length >= MAX_CANDIDATES) break;

                pushCandidate(candidates, seen, {
                    url: match[1],
                    title: query,
                    source: 'baidu-regex',
                    query
                });
            }

            const reThumb = /"thumbURL"\s*:\s*"(.*?)"/g;
            while ((match = reThumb.exec(text)) !== null) {
                if (candidates.length >= MAX_CANDIDATES) break;

                pushCandidate(candidates, seen, {
                    url: match[1],
                    title: query,
                    source: 'baidu-thumb-regex',
                    query
                });
            }
        }

        await sleep(400);
    }

    return candidates;
}

async function searchWikimediaImages(item) {
    const queries = buildQueries(item).slice(0, 3);
    const candidates = [];
    const seen = new Set();

    for (const query of queries) {
        const u = new URL('https://commons.wikimedia.org/w/api.php');
        u.searchParams.set('action', 'query');
        u.searchParams.set('generator', 'search');
        u.searchParams.set('gsrsearch', query);
        u.searchParams.set('gsrnamespace', '6');
        u.searchParams.set('gsrlimit', '10');
        u.searchParams.set('prop', 'imageinfo');
        u.searchParams.set('iiprop', 'url');
        u.searchParams.set('format', 'json');
        u.searchParams.set('origin', '*');

        let json;

        try {
            json = JSON.parse(await requestText(u.toString()));
        } catch (e) {
            continue;
        }

        const pages = json && json.query && json.query.pages ? Object.values(json.query.pages) : [];

        for (const page of pages) {
            const imageUrl = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;

            pushCandidate(candidates, seen, {
                url: imageUrl,
                title: page.title || query,
                source: 'wikimedia',
                query
            });
        }
    }

    return candidates;
}

function scoreCandidate(item, candidate) {
    const city = normalizeText(item.cityName);
    const attraction = normalizeText(removeBracketText(item.attractionName));
    const attractionRaw = removeBracketText(item.attractionName);
    const attractionFirst2 = normalizeText(attractionRaw.slice(0, 2));
    const attractionFirst3 = normalizeText(attractionRaw.slice(0, 3));

    const haystack = normalizeText([
        candidate.title,
        candidate.desc,
        safeUrlDecode(candidate.pageUrl),
        safeUrlDecode(candidate.url)
    ].join(' '));

    const queryText = normalizeText(candidate.query || '');

    let score = 0;

    const hasCity = city && haystack.includes(city);
    const hasAttraction = attraction && haystack.includes(attraction);
    const hasAttractionPart =
        (attractionFirst3 && haystack.includes(attractionFirst3)) ||
        (attractionFirst2 && attractionFirst2.length >= 2 && haystack.includes(attractionFirst2));

    const queryHasCity = city && queryText.includes(city);
    const queryHasAttraction = attraction && queryText.includes(attraction);

    if (hasAttraction) score += 140;
    if (!hasAttraction && hasAttractionPart) score += 70;
    if (hasCity) score += 45;

    if (!hasAttraction && !hasAttractionPart && queryHasAttraction) score += 25;
    if (!hasCity && queryHasCity) score += 10;

    if (/\.(jpg|jpeg)(\?|#|$)/i.test(candidate.url)) score += 12;
    if (/\.(png|webp)(\?|#|$)/i.test(candidate.url)) score += 8;

    if (/baike|wikipedia|wikimedia|ctrip|trip|mafengwo|qunar|travel|tour|gov|景区|旅游|攻略|携程|马蜂窝|去哪儿/i.test(`${candidate.title} ${candidate.pageUrl}`)) {
        score += 16;
    }

    if (/logo|icon|avatar|favicon|blank|default|placeholder/i.test(`${candidate.title} ${candidate.pageUrl} ${candidate.url}`)) {
        score -= 100;
    }

    candidate._hasCity = !!hasCity;
    candidate._hasAttraction = !!(hasAttraction || hasAttractionPart);
    candidate._score = score;

    return score;
}

function isCandidateAllowed(item, candidate) {
    scoreCandidate(item, candidate);

    if (!STRICT_MATCH) return candidate._score >= 8;

    return candidate._hasAttraction || (candidate._hasCity && candidate._score >= 45);
}

async function downloadImage(url, targetBasePath) {
    let lastError = null;

    for (let attempt = 1; attempt <= DOWNLOAD_RETRY; attempt++) {
        try {
            const res = await fetch(url, {
                redirect: 'follow',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
                    'Referer': 'https://www.bing.com/'
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const contentType = res.headers.get('content-type') || '';
            const ext = imageExtFromContentType(contentType, url);

            const buffer = Buffer.from(await res.arrayBuffer());

            if (buffer.length < MIN_IMAGE_BYTES) {
                throw new Error(`image too small: ${buffer.length}`);
            }

            if (!String(contentType).toLowerCase().includes('image') && !/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(url)) {
                throw new Error(`not image content-type: ${contentType}`);
            }

            const filePath = `${targetBasePath}.${ext}`;
            fs.writeFileSync(filePath, buffer);

            return filePath;
        } catch (e) {
            lastError = e;
            await sleep(500 * attempt);
        }
    }

    throw lastError || new Error('download failed');
}

async function fetchOne(item) {
    const existed = existingImagePath(item);

    if (existed) {
        return {
            ok: true,
            skipped: true,
            fallback: false,
            reason: 'exists',
            item,
            filePath: existed,
            webPath: webPathFromFile(existed)
        };
    }

    const dir = path.join(IMAGE_ROOT, item.pinyin);
    ensureDir(dir);

    let candidates = [];

    try {
        const wikimedia = await searchWikimediaImages(item);
        const baidu = await searchBaiduImages(item);
        const bing = await searchBingImages(item);
        candidates = [...wikimedia, ...baidu, ...bing];
    } catch (e) {}

    const unique = [];
    const seen = new Set();

    for (const c of candidates) {
        if (!c || !c.url) continue;
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        unique.push(c);
    }

    let allowed = unique
        .filter(c => c && c.url)
        .filter(c => isCandidateAllowed(item, c))
        .sort((a, b) => scoreCandidate(item, b) - scoreCandidate(item, a));

    let fallbackUsed = false;

    if (!allowed.length && FALLBACK_UNMATCHED) {
        allowed = unique
            .filter(c => c && c.url)
            .sort((a, b) => scoreCandidate(item, b) - scoreCandidate(item, a))
            .slice(0, MAX_CANDIDATES);

        fallbackUsed = allowed.length > 0;
    }

    if (!allowed.length) {
        return {
            ok: false,
            reason: 'no candidate',
            item
        };
    }

    const targetBasePath = path.join(dir, String(item.attractionId));
    const errors = [];

    for (const candidate of allowed.slice(0, MAX_CANDIDATES)) {
        try {
            const filePath = await downloadImage(candidate.url, targetBasePath);

            return {
                ok: true,
                skipped: false,
                fallback: fallbackUsed,
                item,
                filePath,
                webPath: webPathFromFile(filePath),
                candidate: {
                    source: candidate.source,
                    query: candidate.query,
                    url: candidate.url,
                    title: candidate.title,
                    pageUrl: candidate.pageUrl,
                    score: candidate._score
                }
            };
        } catch (e) {
            errors.push({
                url: candidate.url,
                error: e.message
            });
        }
    }

    return {
        ok: false,
        reason: 'download failed',
        item,
        errors
    };
}

function writeOutputs(results) {
    ensureDir(path.dirname(OUTPUT_SQL));

    const sqlLines = [];
    sqlLines.push('-- 自动生成：补齐 city_attractions.image_url');
    sqlLines.push('-- 先抽查图片是否正确，再在本地 SQL Server 的 travel 数据库执行。');
    sqlLines.push('');

    for (const result of results) {
        const item = result.item;

        if (result.ok && result.webPath) {
            sqlLines.push(
                `UPDATE dbo.city_attractions SET image_url = '${sqlEscape(result.webPath)}' WHERE id = ${Number(item.attractionId)}; -- ${item.cityName} / ${item.attractionName}`
            );
        } else {
            sqlLines.push(
                `-- 未下载：${item.cityName} / ${item.attractionName} / id=${item.attractionId} / ${result.reason || 'unknown'}`
            );
        }
    }

    fs.writeFileSync(OUTPUT_SQL, sqlLines.join('\n'), 'utf8');
    fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(results, null, 2), 'utf8');
}

async function main() {
    const inputArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_INPUT;
    const inputFile = path.resolve(inputArg);
    const start = Number(readArg('start', 0));
    const limitRaw = readArg('limit', '');
    const limit = limitRaw === '' || String(limitRaw).toLowerCase() === 'all' ? 0 : Number(limitRaw);

    if (!fs.existsSync(inputFile)) {
        console.error(`找不到缺图清单：${inputFile}`);
        console.error('请把缺图清单保存为 data_export/missing_sight_images.txt，或把文件路径作为第一个参数传入。');
        process.exit(1);
    }

    ensureDir(IMAGE_ROOT);

    let rows = parseInput(inputFile);
    const totalBeforeSlice = rows.length;

    if (start > 0) rows = rows.slice(start);
    if (limit > 0) rows = rows.slice(0, limit);

    console.log(`读取缺图景点：${rows.length} 条 / 原始清单 ${totalBeforeSlice} 条`);
    console.log(`严格匹配：${STRICT_MATCH ? '开启' : '关闭'}`);
    console.log(`无严格匹配时兜底：${FALLBACK_UNMATCHED ? '开启' : '关闭'}`);
    console.log(`最大候选：${MAX_CANDIDATES}`);
    console.log(`图片目录：${IMAGE_ROOT}`);
    console.log('');

    const results = [];
    let success = 0;
    let failed = 0;
    let fallbackCount = 0;

    for (let i = 0; i < rows.length; i++) {
        const item = rows[i];
        const label = `[${i + 1}/${rows.length}] ${item.cityName} - ${item.attractionName} (${item.attractionId})`;

        try {
            const result = await fetchOne(item);
            results.push(result);

            if (result.ok) {
                success += 1;
                if (result.fallback) fallbackCount += 1;

                console.log(`${label} => OK ${result.webPath}${result.skipped ? ' 已存在' : ''}${result.fallback ? ' 兜底匹配' : ''}`);
            } else {
                failed += 1;
                console.log(`${label} => FAIL ${result.reason}`);
            }
        } catch (e) {
            failed += 1;

            results.push({
                ok: false,
                reason: e.message,
                item
            });

            console.log(`${label} => ERROR ${e.message}`);
        }

        writeOutputs(results);
        await sleep(DELAY_MS);
    }

    writeOutputs(results);

    console.log('');
    console.log(`完成：成功 ${success} 条，失败 ${failed} 条，兜底匹配 ${fallbackCount} 条`);
    console.log(`SQL 更新文件：${OUTPUT_SQL}`);
    console.log(`报告文件：${OUTPUT_REPORT}`);
    console.log('下一步：先抽查图片，再执行 data_export/update_attraction_images.sql 更新本地 SQL Server。');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});