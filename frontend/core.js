// ================================
// 0. 配置与核心数据源
// ================================
const API_BASE = '';

// ================================
// 1. 全局状态定义
// ================================
let currentRegion = 'all';
let mode = 'home';
let activeFilters = null;
let activeKeyword = '';
let previousScroll = 0;
let currentCity = null;
let currentUser = null;
let pickerTarget = 'base';
let pickerRegion = '国内';
let currentCommentSort = 'hot';
let allCityCache = {};

const USER_STORE_KEY = 'travel_current_user';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';

const tags = [
  '海边',
  '爬山',
  '雪景',
  '古城',
  '美食',
  '温泉',
  '情侣',
  '亲子',
  '拍照',
  '夜景',
  '购物',
  '文化',
];

// ================================
// 2. 核心工具函数
// ================================
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m])
  );
}

function toast(t) {
  const e = document.getElementById('toast');

  if (!e) return;

  e.textContent = t;
  e.style.display = 'block';

  clearTimeout(e._timer);

  e._timer = setTimeout(() => {
    e.style.display = 'none';
  }, 1800);
}

function km(a, b, c, d) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const x = rad(c - a);
  const y = rad(d - b);
  const q =
    Math.sin(x / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;

  return Math.round(R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}

function normalizeImageUrl(url) {
  if (!url) return '';

  let u = String(url).trim().replace(/\\/g, '/');

  if (!u) return '';

  if (/^https?:\/\//i.test(u)) {
    return `/proxy-image?url=${encodeURIComponent(u)}`;
  }

  if (/^data:/i.test(u) || /^blob:/i.test(u)) {
    return u;
  }

  u = u.replace(/^\.?\//, '');
  u = u.replace(/^frontend\//, '');

  return '/' + u;
}

function bgStyle(url) {
  const img = normalizeImageUrl(url);

  if (!img) {
    return 'background:#121620 center center / cover no-repeat !important;';
  }

  return `background:#121620 url("${String(img).replace(/"/g, '&quot;')}") center center / cover no-repeat !important;`;
}

function jsArg(value) {
  return JSON.stringify(String(value ?? ''));
}

function forceScrollTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMaybeJSON(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function normalizeText(value) {
  if (value == null) return '';

  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean).join('、');
  }

  const parsed = parseMaybeJSON(value, null);

  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeText(item)).filter(Boolean).join('、');
  }

  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed).map((item) => normalizeText(item)).filter(Boolean).join(' ');
  }

  return String(value)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]*\\[ \t]*(?=\n|$)/g, '\n')
    .replace(/[ \t]*\\[ \t]*(?=(行程|Day\s*\d|交通|住宿|第\s*\d\s*天))/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitItems(value) {
  const parsed = parseMaybeJSON(value, null);

  if (Array.isArray(parsed)) {
    return parsed.map((x) => String(x).trim()).filter(Boolean);
  }

  return normalizeText(value)
    .split(/[，、,;；\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatTime(t) {
  if (!t) return '';

  const d = new Date(t);

  if (Number.isNaN(d.getTime())) {
    return String(t);
  }

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  return `${y}-${m}-${day} ${h}:${min}`;
}

function getNumber(value) {
  if (value == null || value === '') return null;

  const n = Number(value);

  if (Number.isFinite(n)) return n;

  const match = String(value).match(/\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
}


function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
}

function parseDaysTarget(value) {
  if (value == null || value === '') return null;

  const text = String(value);
  const match = text.match(/(\d+)/);

  return match ? Number(match[1]) : null;
}

function getCityScoreLabel(c) {
  const score = getNumber(c?.score ?? c?.rating ?? c?.rate ?? c?.recommend_score);
  const heat = getNumber(c?.heat ?? c?.hot ?? c?.popularity);

  if (score == null && heat == null) return '';

  let finalScore = score;

  if (score != null && heat != null) {
    const heatScore = Math.max(0, Math.min(10, heat / 1000));
    finalScore = score * 0.7 + heatScore * 0.3;
  } else if (score == null && heat != null) {
    finalScore = Math.max(0, Math.min(10, heat / 1000));
  }

  return Number(finalScore).toFixed(2);
}

function getBudgetDiff(c, budget) {
  const cityBudget = getCityBudget(c);
  const target = getNumber(budget);

  if (cityBudget == null || target == null) return 999999;

  return Math.abs(cityBudget - target);
}

function getDaysDiff(c, days) {
  const target = parseDaysTarget(days);

  if (!target) return 999999;

  const min = getCityDaysMin(c);
  const max = getCityDaysMax(c);

  if (min == null && max == null) return 999999;

  if (target >= 4) {
    if ((max != null && max >= 4) || (min != null && min >= 4)) return 0;
    return Math.abs(4 - Number(max ?? min ?? 0));
  }

  if (min != null && max != null) {
    if (min <= target && target <= max) return 0;
    return Math.min(Math.abs(min - target), Math.abs(max - target));
  }

  return Math.abs(Number(min ?? max ?? 0) - target);
}

function getCurrentMonthLabel() {
  const monthMap = [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ];

  return monthMap[new Date().getMonth()];
}

// ================================
// 3. 加载提示与补丁样式
// ================================
function showThinking() {
  let mask = document.getElementById('thinkingMask');

  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'thinkingMask';
    mask.innerHTML = `
            <div class="thinking-box">
                <div class="thinking-spinner"></div>
                <div>正在思考推荐...</div>
            </div>
        `;
    document.body.appendChild(mask);
  }

  mask.style.display = 'flex';
}

function hideThinking() {
  const mask = document.getElementById('thinkingMask');

  if (mask) {
    mask.style.display = 'none';
  }
}

function injectBugFixStyles() {
  if (document.getElementById('coreBugFixStyles')) return;

  const style = document.createElement('style');
  style.id = 'coreBugFixStyles';

  style.textContent = `
        #cityGrid .card {
            cursor: pointer;
        }

        #cityGrid .card .badge.gold {
            font-size: 18px !important;
            padding: 6px 15px !important;
            border-radius: 999px !important;
        }

        #hero .badge.gold {
            font-size: 20px !important;
            padding: 7px 18px !important;
            border-radius: 999px !important;
        }

        #picker.show {
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
        }

        #picker .picker-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 30 !important;
            background: rgba(8, 11, 18, 0.96) !important;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }

        #picker .picker-tabs {
            position: sticky !important;
            top: 118px !important;
            z-index: 29 !important;
            background: rgba(8, 11, 18, 0.96) !important;
            padding-top: 12px !important;
            padding-bottom: 12px !important;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }

        #picker [data-picker-city] {
            cursor: pointer;
        }

        #thinkingMask {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(4, 7, 13, 0.46);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
        }

        .thinking-box {
            min-width: 220px;
            padding: 26px 30px;
            border-radius: 22px;
            border: 1px solid rgba(245, 211, 130, 0.42);
            background: rgba(20, 24, 36, 0.92);
            color: #f5e6a8;
            font-size: 22px;
            font-weight: 900;
            display: flex;
            align-items: center;
            gap: 16px;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
        }

        .thinking-spinner {
            width: 28px;
            height: 28px;
            border: 4px solid rgba(245, 211, 130, 0.26);
            border-top-color: #f5e6a8;
            border-radius: 50%;
            animation: thinkingSpin 0.85s linear infinite;
        }

        .comment-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 10px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.58);
        }

        .comment-like-btn {
            border: 0;
            background: transparent;
            color: #f5d382;
            cursor: pointer;
            font-weight: 800;
            padding: 0;
        }

        .detail-meta-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 14px;
        }

        .detail-meta-grid span {
            display: inline-flex;
            align-items: center;
            border: 1px solid rgba(255,255,255,.16);
            border-radius: 999px;
            padding: 8px 14px;
            background: rgba(255,255,255,.04);
            color: rgba(255,255,255,.86);
            font-weight: 700;
        }


        .score-badge {
            font-size: 13px !important;
            padding: 4px 11px !important;
            border-radius: 999px !important;
            color: #f5e6a8 !important;
            background: rgba(0,0,0,.54) !important;
        }

        .comment-head-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .comment-avatar-img {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            object-fit: cover;
            flex: 0 0 auto;
            border: 1px solid rgba(245,211,130,.35);
            background: #343845;
        }

        .comment-user-line {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }

        .comment-time {
            font-size: 12px;
            color: rgba(255,255,255,.48);
        }

        .comment-actions-row {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-top: 10px;
        }

        .emoji-like-btn,
        .reply-action-btn {
            border: 0;
            background: transparent;
            color: #f5d382;
            cursor: pointer;
            font-weight: 900;
            padding: 0;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .emoji-like-btn .thumb {
            filter: grayscale(1);
            opacity: .62;
        }

        .emoji-like-btn.liked .thumb {
            filter: grayscale(0);
            opacity: 1;
        }

        .reply-list {
            margin-top: 12px;
            margin-left: 42px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .reply-item {
            background: rgba(255,255,255,.045);
            border-left: 3px solid rgba(245,211,130,.46);
            border-radius: 12px;
            padding: 10px 12px;
        }

        .reply-item p {
            margin: 6px 0 0;
            font-size: 14px;
            line-height: 1.55;
        }

        .reply-editor {
            margin-top: 10px;
            display: flex;
            gap: 8px;
        }

        .reply-editor input {
            flex: 1;
            height: 36px;
            border-radius: 10px;
            border: 1px solid #4a5060;
            background: #252a36;
            color: #fff;
            padding: 0 10px;
            outline: none;
        }

        .reply-editor button {
            width: auto;
            height: 36px;
            margin: 0;
            border-radius: 10px;
            padding: 0 14px;
            font-size: 14px;
        }

        #commentText::placeholder {
            color: transparent !important;
        }



        .comment-form textarea {
            display: none !important;
        }

        .comment-form.editing textarea {
            display: block !important;
        }

        .emoji-like-btn {
            font-size: 18px;
            user-select: none;
        }

        .emoji-like-btn:disabled,
        .reply-action-btn:disabled {
            opacity: .55;
            cursor: default;
        }

        #profileBtn,
        #profileBtnD {
            width: 50px !important;
            height: 50px !important;
            min-width: 50px !important;
            padding: 0 !important;
            border-radius: 50% !important;
            overflow: hidden !important;
            background: transparent !important;
            border: 2px solid rgba(245,211,130,.75) !important;
            box-shadow: 0 8px 22px rgba(0,0,0,.32) !important;
        }

        #profileBtn img,
        #profileBtnD img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
        }


        .metric-badges {
            position: absolute;
            right: 16px;
            top: 16px;
            z-index: 12;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 6px;
            pointer-events: none;
        }

        .hero .metric-badges {
            right: 24px;
            top: 24px;
        }

        .metric-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 26px;
            padding: 4px 11px;
            border-radius: 999px;
            background: rgba(0, 0, 0, .58);
            border: 1px solid rgba(255, 255, 255, .08);
            color: #f5e6a8;
            font-size: 13px;
            line-height: 1;
            font-weight: 900;
            white-space: nowrap;
            box-shadow: 0 4px 14px rgba(0,0,0,.24);
        }

        .hero .metric-badge {
            min-height: 30px;
            padding: 5px 13px;
            font-size: 14px;
        }

        .comment-editor-close {
            display: none !important;
            width: 100%;
            height: 38px;
            margin-top: 8px;
            border: 1px solid #4a5060 !important;
            border-radius: 12px !important;
            background: #252a36 !important;
            color: #ddd !important;
            font-weight: 900;
            cursor: pointer;
        }

        .comment-form.editing .comment-editor-close {
            display: block !important;
        }

        @keyframes thinkingSpin {
            to {
                transform: rotate(360deg);
            }
        }
    `;

  document.head.appendChild(style);
}

// ================================
// 4. API 请求
// ================================
async function fetchData(endpoint = '/cities', options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (!response.ok) return [];

    return await response.json().catch(() => []);
  } catch (error) {
    console.error('API 请求失败:', error);
    return [];
  }
}

async function postJSON(endpoint, body = {}) {
  return fetchData(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// ================================
// 5. 图片与场景
// ================================
function getCityImage(c) {
  if (!c) return '';

  let url = c.image_url || c.img || c.image || '';

  if (!url && c.name_en) {
    url = `images/cities/${c.name_en}.jpg`;
  }

  if (!url && c.pinyin) {
    url = `images/cities/${c.pinyin}.jpg`;
  }

  if (!url && window.cityImages && window.cityImages[c.name]) {
    url = window.cityImages[c.name];
  }

  return normalizeImageUrl(url);
}

function getAttractionImage(a) {
  if (!a) return '';

  let url = a.image_url || a.img || a.image || '';

  return normalizeImageUrl(url);
}

function scene(c) {
  let hls = c.highlights || [];

  if (typeof hls === 'string') {
    hls = hls
      .split(/[，、,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (!Array.isArray(hls) || hls.length === 0) {
    hls = ['城市漫游', '当地美食', '特色街巷'];
  }

  let htmlSpans = '';

  for (let i = 0; i < 3 && i < hls.length; i++) {
    htmlSpans += `<span>${esc(hls[i])}</span>`;
  }

  const imgUrl = getCityImage(c);

  return `
        <div class="scene" style='${bgStyle(imgUrl)}'>
            <div class="cityname">${esc(c.name)}</div>
            <div class="feature-line">${htmlSpans}</div>
        </div>
    `;
}

function oneLine(c) {
  let t = c.intro || c.detail_intro || '';

  if (!t) return '暂无介绍';

  return t
    .replace(/<[^>]*>/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ================================
// 6. 数据归一化与搜索匹配
// ================================
function getCityBudget(c) {
  const direct = getNumber(
    c.budget ?? c.budget_max ?? c.avg_budget ?? c.average_budget ?? c.cost ?? c.price
  );

  if (direct != null) return direct;

  const text = normalizeText(
    c.budgetPlans || c.budget_plans || c.budget_plan || c.plan || c.intro
  );
  const nums = [...text.matchAll(/\d+/g)]
    .map((m) => Number(m[0]))
    .filter(Number.isFinite);

  return nums.length ? Math.min(...nums) : null;
}

function estimateDaysByBudgetClient(c) {
  const budget = getCityBudget(c);

  if (budget == null) return null;

  if (budget <= 1200) return 1;
  if (budget <= 2600) return 2;
  if (budget <= 4200) return 3;

  return 4;
}

function getCityDaysMin(c) {
  const direct = getNumber(c.days_min ?? c.min_days ?? c.days);

  if (direct != null) return direct;

  const text = normalizeText(
    c.days_text || c.duration || c.budgetPlans || c.budget_plans || c.budget_plan
  );
  const nums = [...text.matchAll(/(\d+)\s*天/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);

  if (nums.length) return Math.min(...nums);

  return estimateDaysByBudgetClient(c);
}

function getCityDaysMax(c) {
  const direct = getNumber(c.days_max ?? c.max_days);

  if (direct != null) return direct;

  const text = normalizeText(
    c.days_text || c.duration || c.budgetPlans || c.budget_plans || c.budget_plan
  );
  const nums = [...text.matchAll(/(\d+)\s*天/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);

  if (nums.length) return Math.max(...nums);

  return estimateDaysByBudgetClient(c) == null ? null : 4;
}

function getCityTypeText(c) {
  return [
    c.tags,
    c.type,
    c.types,
    c.travel_type,
    c.travel_types,
    c.tourism_type,
    c.tourism_types,
    c.category,
    c.categories,
    c.highlights,
    c.food,
    c.intro,
    c.detail_intro,
  ]
    .map(normalizeText)
    .join(' ');
}

function cityMatchesTags(c, selectedTags) {
  if (!selectedTags.length) return true;

  const text = getCityTypeText(c);

  return selectedTags.every((tag) => text.includes(tag));
}

function cityMatchesBudget(c, budget) {
  const target = getNumber(budget);

  if (!target) return true;

  const cityBudget = getCityBudget(c);

  if (cityBudget == null) return false;

  const range = Math.max(600, target * 0.35);

  return Math.abs(cityBudget - target) <= range;
}

function cityMatchesDays(c, days) {
  const target = parseDaysTarget(days);

  if (!target) return true;

  const min = getCityDaysMin(c);
  const max = getCityDaysMax(c);

  if (min == null && max == null) return false;

  if (target >= 4) {
    if (max != null) return max >= 4;
    return min != null && min >= 4;
  }

  if (min != null && max != null) return min <= target && target <= max;
  if (min != null) return min <= target;
  if (max != null) return target <= max;

  return false;
}

async function getAllCitiesForSearch(region = 'all') {
  const key = region || 'all';

  if (allCityCache[key]) {
    return allCityCache[key];
  }

  const pickerRegionValue =
    key === 'all'
      ? 'all'
      : key === 'domestic'
      ? 'domestic'
      : key === 'abroad'
      ? 'abroad'
      : key;
  const pickerList = await fetchData(
    `/api/picker/list?region=${encodeURIComponent(pickerRegionValue)}&limit=1000`
  );
  const names = Array.isArray(pickerList)
    ? pickerList.map((c) => c.name).filter(Boolean)
    : [];

  let list = [];

  if (names.length) {
    const chunks = names.slice(0, 1000);
    list = await Promise.all(
      chunks.map((name) => fetchData(`/api/city?name=${encodeURIComponent(name)}`))
    );
    list = list.filter((item) => item && !Array.isArray(item));
  }

  if (!list.length) {
    const top = await fetchData(
      `/api/top30?region=${encodeURIComponent(pickerRegionValue)}`
    );
    list = Array.isArray(top) ? top : [];
  }

  allCityCache[key] = list;

  return list;
}

async function clientFallbackSearch({ baseCity, budget, days, selectedTags }) {
  const list = await getAllCitiesForSearch(currentRegion);
  let result = list.filter((c) => {
    return (
      cityMatchesBudget(c, budget) &&
      cityMatchesDays(c, days) &&
      cityMatchesTags(c, selectedTags)
    );
  });

  if (baseCity) {
    const baseCityData = await fetchData(
      `/api/city?name=${encodeURIComponent(baseCity)}`
    );

    if (baseCityData && !Array.isArray(baseCityData)) {
      const baseLat = Number(baseCityData.lat);
      const baseLng = Number(baseCityData.lng);

      if (Number.isFinite(baseLat) && Number.isFinite(baseLng)) {
        result = result
          .map((c) => {
            const lat = Number(c.lat);
            const lng = Number(c.lng);
            const distance =
              Number.isFinite(lat) && Number.isFinite(lng)
                ? km(baseLat, baseLng, lat, lng)
                : 999999;

            return { ...c, distance };
          })
          .filter((c) => c.name !== baseCityData.name)
          .sort((a, b) => {
            const distanceDiff = a.distance - b.distance;
            if (distanceDiff !== 0) return distanceDiff;

            const targetBudget = getNumber(budget);
            if (targetBudget) {
              const budgetDiff = getBudgetDiff(a, targetBudget) - getBudgetDiff(b, targetBudget);
              if (budgetDiff !== 0) return budgetDiff;
            }

            const targetDays = parseDaysTarget(days);
            if (targetDays) {
              const daysDiff = getDaysDiff(a, days) - getDaysDiff(b, days);
              if (daysDiff !== 0) return daysDiff;
            }

            return Number(b.score || 0) - Number(a.score || 0);
          });
      }
    }
  } else {
    const targetBudget = getNumber(budget);
    result = result.sort((a, b) => {
      if (targetBudget) {
        const diff = getBudgetDiff(a, targetBudget) - getBudgetDiff(b, targetBudget);
        if (diff !== 0) return diff;
      }

      const targetDays = parseDaysTarget(days);
      if (targetDays) {
        const daysDiff = getDaysDiff(a, days) - getDaysDiff(b, days);
        if (daysDiff !== 0) return daysDiff;
      }

      return Number(b.score || 0) - Number(a.score || 0);
    });
  }

  return result.slice(0, 30);
}

// ================================
// 7. 核心渲染
// ================================
function applyTitleStyle() {
  const pageTitle = document.getElementById('pageTitle');

  if (pageTitle) {
    pageTitle.style.color = '#f5e6a8';
    pageTitle.style.fontWeight = '900';
  }
}

function setHero(c, label) {
  const heroEl = document.getElementById('hero');

  if (!heroEl || !c) return;

  const scoreLabel = getCityScoreLabel(c);

  heroEl.innerHTML =
    scene(c) +
    `
        <div class="badges">
            <span class="badge gold" style="font-size:20px;padding:7px 18px !important;font-weight:900;letter-spacing:.5px;">${label}</span>
            ${scoreLabel ? `<span class="badge score-badge">🔥${esc(scoreLabel)}</span>` : ''}
        </div>
        ${renderMetricBadges(c)}
        <div class="intro">${esc(c.intro || `${c.name}的魅力远不止于此，更多精彩等你亲身体验。`)}</div>`;

  heroEl.onclick = () => openDetail(c.name);
}


function getSearchTitle() {
  if (currentRegion === 'domestic') return '搜索推荐国内城市';
  if (currentRegion === 'abroad') return '搜索推荐国外城市';
  return '搜索推荐城市';
}

function getCityDaysLabel(c) {
  const min = getCityDaysMin(c);
  const max = getCityDaysMax(c);

  if (min == null && max == null) return '';

  if (min != null && max != null) {
    if (min === max) return `${min}天`;
    if (max >= 4) return `${min}天起`;
    return `${min}-${max}天`;
  }

  if (min != null) return `${min}天起`;
  return `${max}天内`;
}

function getSelectedDaysBadgeLabel(filters) {
  const target = parseDaysTarget(filters?.days);

  if (!target) return '';

  return `${target}天起`;
}

function renderMetricBadges(c) {
  if (mode !== 'filter' || !c) return '';

  const filters = activeFilters || {};
  const items = [];

  if (filters.hasBaseCity) {
    const distance = getNumber(c.distance);

    if (distance != null && distance < 999999) {
      items.push(`约${distance}km`);
    }
  }

  if (filters.hasBudget) {
    const budget = getCityBudget(c);

    if (budget != null) {
      items.push(`约${budget}起`);
    } else if (filters.budget) {
      items.push(`约${filters.budget}起`);
    }
  }

  if (filters.hasDays) {
    const daysLabel = getSelectedDaysBadgeLabel(filters) || getCityDaysLabel(c);

    if (daysLabel) {
      items.push(daysLabel);
    }
  }

  if (!items.length) return '';

  return `
        <div class="metric-badges">
            ${items.map((item) => `<span class="metric-badge">${esc(item)}</span>`).join('')}
        </div>
    `;
}

function renderCards(list) {
  list = Array.isArray(list) ? list : [];

  const el = document.getElementById('cityGrid');

  if (!el) return;

  el.innerHTML = list.length
    ? list
        .map((c, i) => {
          const realRank = i + 1;
          const scoreLabel = getCityScoreLabel(c);

          return `
                <article class="card" data-city-name="${esc(c.name)}">
                    ${scene(c)}
                    <div class="badges">
                        <span class="badge gold" style="font-size:18px;padding:6px 15px !important;font-weight:900;letter-spacing:.3px;">TOP ${realRank}</span>
                        ${scoreLabel ? `<span class="badge score-badge">🔥${esc(scoreLabel)}</span>` : ''}
                    </div>
                    ${renderMetricBadges(c)}
                    <div class="card-desc">${esc(oneLine(c))}</div>
                </article>
            `;
        })
        .join('')
    : `<div class="empty">暂无数据</div>`;
}

function showList(title, list, label) {
  list = Array.isArray(list) ? list : [];

  const pageTitle = document.getElementById('pageTitle');
  const listTitle = document.getElementById('listTitle');
  const heroEl = document.getElementById('hero');

  if (pageTitle) pageTitle.textContent = title;
  if (listTitle) listTitle.innerHTML = title;

  applyTitleStyle();

  document.body.classList.toggle('noHero', !list.length);

  if (list.length && heroEl) {
    heroEl.style.display = 'block';
    setHero(list[0], label || `TOP ${list[0].monthRank || 1}`);
  } else if (heroEl) {
    heroEl.innerHTML = '';
    heroEl.style.display = 'none';
  }

  renderCards(list);
}

function bindCityGridClick() {
  const grid = document.getElementById('cityGrid');

  if (!grid || grid._cityClickBound) return;

  grid._cityClickBound = true;

  grid.addEventListener('click', function (e) {
    const card = e.target.closest('[data-city-name]');

    if (!card || !grid.contains(card)) return;

    const name = card.getAttribute('data-city-name');

    if (name) {
      openDetail(name);
    }
  });
}

// ================================
// 8. 首页 / 搜索 / 地区
// ================================
function setHeaderRegionActive(region) {
  document.querySelectorAll('#headerHome .tab').forEach((x) => {
    x.classList.toggle('active', x.dataset.r === region);
  });
}

function readSearchInputs() {
  const baseCity = (document.getElementById('baseCityInput')?.value || '').trim();
  const budgetRaw = (document.getElementById('budgetInput')?.value || '').trim();
  const budget = getNumber(budgetRaw);
  const days = document.getElementById('daysInput')?.value || '';
  const selectedTags = [...document.querySelectorAll('.chip.active')]
    .map((x) => x.textContent.trim())
    .filter(Boolean);

  return {
    baseCity,
    budget: budget || 0,
    budgetRaw,
    days,
    selectedTags,
    hasBaseCity: !!baseCity,
    hasBudget: budget != null && budget > 0,
    hasDays: !!parseDaysTarget(days),
    hasTags: selectedTags.length > 0,
  };
}

function hasSearchCondition(filters) {
  return !!(filters && (filters.hasBaseCity || filters.hasBudget || filters.hasDays || filters.hasTags));
}

function attachDistanceToList(list, baseCityData) {
  if (!Array.isArray(list) || !baseCityData) return Array.isArray(list) ? list : [];

  const baseLat = Number(baseCityData.lat);
  const baseLng = Number(baseCityData.lng);

  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return list;

  return list
    .map((c) => {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      const distance = Number.isFinite(lat) && Number.isFinite(lng)
        ? km(baseLat, baseLng, lat, lng)
        : getNumber(c.distance) ?? 999999;

      return { ...c, distance };
    })
    .filter((c) => c.name !== baseCityData.name)
    .sort((a, b) => {
      const distanceDiff = (getNumber(a.distance) ?? 999999) - (getNumber(b.distance) ?? 999999);
      if (distanceDiff !== 0) return distanceDiff;

      const filters = activeFilters || {};
      if (filters.hasBudget) {
        const budgetDiff = getBudgetDiff(a, filters.budget) - getBudgetDiff(b, filters.budget);
        if (budgetDiff !== 0) return budgetDiff;
      }

      if (filters.hasDays) {
        const daysDiff = getDaysDiff(a, filters.days) - getDaysDiff(b, filters.days);
        if (daysDiff !== 0) return daysDiff;
      }

      return Number(b.score || 0) - Number(a.score || 0);
    });
}

async function triggerSearch(keepRegion = false) {
  showThinking();

  await delay(120);

  try {
    const filters = readSearchInputs();

    if (!keepRegion) {
      currentRegion = 'all';
      setHeaderRegionActive('all');
    }

    mode = 'filter';
    activeFilters = {
      ...filters,
      region: currentRegion,
    };

    let data = [];

    if (filters.hasBaseCity) {
      const baseCityData = await fetchData(
        `/api/city?name=${encodeURIComponent(filters.baseCity)}`
      );

      if (!baseCityData || Array.isArray(baseCityData)) {
        toast('出发城市未找到');
        return;
      }

      const params = new URLSearchParams({
        city: baseCityData.name || filters.baseCity,
        city_id: baseCityData.id || '',
        lat: baseCityData.lat,
        lng: baseCityData.lng,
        region: currentRegion,
        budget: filters.hasBudget ? filters.budget : '',
        days: filters.hasDays ? filters.days : '',
        tags: filters.selectedTags.join(','),
      });

      data = await fetchData(`/api/search/full?${params.toString()}`);

      if (!Array.isArray(data) || !data.length) {
        data = await clientFallbackSearch({
          baseCity: filters.baseCity,
          budget: filters.hasBudget ? filters.budget : '',
          days: filters.hasDays ? filters.days : '',
          selectedTags: filters.selectedTags,
        });
      }

      data = attachDistanceToList(Array.isArray(data) ? data : [], baseCityData);

      showList(getSearchTitle(), data, '距离最近');
    } else {
      const params = new URLSearchParams({
        region: currentRegion,
        budget: filters.hasBudget ? filters.budget : '',
        days: filters.hasDays ? filters.days : '',
        tags: filters.selectedTags.join(','),
      });

      data = await fetchData(`/api/search/filter?${params.toString()}`);

      if (!Array.isArray(data) || !data.length) {
        data = await clientFallbackSearch({
          baseCity: '',
          budget: filters.hasBudget ? filters.budget : '',
          days: filters.hasDays ? filters.days : '',
          selectedTags: filters.selectedTags,
        });
      }

      showList(getSearchTitle(), Array.isArray(data) ? data : [], '匹配成功');
    }

    if (!Array.isArray(data) || !data.length) {
      toast('没有找到匹配城市');
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  } finally {
    hideThinking();
  }
}

async function goHome() {
  mode = 'home';
  currentRegion = 'all';
  activeFilters = null;

  const homeWrap = document.getElementById('homeWrap');
  const detail = document.getElementById('detail');
  const headerHome = document.getElementById('headerHome');
  const headerDetail = document.getElementById('headerDetail');

  if (detail) detail.style.display = 'none';
  if (homeWrap) homeWrap.style.display = 'grid';
  if (headerHome) headerHome.style.display = 'flex';
  if (headerDetail) headerDetail.style.display = 'none';

  setHeaderRegionActive('all');

  const data = await fetchData('/api/top30?region=all');
  const list = Array.isArray(data) ? data : [];

  showList(`${getCurrentMonthLabel()}全部热门城市TOP30`, list, 'TOP 1');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function setRegion(r, el) {
  currentRegion = r;

  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));

  if (el) {
    el.classList.add('active');
  }

  if (mode === 'filter') {
    await triggerSearch(true);
    return;
  }

  const monthLabel = getCurrentMonthLabel();
  const regionTitle = r === 'all' ? '全部' : r === 'domestic' ? '国内' : '国外';
  const data = await fetchData(`/api/top30?region=${r}`);

  showList(
    `${monthLabel}${regionTitle}热门城市TOP30`,
    Array.isArray(data) ? data : []
  );

  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function keywordSearch(v) {
  v = (v || '').trim();

  if (!v) return goHome();

  const baseCityInput = document.getElementById('baseCityInput');

  if (baseCityInput) {
    baseCityInput.value = v;
  }

  await triggerSearch();
}

// ================================
// 9. 城市选择器
// ================================
async function openPicker(target = 'base') {
  pickerTarget = target;

  const picker = document.getElementById('picker');
  const pickerInput = document.getElementById('pickerInput');

  if (picker) picker.classList.add('show');
  if (pickerInput) pickerInput.value = '';

  await renderPicker('');

  setTimeout(() => {
    const input = document.getElementById('pickerInput');
    if (input) input.focus();
  }, 30);
}

function closePicker() {
  const picker = document.getElementById('picker');

  if (picker) {
    picker.classList.remove('show');
  }
}

window.switchPickerRegion = function (region, btn) {
  pickerRegion = region === 'domestic' ? '国内' : '国外';

  document.querySelectorAll('.picker-tabs .tab-btn').forEach((b) =>
    b.classList.remove('active')
  );

  if (btn) {
    btn.classList.add('active');
  }

  renderPicker(document.getElementById('pickerInput')?.value || '');
};

async function renderPicker(keyword = '') {
  const body = document.getElementById('pickerBody');

  if (!body) return;

  const params = new URLSearchParams({
    region: pickerRegion,
    keyword: keyword,
  });

  const list = await fetchData(`/api/picker/list?${params.toString()}`);

  body.innerHTML = '';

  if (!list || list.length === 0) {
    body.innerHTML =
      `<div style="padding:40px;text-align:center;opacity:0.6">未找到匹配城市</div>`;
    return;
  }

  const groups = {};

  list.forEach((city) => {
    const letter = (city.pinyin || '#')[0].toUpperCase();

    if (!groups[letter]) {
      groups[letter] = [];
    }

    groups[letter].push(city);
  });

  let html = '';

  Object.keys(groups)
    .sort()
    .forEach((letter) => {
      html +=
        `<div class="letter">${esc(letter)}</div><div class="city-pills">`;

      groups[letter].forEach((c) => {
        html +=
          `<button type="button" class="city-pill" data-picker-city="${esc(c.name)}">${esc(c.name)}</button>`;
      });

      html += `</div>`;
    });

  body.innerHTML = html;
}

function bindPickerClick() {
  const body = document.getElementById('pickerBody');

  if (!body || body._pickerClickBound) return;

  body._pickerClickBound = true;

  body.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-picker-city]');

    if (!btn || !body.contains(btn)) return;

    const name = btn.getAttribute('data-picker-city');

    if (name) {
      chooseCity(name);
    }
  });
}

function chooseCity(name) {
  const commentText = document.getElementById('commentText');

  if (commentText) {
    commentText.placeholder = '';
    ensureCommentCloseButton();
  }

  const baseCityInput = document.getElementById('baseCityInput');
  const clearCityBtn = document.getElementById('clearCityBtn');

  if (baseCityInput) {
    baseCityInput.value = name;
    baseCityInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (clearCityBtn) {
    clearCityBtn.style.display = 'flex';
  }

  closePicker();
  toast(`已选择出发城市：${name}`);
}

function clearBaseCity() {
  const commentText = document.getElementById('commentText');

  if (commentText) {
    commentText.placeholder = '';
    ensureCommentCloseButton();
  }

  const baseCityInput = document.getElementById('baseCityInput');
  const clearCityBtn = document.getElementById('clearCityBtn');

  if (baseCityInput) baseCityInput.value = '';
  if (clearCityBtn) clearCityBtn.style.display = 'none';

  triggerSearch();
}

// ================================
// 10. 详情页
// ================================
function escapeRawNewlinesInsideJsonStrings(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString && ch === '\n') {
      out += '\\n';
      continue;
    }

    if (inString && ch === '\r') {
      continue;
    }

    out += ch;
  }

  return out;
}

function addMissingCommasBetweenJsonObjects(source) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (!inString && ch === '}') {
      out += ch;

      let j = i + 1;
      let spaces = '';

      while (j < source.length && /\s/.test(source[j])) {
        spaces += source[j];
        j++;
      }

      if (source[j] === '{') {
        out += spaces + ',';
        i = j - 1;
        continue;
      }

      continue;
    }

    out += ch;
  }

  return out;
}

function normalizeBudgetPlansJsonText(value) {
  let text = String(value ?? '').trim();

  if (!text) return '';

  text = text
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  text = escapeRawNewlinesInsideJsonStrings(text);
  text = addMissingCommasBetweenJsonObjects(text);

  text = text
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}');

  return text;
}

function extractJsonObjectTexts(source) {
  const text = String(source || '');
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function isBadPlanText(value) {
  const text = normalizeText(value);

  if (!text) return true;
  if (/^(null|undefined)$/i.test(text)) return true;
  if (/�{2,}|\?{6,}/.test(text)) return true;

  return false;
}

function cleanPlanText(value) {
  return normalizeText(value)
    .replace(/[ \t]*\\[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s,，;；。]+/g, '')
    .trim();
}

function looksLikeJsonPlanBlob(value) {
  const text = String(value || '').trim();

  if (!text) return false;

  return /^[\[{]/.test(text) || (/[{}[\]]/.test(text) && /"(name|title|text|content|desc|description|detail)"/.test(text));
}

function parseBudgetPlansLoose(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return [value];
  }

  const raw = String(value).trim();

  if (!raw) return [];

  const tryList = [
    raw,
    normalizeBudgetPlansJsonText(raw),
  ];

  for (const item of tryList) {
    try {
      const parsed = JSON.parse(item);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (parsed && typeof parsed === 'object') {
        return [parsed];
      }

      if (typeof parsed === 'string' && parsed !== raw) {
        const nested = parseBudgetPlansLoose(parsed);
        if (nested.length) return nested;
      }
    } catch (e) {}
  }

  const fallback = [];
  const normalized = normalizeBudgetPlansJsonText(raw);
  const objectTexts = extractJsonObjectTexts(normalized);

  objectTexts.forEach((objectText) => {
    const candidates = [objectText, normalizeBudgetPlansJsonText(objectText)];

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') {
          fallback.push(parsed);
          return;
        }
      } catch (e) {}
    }

    const nameMatch = objectText.match(/"(?:name|title|plan_name)"\s*:\s*"([\s\S]*?)"/);
    const textMatch = objectText.match(/"(?:text|content|desc|description|detail)"\s*:\s*"([\s\S]*?)"/);

    if (nameMatch || textMatch) {
      fallback.push({
        name: nameMatch ? nameMatch[1] : '',
        text: textMatch ? textMatch[1] : '',
      });
    }
  });

  if (fallback.length) {
    return fallback;
  }

  const reg =
    /"(?:name|title|plan_name)"\s*:\s*"([^"]*)"\s*,\s*"(?:text|content|desc|description|detail)"\s*:\s*"([\s\S]*?)"\s*(?:\}|,)/g;

  let match;

  while ((match = reg.exec(normalized)) !== null) {
    fallback.push({
      name: match[1],
      text: match[2],
    });
  }

  return fallback;
}

function budgetHTML(c) {
  const budgetPlans =
    c.budgetPlans || c.budget_plans || c.budget_plan || c.plan || c.plans || '';

  const parsed = parseBudgetPlansLoose(budgetPlans);

  if (Array.isArray(parsed) && parsed.length) {
    const html = parsed
      .map((item, index) => {
        const title =
          item.name ||
          item.title ||
          item.plan_name ||
          item.方案 ||
          `方案${index + 1}`;

        const text =
          item.text ||
          item.content ||
          item.desc ||
          item.description ||
          item.detail ||
          '';

        const cleanTitle = cleanPlanText(title);
        const cleanText = cleanPlanText(text);

        if (isBadPlanText(cleanTitle) && isBadPlanText(cleanText)) {
          return '';
        }

        return `
            <div class="budget-item">
                <b>${esc(isBadPlanText(cleanTitle) ? `方案${index + 1}` : cleanTitle)}</b>
                ${isBadPlanText(cleanText) ? '' : `<div style="white-space:pre-wrap;">${esc(cleanText)}</div>`}
            </div>
        `;
      })
      .filter(Boolean)
      .join('');

    if (html) return html;
  }

  const text = cleanPlanText(budgetPlans);

  if (text && !looksLikeJsonPlanBlob(text) && !isBadPlanText(text)) {
    return `<div class="budget-item" style="white-space:pre-wrap;">${esc(text)}</div>`;
  }

  return `<div class="budget-item">暂无具体方案。</div>`;
}

async function openDetail(n) {
  previousScroll = window.scrollY;

  const c = await fetchData(`/api/city?name=${encodeURIComponent(n)}`);

  if (!c || Array.isArray(c)) {
    toast('未找到该城市');
    return;
  }

  if (!c.intro && !c.detail_intro)
    c.intro = `${c.name}是一座拥有独特魅力的城市，期待您的探索。`;
  if (!c.food) c.food = '当地特色美食';
  if (!c.highlights || c.highlights.length === 0)
    c.highlights = ['城市地标', '历史街区', '特色美食'];
  if (!c.score) c.score = 8.0;
  if (!c.budget) c.budget = 1500;

  currentCity = c;
  resetCommentEditor();

  const headerHome = document.getElementById('headerHome');
  const headerDetail = document.getElementById('headerDetail');
  const homeWrap = document.getElementById('homeWrap');
  const detail = document.getElementById('detail');
  const dHero = document.getElementById('dHero');
  const dIntro = document.getElementById('dIntro');
  const dBudget = document.getElementById('dBudget');

  if (headerHome) headerHome.style.display = 'none';
  if (headerDetail) headerDetail.style.display = 'flex';
  if (homeWrap) homeWrap.style.display = 'none';
  if (detail) detail.style.display = 'block';

  forceScrollTop();

  if (dHero) dHero.innerHTML = scene(c);
  if (dIntro) dIntro.textContent = normalizeText(c.detail_intro || c.intro);
  if (dBudget) dBudget.innerHTML = budgetHTML(c);

  const dSpots = document.getElementById('dSpots');

  if (dSpots) {
    const attractionData = await fetchData(
      `/api/city/attractions?name=${encodeURIComponent(c.name)}`
    );
    const attractionList = Array.isArray(attractionData) ? attractionData : [];
    let rawSpots = splitItems(c.highlights).slice(0, 6);

    if (!rawSpots.length) {
      rawSpots = ['城市地标', '历史街区', '特色美食'];
    }

    const displaySpots = attractionList.length
      ? attractionList.slice(0, 6).map((item) => ({
          name: item.name || '推荐景点',
          image: getAttractionImage(item),
          desc: item.search_override || item.description || item.intro || '',
        }))
      : rawSpots.map((name) => ({
          name,
          image: '',
          desc: '',
        }));

    dSpots.innerHTML = `
            <div class="grid">
                ${displaySpots
                  .map(
                    (item) => `
                    <div class="card" style="height:160px;">
                        <div class="scene" style='${bgStyle(item.image)}'>
                            <div style="
                                position:absolute;
                                left:16px;
                                right:16px;
                                bottom:16px;
                                top:auto;
                                transform:none !important;
                                color:#fff;
                                font-size:20px;
                                font-weight:700;
                                line-height:1.3;
                                letter-spacing:0;
                                white-space:nowrap;
                                overflow:hidden;
                                text-overflow:ellipsis;
                                text-shadow:0 2px 10px rgba(0,0,0,.65);
                            ">
                                ${esc(item.name)}
                            </div>
                        </div>
                    </div>
                `
                  )
                  .join('')}
            </div>
        `;
  }

  const dFood = document.getElementById('dFood');

  if (dFood) {
    dFood.innerHTML = splitItems(c.food)
      .map((x) => `<span>${esc(x)}</span>`)
      .join('');
  }

  const dTransport = document.getElementById('dTransport');

  if (dTransport) {
    dTransport.innerHTML =
      `<div style="white-space:pre-wrap;">${esc(
        normalizeText(c.transport_tips || c.transport || '暂无详细交通建议。')
      )}</div>`;
  }

  const dStay = document.getElementById('dStay');

  if (dStay) {
    dStay.innerHTML =
      `<div style="white-space:pre-wrap;">${esc(
        normalizeText(c.stay_tips || c.stay || '暂无详细住宿建议。')
      )}</div>`;
  }

  forceScrollTop();
  requestAnimationFrame(forceScrollTop);

  await loadComments(c.name, 'hot');

  requestAnimationFrame(forceScrollTop);
}

function backToList() {
  const detail = document.getElementById('detail');
  const homeWrap = document.getElementById('homeWrap');
  const headerHome = document.getElementById('headerHome');
  const headerDetail = document.getElementById('headerDetail');

  if (detail) detail.style.display = 'none';
  if (homeWrap) homeWrap.style.display = 'grid';
  if (headerHome) headerHome.style.display = 'flex';
  if (headerDetail) headerDetail.style.display = 'none';

  setTimeout(() => {
    window.scrollTo({ top: previousScroll || 0, behavior: 'instant' });
  }, 0);
}


// ================================
// 11. 评论系统
// ================================

function ensureCommentCloseButton() {
  const textEl = document.getElementById('commentText');
  const form = textEl?.closest('.comment-form');

  if (!form || form.querySelector('.comment-editor-close')) return;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'comment-editor-close';
  closeBtn.textContent = '关闭打字框';
  closeBtn.onclick = resetCommentEditor;

  if (textEl && textEl.nextSibling) {
    form.insertBefore(closeBtn, textEl.nextSibling);
  } else {
    form.appendChild(closeBtn);
  }
}

function resetCommentEditor() {
  const textEl = document.getElementById('commentText');
  const form = textEl?.closest('.comment-form');
  const submitBtn = form?.querySelector('button:not(.comment-editor-close)');

  if (textEl) textEl.value = '';
  if (form) form.classList.remove('editing');
  if (submitBtn) submitBtn.textContent = '发布评价';

  const closeBtn = form?.querySelector('.comment-editor-close');
  if (closeBtn) closeBtn.style.display = 'none';
}

function commentDomKey(commentId, source = '') {
  return `${String(source || 'comment').replace(/[^a-zA-Z0-9_-]/g, '_')}-${String(commentId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function currentUserQuery() {
  if (!currentUser) return '';

  const params = new URLSearchParams();

  if (currentUser.id) params.set('user_id', currentUser.id);
  if (currentUser.phone) params.set('phone', currentUser.phone);

  const text = params.toString();

  return text ? `&${text}` : '';
}

function commentAvatar(comment) {
  return normalizeImageUrl(comment.avatar_url || comment.avatar || DEFAULT_AVATAR);
}

function buildReplyTree(replies) {
  const list = Array.isArray(replies) ? replies : [];
  const byParent = {};

  list.forEach((reply) => {
    const parent = String(reply.parent_reply_id || reply.parent_id || '');

    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(reply);
  });

  return byParent;
}

function renderReplyList(comment, parentKey = '') {
  const byParent = buildReplyTree(comment.replies || []);
  const source = comment.source || '';
  const domKey = commentDomKey(comment.id, source);

  function renderLevel(key) {
    const replies = byParent[String(key || '')] || [];

    if (!replies.length) return '';

    return `
      <div class="reply-list">
        ${replies.map((reply) => {
          const replyId = reply.id || '';
          const replyKey = String(replyId || '');
          const replyDomKey = `${domKey}-${String(replyId || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const fromName = reply.from_username || reply.username || reply.from || '用户';
          const toName = reply.to_username || reply.to || '';
          const fromAvatar = normalizeImageUrl(reply.from_avatar || reply.avatar_url || reply.avatar || DEFAULT_AVATAR);
          const time = formatTime(reply.created_at || reply.time || '');

          return `
            <div class="reply-item" id="reply-${esc(replyDomKey)}">
              <div class="comment-head-row">
                <img class="comment-avatar-img" src="${esc(fromAvatar)}">
                <div class="comment-user-line">
                  <b>${esc(fromName)}${toName ? ` 回复 ${esc(toName)}` : ''}</b>
                  <span class="comment-time">${esc(time)}</span>
                </div>
              </div>
              <p>${esc(reply.content || '')}</p>
              <div class="comment-actions-row">
                <button type="button" class="reply-action-btn" data-reply-comment="${esc(comment.id)}" data-reply-parent="${esc(replyId)}" data-reply-to="${esc(reply.from_user_id || reply.user_id || '')}" data-reply-source="${esc(source)}">回复</button>
              </div>
              <div id="replyBox-${esc(replyDomKey)}"></div>
              ${renderLevel(replyKey)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return renderLevel(parentKey);
}

function toggleReplyBox(commentId, parentReplyId = '', toUserId = '', source = '') {
  if (!currentUser) {
    openLogin('login');
    return;
  }

  const boxId = parentReplyId
    ? `replyBox-${commentDomKey(commentId, source)}-${String(parentReplyId).replace(/[^a-zA-Z0-9_-]/g, '_')}`
    : `replyBox-${commentDomKey(commentId, source)}`;
  const box = document.getElementById(boxId);

  if (!box) return;

  if (box.innerHTML.trim()) {
    box.innerHTML = '';
    return;
  }

  const inputId = `replyInput-${boxId}`;

  box.innerHTML = `
    <div class="reply-editor">
      <input id="${esc(inputId)}" placeholder="写下回复...">
      <button onclick="postReply(${jsArg(commentId)}, ${jsArg(parentReplyId || '')}, ${jsArg(toUserId || '')}, ${jsArg(source)}, ${jsArg(inputId)})">发送回复</button>
    </div>
  `;

  setTimeout(() => {
    const input = document.getElementById(inputId);
    if (input) input.focus();
  }, 0);
}

async function postReply(commentId, parentReplyId = '', toUserId = '', source = '', inputId = '') {
  if (!currentUser) {
    openLogin('login');
    return;
  }

  const input = document.getElementById(inputId || `replyInput-replyBox-${commentDomKey(commentId, source)}`);
  const content = (input?.value || '').trim();

  if (!content) {
    toast('请输入回复内容');
    return;
  }

  const result = await postJSON('/api/comments/reply', {
    user_id: currentUser.id,
    phone: currentUser.phone,
    comment_id: commentId,
    parent_reply_id: parentReplyId || null,
    to_user_id: toUserId || null,
    source,
    content
  });

  if (result && result.ok) {
    toast('回复成功');
    await loadComments(currentCity.name, currentCommentSort);
  } else {
    toast(result?.error || '回复失败');
  }
}

function resetCommentScroll() {
  const container = document.getElementById('commentList');
  const commentsPanel = container?.closest('.comments');

  if (container) container.scrollTop = 0;
  if (commentsPanel) commentsPanel.scrollTop = 0;
}


function bindCommentActions() {
  const container = document.getElementById('commentList');

  if (!container || container._commentActionsBound) return;

  container._commentActionsBound = true;

  container.addEventListener('click', function (e) {
    const likeBtn = e.target.closest('[data-like-comment]');

    if (likeBtn && container.contains(likeBtn)) {
      e.preventDefault();
      e.stopPropagation();
      likeComment(
        likeBtn.getAttribute('data-like-comment') || '',
        likeBtn.getAttribute('data-like-source') || '',
        likeBtn
      );
      return;
    }

    const replyBtn = e.target.closest('[data-reply-comment]');

    if (replyBtn && container.contains(replyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      toggleReplyBox(
        replyBtn.getAttribute('data-reply-comment') || '',
        replyBtn.getAttribute('data-reply-parent') || '',
        replyBtn.getAttribute('data-reply-to') || '',
        replyBtn.getAttribute('data-reply-source') || ''
      );
    }
  });
}


async function loadComments(cityName, sortType = 'hot') {
  const container = document.getElementById('commentList');

  if (!container) return;

  currentCommentSort = sortType;

  const data = await fetchData(
    `/api/comments?city=${encodeURIComponent(cityName)}&sort=${sortType}${currentUserQuery()}`
  );
  const comments = Array.isArray(data) ? data : [];

  container.innerHTML = comments.length
    ? comments
        .map((comment) => {
          const likes = comment.likes ?? comment.like_count ?? 0;
          const time = comment.created_at || comment.time || comment.createdAt || '';
          const liked = Boolean(comment.liked_by_me);
          const avatar = commentAvatar(comment);
          const userName = comment.username || comment.nickname || comment.phone || '游客';
          const userId = comment.user_id || '';
          const source = comment.source || '';
          const domKey = commentDomKey(comment.id, source);

          return `
                <div class="comment-item" id="comment-${esc(domKey)}">
                    <div class="comment-head-row">
                        <img class="comment-avatar-img" src="${esc(avatar)}">
                        <div class="comment-user-line">
                            <b>${esc(userName)}</b>
                            <span class="comment-time">${esc(formatTime(time))}</span>
                        </div>
                    </div>
                    <p>${esc(comment.content || '')}</p>
                    <div class="comment-actions-row">
                        <button type="button" class="emoji-like-btn ${liked ? 'liked' : ''}" data-like-comment="${esc(comment.id)}" data-like-source="${esc(source)}" data-liked="${liked ? '1' : '0'}"><span class="thumb">👍</span><span class="like-count">${esc(likes)}</span></button>
                        <button type="button" class="reply-action-btn" data-reply-comment="${esc(comment.id)}" data-reply-parent="" data-reply-to="${esc(userId)}" data-reply-source="${esc(source)}">回复</button>
                    </div>
                    <div id="replyBox-${esc(domKey)}"></div>
                    ${renderReplyList(comment, '')}
                </div>
            `;
        })
        .join('')
    : `<div class="comment-item"><p>暂无评论</p></div>`;

  resetCommentScroll();
  requestAnimationFrame(resetCommentScroll);
}

async function switchSort(sortType, btn) {
  document.querySelectorAll('.sorts button').forEach((b) =>
    b.classList.remove('active')
  );

  if (btn) {
    btn.classList.add('active');
  }

  if (currentCity && currentCity.name) {
    await loadComments(currentCity.name, sortType);
    resetCommentScroll();
  }
}

async function postComment() {
  if (!currentUser) {
    openLogin('login');
    return;
  }

  ensureCommentCloseButton();

  const textEl = document.getElementById('commentText');
  const form = textEl?.closest('.comment-form');
  const btn = form?.querySelector('button:not(.comment-editor-close)');
  const closeBtn = form?.querySelector('.comment-editor-close');

  if (form && !form.classList.contains('editing')) {
    form.classList.add('editing');
    if (btn) btn.textContent = '发送评价';
    if (closeBtn) closeBtn.style.display = 'block';
    setTimeout(() => textEl && textEl.focus(), 0);
    return;
  }

  const content = (textEl?.value || '').trim();

  if (!content) {
    toast('请输入评论内容');
    return;
  }

  const result = await postJSON('/api/comments', {
    user_id: currentUser.id,
    phone: currentUser.phone,
    city_name: currentCity?.name || '',
    content: content,
  });

  if (result && result.ok) {
    resetCommentEditor();
    toast('评论发布成功');
    await loadComments(currentCity.name, 'new');
  } else {
    toast(result?.error || '评论发布失败');
  }
}

async function likeComment(commentId, source = '', btn = null) {
  if (!currentUser) {
    openLogin('login');
    return;
  }

  if (!commentId) return;

  const targetBtn = btn || window.event?.currentTarget || null;
  const wasLiked = Boolean(targetBtn?.classList.contains('liked'));

  if (targetBtn) {
    targetBtn.disabled = true;
  }

  const result = await postJSON('/api/comments/like', {
    user_id: currentUser.id,
    phone: currentUser.phone,
    comment_id: commentId,
    source,
    currently_liked: wasLiked
  });

  if (result && result.ok) {
    const liked = Boolean(result.liked);
    const countEl = targetBtn?.querySelector('.like-count');
    const oldCount = Number(countEl?.textContent || 0);
    const nextCount = Number.isFinite(Number(result.like_count))
      ? Number(result.like_count)
      : Math.max(0, oldCount + (liked ? 1 : -1));

    if (targetBtn) {
      targetBtn.classList.toggle('liked', liked);
      targetBtn.setAttribute('data-liked', liked ? '1' : '0');
    }

    if (countEl) {
      countEl.textContent = String(nextCount);
    }
  } else {
    toast(result?.error || '点赞失败');
  }

  if (targetBtn) {
    targetBtn.disabled = false;
  }
}

// ================================
// 12. 登录系统// ================================
// 12. 登录系统
// ================================
function loadUserFromStorage() {
  try {
    currentUser = JSON.parse(localStorage.getItem(USER_STORE_KEY) || 'null');
  } catch (e) {
    currentUser = null;
  }
}

function saveCurrentUser() {
  if (currentUser) {
    localStorage.setItem(USER_STORE_KEY, JSON.stringify(currentUser));
  } else {
    localStorage.removeItem(USER_STORE_KEY);
  }
}

function openLogin(type) {
  const triggerId = window.event?.target?.id;

  if (!type) {
    if (triggerId === 'regBtn' || triggerId === 'regBtnD') {
      type = 'register';
    } else {
      type = 'login';
    }
  }

  const modal = document.getElementById('loginModal');

  if (!modal) return;

  modal.innerHTML = `
        <div class="loginbox">
            <h2>${type === 'login' ? '登录' : '注册'}</h2>

            <input id="loginUser" type="tel" inputmode="tel" placeholder="手机号">
            <input id="loginPass" type="password" placeholder="密码">

            <button class="primary" onclick="${type === 'login' ? 'doLogin()' : 'doRegister()'}">
                ${type === 'login' ? '登录' : '注册'}
            </button>

            <button class="secondary" onclick="closeLogin()">
                ${type === 'login' ? '暂不登录，继续浏览' : '暂不注册，继续浏览'}
            </button>
        </div>
    `;

  modal.classList.add('show');
}

function closeLogin() {
  const modal = document.getElementById('loginModal');

  if (modal) {
    modal.classList.remove('show');
  }
}

function closeProfile() {
  const modal = document.getElementById('profileModal');

  if (modal) {
    modal.classList.remove('show');
  }
}

document.addEventListener('click', (e) => {
  const loginModal = document.getElementById('loginModal');
  const profileModal = document.getElementById('profileModal');

  if (e.target === loginModal) closeLogin();
  if (e.target === profileModal) closeProfile();
});

async function doLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value.trim();

  if (!user || !pass) return toast('请输入手机号和密码');
  if (!isValidPhone(user)) return toast('请输入正确手机号');

  const result = await postJSON('/api/auth/login', {
    phone: user,
    password: pass,
  });

  if (result && result.ok && result.user) {
    currentUser = result.user;
    saveCurrentUser();
    closeLogin();
    updateUIForLogin();
    toast('登录成功');
  } else {
    toast(result?.error || '手机号或密码错误');
  }
}

async function doRegister() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value.trim();

  if (!user || !pass) return toast('请输入手机号和密码');
  if (!isValidPhone(user)) return toast('请输入正确手机号');

  const result = await postJSON('/api/auth/register', {
    phone: user,
    password: pass,
    nickname: user,
  });

  if (result && result.ok && result.user) {
    currentUser = result.user;
    saveCurrentUser();
    closeLogin();
    updateUIForLogin();
    toast('注册成功');
  } else {
    toast(result?.error || '注册失败');
  }
}

function changeAvatarFromFile(input) {
  if (!currentUser) return;

  const file = input.files && input.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = async function (e) {
    const avatarUrl = e.target.result;

    const result = await postJSON('/api/profile/avatar', {
      user_id: currentUser.id,
      phone: currentUser.phone,
      avatar_url: avatarUrl,
    });

    if (result && result.ok && result.user) {
      currentUser = result.user;
      saveCurrentUser();
      updateUIForLogin();
      openProfile();
      toast('头像已更新');
    } else {
      toast(result?.error || '头像更新失败');
    }
  };

  reader.readAsDataURL(file);
}

async function openProfile() {
  if (!currentUser) {
    openLogin('login');
    return;
  }

  const modal = document.getElementById('profileModal');

  if (!modal) return;

  const result = await fetchData(
    `/api/profile?user_id=${encodeURIComponent(
      currentUser.id || ''
    )}&phone=${encodeURIComponent(currentUser.phone || '')}`
  );
  const user = result?.user || currentUser;
  const comments = Array.isArray(user.comments) ? user.comments : [];
  const likes = Array.isArray(user.likes) ? user.likes : [];
  const replies = Array.isArray(user.replies) ? user.replies : [];

  modal.innerHTML = `
        <div class="loginbox" style="width:min(820px,92vw);max-height:86vh;overflow:auto;padding:30px;border-radius:26px;background:#151a28;border:1px solid rgba(245,211,130,.22);box-shadow:0 28px 80px rgba(0,0,0,.58);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);">
                <div style="display:flex;align-items:center;gap:18px;min-width:0;">
                    <div style="position:relative;flex:0 0 auto;">
                        <img src="${esc(user.avatar_url || user.avatar || DEFAULT_AVATAR)}" style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:2px solid rgba(245,211,130,.75);display:block;box-shadow:0 12px 30px rgba(0,0,0,.35);">
                        <button onclick="document.getElementById('avatarInput').click()" style="position:absolute;right:-6px;bottom:-6px;width:30px;height:30px;border:1px solid rgba(255,255,255,.2);border-radius:50%;padding:0;background:linear-gradient(135deg,#f6e58d,#e8b96b);color:#111;font-size:13px;font-weight:900;line-height:30px;text-align:center;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.35);">改</button>
                        <input id="avatarInput" type="file" accept="image/*" style="display:none" onchange="changeAvatarFromFile(this)">
                    </div>

                    <div style="min-width:0;">
                        <h2 style="margin:0 0 8px;font-size:28px;color:#f6f1df;">个人主页</h2>
                        <div style="opacity:.78;font-size:15px;word-break:break-all;">手机号：${esc(user.phone || user.username || '')}</div>
                        <div style="opacity:.45;font-size:13px;margin-top:6px;">点击头像右下角“改”可更换头像</div>
                    </div>
                </div>

                <button class="secondary" onclick="closeProfile()" style="width:auto;height:auto;margin-top:0;padding:10px 18px;border-radius:14px;flex:0 0 auto;">关闭</button>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px;">
                <div style="padding:18px 20px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.04);">
                    <div style="font-size:30px;font-weight:900;color:#f5d382;line-height:1;">${comments.length}</div>
                    <div style="opacity:.75;margin-top:10px;">发布评论</div>
                </div>

                <div style="padding:18px 20px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.04);">
                    <div style="font-size:30px;font-weight:900;color:#f5d382;line-height:1;">${likes.length}</div>
                    <div style="opacity:.75;margin-top:10px;">点赞数</div>
                </div>

                <div style="padding:18px 20px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.04);">
                    <div style="font-size:30px;font-weight:900;color:#f5d382;line-height:1;">${replies.length}</div>
                    <div style="opacity:.75;margin-top:10px;">收到回复</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <section style="border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;background:rgba(0,0,0,.18);min-height:130px;">
                    <h3 style="margin:0 0 14px;color:#f5d382;font-size:20px;">我的评论</h3>
                    ${
                      comments.length
                        ? comments
                            .map(
                              (c) => `
                                <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);">
                                    <div style="font-weight:700;">${esc(c.city || c.city_name || '未选择城市')}</div>
                                    <div style="opacity:.9;margin:6px 0;line-height:1.7;">${esc(c.content || '')}</div>
                                    <div style="font-size:12px;opacity:.55;">${esc(
                                      formatTime(c.time || c.created_at || '')
                                    )} · 点赞 ${esc(c.likes ?? c.like_count ?? 0)}</div>
                                </div>
                            `
                            )
                            .join('')
                        : `<div style="opacity:.62;line-height:1.8;">还没有发布评论。</div>`
                    }
                </section>

                <section style="border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;background:rgba(0,0,0,.18);min-height:130px;">
                    <h3 style="margin:0 0 14px;color:#f5d382;font-size:20px;">别人回复我的评论</h3>
                    ${
                      replies.length
                        ? replies
                            .map(
                              (r) => `
                                <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);">
                                    <div style="font-weight:700;">${esc(r.from || '用户')}</div>
                                    <div style="opacity:.9;margin:6px 0;line-height:1.7;">${esc(r.content || '')}</div>
                                    <div style="font-size:12px;opacity:.55;">${esc(formatTime(r.time || r.created_at || ''))}</div>
                                </div>
                            `
                            )
                            .join('')
                        : `<div style="opacity:.62;line-height:1.8;">暂时没有收到回复。</div>`
                    }
                </section>
            </div>

            <button class="secondary" onclick="logout()" style="margin-top:20px;height:48px;border-radius:15px;">退出登录</button>
        </div>
    `;

  modal.classList.add('show');
}

function logout() {
  currentUser = null;
  saveCurrentUser();
  closeProfile();
  updateUIForLogin();
  toast('已退出登录');
}

function updateUIForLogin() {
  const loginBtn = document.getElementById('loginBtn');
  const regBtn = document.getElementById('regBtn');
  const profileBtn = document.getElementById('profileBtn');

  const loginBtnD = document.getElementById('loginBtnD');
  const regBtnD = document.getElementById('regBtnD');
  const profileBtnD = document.getElementById('profileBtnD');

  const avatar = currentUser?.avatar_url || currentUser?.avatar || DEFAULT_AVATAR;

  if (currentUser) {
    [loginBtn, loginBtnD].forEach((b) => b && (b.style.display = 'none'));
    [regBtn, regBtnD].forEach((b) => b && (b.style.display = 'none'));

    [profileBtn, profileBtnD].forEach((b) => {
      if (b) {
        b.style.display = 'inline-flex';
        b.style.width = '50px';
        b.style.height = '50px';
        b.style.minWidth = '50px';
        b.style.borderRadius = '50%';
        b.style.padding = '0';
        b.style.alignItems = 'center';
        b.style.justifyContent = 'center';
        b.style.background = 'transparent';
        b.style.border = '2px solid rgba(245,211,130,.75)';
        b.style.overflow = 'hidden';
        b.style.boxShadow = '0 8px 22px rgba(0,0,0,.32)';
        b.innerHTML =
          `<img src="${esc(avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
        b.onclick = openProfile;
      }
    });
  } else {
    [loginBtn, loginBtnD].forEach((b) => b && (b.style.display = 'inline-block'));
    [regBtn, regBtnD].forEach((b) => b && (b.style.display = 'inline-block'));
    [profileBtn, profileBtnD].forEach((b) => b && (b.style.display = 'none'));
  }
}

// ================================
// 13. 初始化// ================================
// 13. 初始化
// ================================
function initPage() {
  injectBugFixStyles();
  bindCityGridClick();
  bindPickerClick();
  bindCommentActions();
  loadUserFromStorage();

  const tagFilters = document.getElementById('tagFilters');

  if (tagFilters) {
    tagFilters.innerHTML = tags
      .map(
        (t) =>
          `<button class="chip" onclick="this.classList.toggle('active')">${esc(t)}</button>`
      )
      .join('');
  }

  const searchBtn = document.getElementById('searchBtn');

  if (searchBtn) {
    searchBtn.addEventListener('click', () => triggerSearch(false));
  }

  const commentText = document.getElementById('commentText');

  if (commentText) {
    commentText.placeholder = '';
    ensureCommentCloseButton();
  }

  const baseCityInput = document.getElementById('baseCityInput');
  const clearCityBtn = document.getElementById('clearCityBtn');

  if (baseCityInput && clearCityBtn) {
    clearCityBtn.style.display =
      baseCityInput.value.trim().length > 0 ? 'flex' : 'none';

    baseCityInput.addEventListener('input', function () {
      clearCityBtn.style.display =
        this.value.trim().length > 0 ? 'flex' : 'none';
    });
  }

  updateUIForLogin();
  goHome();
}

// ============================
// 结构桥接层
// ============================
window.goHome = goHome;
window.setRegion = setRegion;
window.keywordSearch = keywordSearch;
window.openDetail = openDetail;
window.openLogin = openLogin;
window.closeLogin = closeLogin;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.triggerSearch = triggerSearch;
window.openPicker = openPicker;
window.closePicker = closePicker;
window.renderPicker = renderPicker;
window.chooseCity = chooseCity;
window.backToList = backToList;
window.clearBaseCity = clearBaseCity;
window.updateUIForLogin = updateUIForLogin;
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.logout = logout;
window.postComment = postComment;
window.switchSort = switchSort;
window.changeAvatarFromFile = changeAvatarFromFile;
window.likeComment = likeComment;
window.toggleReplyBox = toggleReplyBox;
window.postReply = postReply;
window.resetCommentEditor = resetCommentEditor;

window.addEventListener('DOMContentLoaded', initPage);