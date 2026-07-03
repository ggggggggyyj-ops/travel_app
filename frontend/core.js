// ================================
// 0. 配置与核心数据源
// ================================
const API_BASE = '';

// ================================
// 1. 全局状态定义
// ================================
let currentRegion = "all";
let mode = "home";
let activeFilters = null;
let activeKeyword = "";
let previousScroll = 0;
let currentCity = null;

// ================================
// 用户状态
// ================================
let currentUser = null;
const USER_STORE_KEY = 'travel_users';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';

function normalizeUser(u) {
    return {
        username: u.username || u.phone || '',
        phone: u.phone || u.username || '',
        password: u.password || '',
        avatar: u.avatar || DEFAULT_AVATAR,
        comments: Array.isArray(u.comments) ? u.comments : [],
        likes: Array.isArray(u.likes) ? u.likes : [],
        replies: Array.isArray(u.replies) ? u.replies : []
    };
}

function loadUserStore() {
    try {
        const saved = JSON.parse(localStorage.getItem(USER_STORE_KEY) || '[]');
        return Array.isArray(saved) ? saved.map(normalizeUser) : [];
    } catch (e) {
        return [];
    }
}

function saveUserStore() {
    try {
        localStorage.setItem(USER_STORE_KEY, JSON.stringify(fakeUsers));
    } catch (e) {}
}

function isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(String(phone || '').trim());
}

const fakeUsers = loadUserStore();

const tags = ["海边", "爬山", "雪景", "古城", "美食", "温泉", "情侣", "亲子", "拍照", "夜景", "购物", "文化"];

// ================================
// 2. 核心工具函数
// ================================
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[m]));
}

function toast(t) {
    const e = document.getElementById("toast");
    if (!e) return;

    e.textContent = t;
    e.style.display = "block";

    clearTimeout(e._timer);
    e._timer = setTimeout(() => {
        e.style.display = "none";
    }, 1800);
}

function km(a, b, c, d) {
    const R = 6371;
    const rad = x => x * Math.PI / 180;
    const x = rad(c - a);
    const y = rad(d - b);
    const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;

    return Math.round(R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
}

function normalizeImageUrl(url) {
    if (!url) return "";

    let u = String(url).trim().replace(/\\/g, "/");

    if (!u) return "";

    if (/^https?:\/\//i.test(u)) {
        return `/proxy-image?url=${encodeURIComponent(u)}`;
    }

    if (/^data:/i.test(u) || /^blob:/i.test(u)) {
        return u;
    }

    u = u.replace(/^\.?\//, "");
    u = u.replace(/^frontend\//, "");

    return "/" + u;
}

function bgStyle(url) {
    const img = normalizeImageUrl(url);

    if (!img) {
        return "background:#121620 center center / cover no-repeat !important;";
    }

    return `background:#121620 url("${String(img).replace(/"/g, '&quot;')}") center center / cover no-repeat !important;`;
}

function jsArg(value) {
    return JSON.stringify(String(value ?? ""));
}

function getCityImage(c) {
    if (!c) return "";

    let url = c.image_url || c.img || c.image || "";

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
    if (!a) return "";

    let url = a.image_url || a.img || a.image || "";

    return normalizeImageUrl(url);
}

function scene(c) {
    let hls = c.highlights || [];

    if (typeof hls === 'string') {
        hls = hls
            .split(/[，、,]/)
            .map(item => item.trim())
            .filter(item => item.length > 0);
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
    let t = c.intro || '';

    if (!t) return '暂无介绍';

    return t
        .replace(/<[^>]*>/g, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ================================
// 3. 核心渲染
// ================================
function getCurrentMonthLabel() {
    const monthMap = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    return monthMap[new Date().getMonth()];
}

function setHero(c, label) {
    const heroEl = document.getElementById("hero");

    if (!heroEl || !c) return;

    heroEl.innerHTML = scene(c) +
        `<div class="badges">
            <span class="badge gold" style="font-size:24px;padding:9px 24px !important;font-weight:900;letter-spacing:1px;">${label}</span>
        </div>
        <div class="intro">${esc(c.intro || `${c.name}的魅力远不止于此，更多精彩等你亲身体验。`)}</div>`;

    heroEl.onclick = () => openDetail(c.name);
}

function renderCards(list) {
    list = Array.isArray(list) ? list : [];

    const el = document.getElementById("cityGrid");

    if (!el) return;

    el.innerHTML = list.length ? list.map((c, i) => {
        const realRank = i + 1;

        return `
            <article class="card" onclick="openDetail(${jsArg(c.name)})">
                ${scene(c)}
                <div class="badges">
                    <span class="badge gold" style="font-size:22px;padding:8px 20px !important;font-weight:900;letter-spacing:1px;">TOP ${realRank}</span>
                </div>
                <div class="card-desc">${esc(oneLine(c))}</div>
            </article>
        `;
    }).join("") : `<div class="empty">暂无数据</div>`;
}

function showList(title, list, label) {
    list = Array.isArray(list) ? list : [];

    const pageTitle = document.getElementById("pageTitle");
    const listTitle = document.getElementById("listTitle");
    const heroEl = document.getElementById("hero");

    if (pageTitle) pageTitle.textContent = title;
    if (listTitle) listTitle.innerHTML = title;

    document.body.classList.toggle("noHero", !list.length);

    if (list.length && heroEl) {
        heroEl.style.display = "block";
        setHero(list[0], label || `TOP ${list[0].monthRank || 1}`);
    } else if (heroEl) {
        heroEl.innerHTML = "";
        heroEl.style.display = "none";
    }

    renderCards(list);
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
        console.error("API 请求失败:", error);
        return [];
    }
}

// ================================
// 5. 核心业务逻辑
// ================================
async function triggerSearch() {
    const baseCity = (document.getElementById("baseCityInput")?.value || "").trim();
    const budget = Number(document.getElementById("budgetInput")?.value || 0);
    const days = document.getElementById("daysInput")?.value || "";
    const selectedTags = [...document.querySelectorAll(".chip.active")].map(x => x.textContent);

    if (!baseCity && !budget && !days && selectedTags.length === 0) {
        return goHome();
    }

    mode = "filter";

    if (baseCity) {
        const baseCityData = await fetchData(`/api/city?name=${encodeURIComponent(baseCity)}`);

        if (!baseCityData || Array.isArray(baseCityData)) {
            toast("出发城市未找到");
            return;
        }

        const params = new URLSearchParams({
            lat: baseCityData.lat,
            lng: baseCityData.lng,
            region: currentRegion,
            budget: budget,
            days: days,
            tags: selectedTags.join(',')
        });

        const data = await fetchData(`/api/search/full?${params.toString()}`);

        if (data) {
            showList(`从${baseCityData.name}出发 · 旅游推荐`, data, `距离最近`);
        }
    } else {
        const params = new URLSearchParams({
            region: currentRegion,
            budget: budget,
            days: days,
            tags: selectedTags.join(',')
        });

        const data = await fetchData(`/api/search/filter?${params.toString()}`);

        if (data) {
            showList("搜索推荐结果", data, `匹配成功`);
        }
    }

    window.scrollTo({ top: 0, behavior: "instant" });
}

async function goHome() {
    mode = "home";

    const homeWrap = document.getElementById("homeWrap");
    const detail = document.getElementById("detail");
    const headerHome = document.getElementById('headerHome');
    const headerDetail = document.getElementById('headerDetail');

    if (detail) detail.style.display = "none";
    if (homeWrap) homeWrap.style.display = "grid";
    if (headerHome) headerHome.style.display = 'flex';
    if (headerDetail) headerDetail.style.display = 'none';

    const data = await fetchData(`/api/top30?region=all`);
    const list = Array.isArray(data) ? data : [];

    showList(`${getCurrentMonthLabel()}热门城市TOP30`, list, "TOP 1");

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function setRegion(r, el) {
    currentRegion = r;

    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));

    if (el) el.classList.add("active");

    const monthLabel = getCurrentMonthLabel();
    const regionLabel = r === "all" ? "全部城市" : r === "domestic" ? "国内城市" : "国外城市";
    const data = await fetchData(`/api/top30?region=${r}`);

    if (data) {
        showList(`${monthLabel} · ${regionLabel}热门排行`, data);
    }

    window.scrollTo({ top: 0, behavior: "instant" });
}

async function keywordSearch(v) {
    v = (v || "").trim();

    if (!v) return goHome();

    const baseCityInput = document.getElementById("baseCityInput");

    if (baseCityInput) baseCityInput.value = v;

    await triggerSearch();
}

// ================================
// 6. Picker
// ================================
let pickerTarget = "top";
let pickerRegion = "国内";

async function openPicker(target = "top") {
    pickerTarget = target;

    const picker = document.getElementById("picker");
    const pickerInput = document.getElementById("pickerInput");

    if (picker) picker.classList.add("show");
    if (pickerInput) pickerInput.value = "";

    await renderPicker("");

    setTimeout(() => {
        const input = document.getElementById("pickerInput");
        if (input) input.focus();
    }, 30);
}

function closePicker() {
    const picker = document.getElementById("picker");

    if (picker) picker.classList.remove("show");
}

window.switchPickerRegion = function(region, btn) {
    pickerRegion = region === "domestic" ? "国内" : "国外";

    document.querySelectorAll(".picker-tabs .tab-btn").forEach(b => b.classList.remove("active"));

    if (btn) btn.classList.add("active");

    renderPicker(document.getElementById("pickerInput")?.value || "");
};

async function renderPicker(keyword = "") {
    const body = document.getElementById("pickerBody");

    if (!body) return;

    const params = new URLSearchParams({
        region: pickerRegion,
        keyword: keyword
    });

    const list = await fetchData(`/api/picker/list?${params.toString()}`);

    body.innerHTML = "";

    if (!list || list.length === 0) {
        body.innerHTML = `<div style="padding:40px;text-align:center;opacity:0.6">未找到匹配城市</div>`;
        return;
    }

    const groups = {};

    list.forEach(city => {
        const letter = (city.pinyin || "#")[0].toUpperCase();

        if (!groups[letter]) groups[letter] = [];

        groups[letter].push(city);
    });

    let html = "";

    Object.keys(groups).sort().forEach(letter => {
        html += `<div class="letter">${letter}</div><div class="city-pills">`;

        groups[letter].forEach(c => {
            html += `<button class="city-pill" onclick="chooseCity(${jsArg(c.name)})">${esc(c.name)}</button>`;
        });

        html += `</div>`;
    });

    body.innerHTML = html;
}

function chooseCity(name) {
    const baseCityInput = document.getElementById("baseCityInput");
    const clearCityBtn = document.getElementById("clearCityBtn");

    if (baseCityInput) baseCityInput.value = name;
    if (clearCityBtn) clearCityBtn.style.display = 'flex';

    closePicker();
}

function budgetHTML(c) {
    return `
        <div class="budget-item">预算参考：${esc(c.budget || "暂无")}</div>
        <div class="budget-item">推荐评分：${esc(c.score || "暂无")}</div>
    `;
}

async function openDetail(n) {
    previousScroll = window.scrollY;

    const c = await fetchData(`/api/city?name=${encodeURIComponent(n)}`);

    if (!c || Array.isArray(c)) {
        toast('未找到该城市');
        return;
    }

    if (!c.intro) c.intro = `${c.name}是一座拥有独特魅力的城市，期待您的探索。`;
    if (!c.food) c.food = '当地特色美食';
    if (!c.highlights || c.highlights.length === 0) c.highlights = ['城市地标', '历史街区', '特色美食'];
    if (!c.score) c.score = 8.0;
    if (!c.budget) c.budget = 1500;

    currentCity = c;

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

    if (dHero) dHero.innerHTML = scene(c);
    if (dIntro) dIntro.textContent = c.detail_intro || c.intro;
    if (dBudget) dBudget.innerHTML = budgetHTML(c);

    let rawSpots = c.highlights;

    if (typeof rawSpots === 'string') {
        rawSpots = rawSpots
            .split(/[，、,]/)
            .map(item => item.trim())
            .filter(item => item.length > 0);
    }

    if (!Array.isArray(rawSpots) || rawSpots.length === 0) {
        rawSpots = ['城市地标', '历史街区', '特色美食'];
    }

    const spots = rawSpots.slice(0, 6);
    const dSpots = document.getElementById('dSpots');

    if (dSpots) {
        const attractionData = await fetchData(`/api/city/attractions?name=${encodeURIComponent(c.name)}`);
        const attractionList = Array.isArray(attractionData) ? attractionData : [];

        const displaySpots = attractionList.length
            ? attractionList.slice(0, 6).map(item => ({
                name: item.name || '推荐景点',
                image: getAttractionImage(item)
            }))
            : spots.map(name => ({
                name,
                image: ''
            }));

        dSpots.innerHTML = `
            <div class="grid">
                ${displaySpots.map(item => `
                    <div class="card" style="height:160px;">
                        <div class="scene" style='${bgStyle(item.image)}'>
                            <div class="cityname" style="font-size:18px;left:16px;bottom:16px;top:auto;">
                                ${esc(item.name)}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const dFood = document.getElementById('dFood');

    if (dFood) {
        dFood.innerHTML = String(c.food || '')
            .split(/[、，,]/)
            .map(x => x.trim())
            .filter(Boolean)
            .map(x => `<span>${esc(x)}</span>`)
            .join('');
    }

    let transportText = c.transport_tips || '暂无详细交通建议。';
    transportText = transportText.replace(/\\n/g, '\n');

    const dTransport = document.getElementById('dTransport');

    if (dTransport) {
        dTransport.innerHTML = `<div style="white-space:pre-wrap;">${esc(transportText)}</div>`;
    }

    let stayText = c.stay_tips || '暂无详细住宿建议。';
    stayText = stayText.replace(/\\n/g, '\n');

    const dStay = document.getElementById('dStay');

    if (dStay) {
        dStay.innerHTML = `<div style="white-space:pre-wrap;">${esc(stayText)}</div>`;
    }

    await loadComments(c.name, 'hot');
}

function backToList() {
    const detail = document.getElementById("detail");
    const homeWrap = document.getElementById("homeWrap");
    const headerHome = document.getElementById('headerHome');
    const headerDetail = document.getElementById('headerDetail');

    if (detail) detail.style.display = "none";
    if (homeWrap) homeWrap.style.display = "grid";
    if (headerHome) headerHome.style.display = 'flex';
    if (headerDetail) headerDetail.style.display = 'none';

    setTimeout(() => {
        window.scrollTo({ top: previousScroll || 0, behavior: "instant" });
    }, 0);
}

// ================================
// 7. 评论系统
// ================================
async function loadComments(cityName, sortType = 'hot') {
    const container = document.getElementById('commentList');

    if (!container) return;

    const data = await fetchData(`/api/comments?city=${encodeURIComponent(cityName)}&sort=${sortType}`);

    const remoteComments = Array.isArray(data) ? data : [];
    const localComments = fakeUsers
        .flatMap(u => (Array.isArray(u.comments) ? u.comments : []).map(c => ({ ...c, username: u.username || u.phone || '用户' })))
        .filter(c => c.city === cityName);

    const allComments = sortType === 'new'
        ? [...localComments, ...remoteComments]
        : [...remoteComments, ...localComments];

    container.innerHTML = allComments.length ? allComments.map(comment => `
        <div class="comment-item">
            <b>${esc(comment.username || comment.phone || '')}</b>
            <p>${esc(comment.content || '')}</p>
        </div>
    `).join('') : `<div class="comment-item"><p>暂无评论</p></div>`;
}

function switchSort(sortType, btn) {
    document.querySelectorAll('.sorts button').forEach(b => b.classList.remove('active'));

    if (btn) btn.classList.add('active');

    if (currentCity && currentCity.name) {
        loadComments(currentCity.name, sortType);
    }
}

function postComment() {
    if (!currentUser) {
        openLogin('login');
        return;
    }

    const textEl = document.getElementById('commentText');
    const content = (textEl?.value || '').trim();

    if (!content) {
        toast('请输入评论内容');
        return;
    }

    const item = {
        city: currentCity?.name || '',
        content: content,
        time: new Date().toLocaleString(),
        likes: 0,
        replies: []
    };

    currentUser.comments = Array.isArray(currentUser.comments) ? currentUser.comments : [];
    currentUser.comments.unshift(item);

    saveUserStore();

    if (textEl) textEl.value = '';

    toast('评论发布成功');

    if (currentCity && currentCity.name) {
        loadComments(currentCity.name, 'new');
    }
}

// ================================
// 8. 登录系统
// ================================
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
            <h2>${type === "login" ? "登录" : "注册"}</h2>

            <input id="loginUser" type="tel" inputmode="tel" placeholder="手机号">
            <input id="loginPass" type="password" placeholder="密码">

            <button class="primary"
                onclick="${type === "login" ? "doLogin()" : "doRegister()"}">
                ${type === "login" ? "登录" : "注册"}
            </button>

            <button class="secondary" onclick="closeLogin()">
                ${type === "login" ? "暂不登录，继续浏览" : "暂不注册，继续浏览"}
            </button>
        </div>
    `;

    modal.classList.add('show');
}

function closeLogin() {
    const modal = document.getElementById('loginModal');

    if (modal) modal.classList.remove('show');
}

function closeProfile() {
    const modal = document.getElementById('profileModal');

    if (modal) modal.classList.remove('show');
}

document.addEventListener("click", (e) => {
    const loginModal = document.getElementById("loginModal");
    const profileModal = document.getElementById("profileModal");

    if (e.target === loginModal) closeLogin();
    if (e.target === profileModal) closeProfile();
});

function doLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (!user || !pass) return toast('请输入手机号和密码');
    if (!isValidPhone(user)) return toast('请输入正确手机号');

    const found = fakeUsers.find(u => (u.phone || u.username) === user && u.password === pass);

    if (!found) return toast('手机号或密码错误');

    currentUser = found;

    closeLogin();
    updateUIForLogin();
    toast('登录成功');
}

function doRegister() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();

    if (!user || !pass) return toast('请输入手机号和密码');
    if (!isValidPhone(user)) return toast('请输入正确手机号');

    if (fakeUsers.find(u => (u.phone || u.username) === user)) {
        return toast('手机号已注册');
    }

    const newUser = {
        username: user,
        phone: user,
        password: pass,
        avatar: DEFAULT_AVATAR,
        comments: [],
        likes: [],
        replies: []
    };

    fakeUsers.push(newUser);

    saveUserStore();

    toast('注册成功，请登录');
    openLogin('login');
}

function changeAvatarFromFile(input) {
    if (!currentUser) return;

    const file = input.files && input.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
        currentUser.avatar = e.target.result;

        const idx = fakeUsers.findIndex(u => (u.phone || u.username) === (currentUser.phone || currentUser.username));

        if (idx >= 0) {
            fakeUsers[idx].avatar = currentUser.avatar;
        }

        saveUserStore();
        updateUIForLogin();
        openProfile();
        toast('头像已更新');
    };

    reader.readAsDataURL(file);
}

function openProfile() {
    if (!currentUser) {
        openLogin('login');
        return;
    }

    const modal = document.getElementById('profileModal');

    if (!modal) return;

    const comments = Array.isArray(currentUser.comments) ? currentUser.comments : [];
    const likes = Array.isArray(currentUser.likes) ? currentUser.likes : [];
    const replies = Array.isArray(currentUser.replies) ? currentUser.replies : [];

    modal.innerHTML = `
        <div class="loginbox" style="width:min(820px,92vw);max-height:86vh;overflow:auto;padding:30px;border-radius:26px;background:#151a28;border:1px solid rgba(245,211,130,.22);box-shadow:0 28px 80px rgba(0,0,0,.58);">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);">
                <div style="display:flex;align-items:center;gap:18px;min-width:0;">
                    <div style="position:relative;flex:0 0 auto;">
                        <img src="${esc(currentUser.avatar || DEFAULT_AVATAR)}" style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:2px solid rgba(245,211,130,.75);display:block;box-shadow:0 12px 30px rgba(0,0,0,.35);">
                        <button onclick="document.getElementById('avatarInput').click()" style="position:absolute;right:-6px;bottom:-6px;width:30px;height:30px;border:1px solid rgba(255,255,255,.2);border-radius:50%;padding:0;background:linear-gradient(135deg,#f6e58d,#e8b96b);color:#111;font-size:13px;font-weight:900;line-height:30px;text-align:center;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.35);">改</button>
                        <input id="avatarInput" type="file" accept="image/*" style="display:none" onchange="changeAvatarFromFile(this)">
                    </div>
                    <div style="min-width:0;">
                        <h2 style="margin:0 0 8px;font-size:28px;color:#f6f1df;">个人主页</h2>
                        <div style="opacity:.78;font-size:15px;word-break:break-all;">手机号：${esc(currentUser.phone || currentUser.username)}</div>
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
                    ${comments.length ? comments.map(c => `
                        <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);">
                            <div style="font-weight:700;">${esc(c.city || '未选择城市')}</div>
                            <div style="opacity:.9;margin:6px 0;line-height:1.7;">${esc(c.content || '')}</div>
                            <div style="font-size:12px;opacity:.55;">${esc(c.time || '')}</div>
                        </div>
                    `).join('') : `<div style="opacity:.62;line-height:1.8;">还没有发布评论。</div>`}
                </section>

                <section style="border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;background:rgba(0,0,0,.18);min-height:130px;">
                    <h3 style="margin:0 0 14px;color:#f5d382;font-size:20px;">别人回复我的评论</h3>
                    ${replies.length ? replies.map(r => `
                        <div style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);">
                            <div style="font-weight:700;">${esc(r.from || '用户')}</div>
                            <div style="opacity:.9;margin:6px 0;line-height:1.7;">${esc(r.content || '')}</div>
                            <div style="font-size:12px;opacity:.55;">${esc(r.time || '')}</div>
                        </div>
                    `).join('') : `<div style="opacity:.62;line-height:1.8;">暂时没有收到回复。</div>`}
                </section>
            </div>

            <button class="secondary" onclick="logout()" style="margin-top:20px;height:48px;border-radius:15px;">退出登录</button>
        </div>
    `;

    modal.classList.add('show');
}

function logout() {
    currentUser = null;

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

    const avatar = document.getElementById('profileAvatar');
    const avatarD = document.getElementById('profileAvatarD');

    if (currentUser) {
        [loginBtn, loginBtnD].forEach(b => b && (b.style.display = 'none'));
        [regBtn, regBtnD].forEach(b => b && (b.style.display = 'none'));

        [profileBtn, profileBtnD].forEach(b => {
            if (b) {
                b.style.display = 'inline-flex';
                b.style.width = 'auto';
                b.style.height = '46px';
                b.style.borderRadius = '999px';
                b.style.padding = '6px 18px 6px 8px';
                b.style.alignItems = 'center';
                b.style.justifyContent = 'center';
                b.style.gap = '8px';
                b.style.color = '#111';
                b.style.fontWeight = '800';
                b.style.background = 'linear-gradient(135deg,#f6e58d,#e8b96b)';
                b.style.overflow = 'hidden';
                b.innerHTML = `<img src="${esc(currentUser.avatar || DEFAULT_AVATAR)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;display:block;"><span>个人主页</span>`;
                b.onclick = openProfile;
            }
        });

        if (avatar) avatar.src = currentUser.avatar;
        if (avatarD) avatarD.src = currentUser.avatar;
    } else {
        [loginBtn, loginBtnD].forEach(b => b && (b.style.display = 'inline-block'));
        [regBtn, regBtnD].forEach(b => b && (b.style.display = 'inline-block'));
        [profileBtn, profileBtnD].forEach(b => b && (b.style.display = 'none'));
    }
}

// ================================
// 9. 初始化
// ================================
function initPage() {
    const tagFilters = document.getElementById("tagFilters");

    if (tagFilters) {
        tagFilters.innerHTML = tags.map(t => `<button class="chip" onclick="this.classList.toggle('active')">${esc(t)}</button>`).join("");
    }

    const searchBtn = document.getElementById("searchBtn");

    if (searchBtn) {
        searchBtn.addEventListener("click", triggerSearch);
    }

    const baseCityInput = document.getElementById('baseCityInput');
    const clearCityBtn = document.getElementById('clearCityBtn');

    if (baseCityInput && clearCityBtn) {
        clearCityBtn.style.display = baseCityInput.value.trim().length > 0 ? 'flex' : 'none';

        baseCityInput.addEventListener('input', function() {
            clearCityBtn.style.display = this.value.trim().length > 0 ? 'flex' : 'none';
        });
    }

    updateUIForLogin();
    goHome();
}

function clearBaseCity() {
    const baseCityInput = document.getElementById('baseCityInput');
    const clearCityBtn = document.getElementById('clearCityBtn');

    if (baseCityInput) baseCityInput.value = '';
    if (clearCityBtn) clearCityBtn.style.display = 'none';

    triggerSearch();
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

window.addEventListener("DOMContentLoaded", initPage);