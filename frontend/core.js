// ================================
// 0. 配置与核心数据源
// ================================
const API_BASE = 'https://my-travel-lz9w.onrender.com'; 
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
// 【核心新增】用户状态
// ================================
let currentUser = null;
const fakeUsers = [
    { username: 'admin', password: '123456', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100', comments: [], likes: [] }
];

const tags = ["海边", "爬山", "雪景", "古城", "美食", "温泉", "情侣", "亲子", "拍照", "夜景", "购物", "文化"];

// ================================
// 2. 核心工具函数
// ================================
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
}

function toast(t) { 
    const e = document.getElementById("toast"); 
    e.textContent = t; 
    e.style.display = "block"; 
    setTimeout(() => e.style.display = "none", 1800); 
}

function km(a, b, c, d) { 
    const R = 6371, rad = x => x * Math.PI / 180; 
    const x = rad(c - a), y = rad(d - b); 
    const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; 
    return Math.round(R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))); 
}

function scene(c) { 
    let hls = (c.highlights || []);
    if (typeof hls === 'string') {
        hls = hls.split(/[，、,]/).map(item => item.trim()).filter(item => item.length > 0);
    }
    if(!Array.isArray(hls) || hls.length === 0) {
        hls = ['城市漫游', '当地美食', '特色街巷'];
    }
    
    let htmlSpans = '';
    for(let i = 0; i < 3 && i < hls.length; i++) {
        htmlSpans += `<span>${esc(hls[i])}</span>`;
    }
    
    const originalUrl = (window.cityImages && window.cityImages[c.name]) 
        ? window.cityImages[c.name] 
        : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop';
    
    const imgUrl = `/proxy-image?url=${encodeURIComponent(originalUrl)}`;

    return `
        <div class="scene" style="background-image: url('${imgUrl}') !important; background-size: cover; background-position: center; background-color: #121620;">
            <div class="cityname">${esc(c.name)}</div>
            <div class="feature-line">${htmlSpans}</div>
        </div>
    `; 
}

function oneLine(c) { 
    let t = c.intro || '';
    if (!t) return '暂无介绍';
    
    let cleanText = t.replace(/<[^>]*>/g, '')
                      .replace(/<br\s*\/?>/gi, ' ')
                      .replace(/\r?\n|\r/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim(); 
    return cleanText; 
}

// ================================
// 3. 核心渲染
// ================================
function getCurrentMonthLabel() {
    const monthMap = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const currentMonth = new Date().getMonth();
    return monthMap[currentMonth];
}

function setHero(c, label) {
    const monthLabel = getCurrentMonthLabel();
    document.getElementById("hero").innerHTML = scene(c) + 
        `<div class="badges">
            <span class="badge gold" style="font-size: 18px; padding: 6px 18px;">${monthLabel} ${label}</span>
        </div>
        <div class="intro">${esc(c.intro || `${c.name}的魅力远不止于此，更多精彩等你亲身体验。`)}</div>`;
    document.getElementById("hero").onclick = () => openDetail(c.name);
}

function renderCards(list) {
    const monthLabel = getCurrentMonthLabel();
    document.getElementById("cityGrid").innerHTML = list.length ? list.map((c, i) => {
        const realRank = i + 1; 
        return `
            <article class="card" onclick="openDetail('${c.name}')">
                ${scene(c)}
                <div class="badges">
                    <span class="badge gold" style="font-size: 15px; padding: 4px 14px;">${monthLabel} TOP ${realRank}</span>
                </div>
                <div class="card-desc">${esc(oneLine(c))}</div>
            </article>
        `;
    }).join("") : `<div class="empty">当前搜索没有符合条件的城市。</div>`;
}

function showList(title, list, label) {
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("listTitle").innerHTML = title;
    document.body.classList.toggle("noHero", !list.length);
    const heroEl = document.getElementById("hero");
    if (list.length) {
        if (heroEl) { heroEl.style.display = "block"; }
        setHero(list[0], label || `TOP ${list[0].monthRank || 1}`);
    } else {
        if (heroEl) { heroEl.innerHTML = ""; heroEl.style.display = "none"; }
    }
    renderCards(list);
}

// ================================
// 4. API 请求
// ================================
async function fetchData(endpoint = '/cities', options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("API 请求失败:", error);
        return null;
    }
}

// ================================
// 5. 核心业务逻辑
// ================================
async function triggerSearch() {
    const baseCity = document.getElementById("baseCityInput").value.trim();
    const budget = Number(document.getElementById("budgetInput").value || 0);
    const days = document.getElementById("daysInput").value;
    const selectedTags = [...document.querySelectorAll(".chip.active")].map(x => x.textContent);
    
    if (!baseCity && !budget && !days && selectedTags.length === 0) {
        return goHome();
    }

    mode = "filter";

    if (baseCity) {
        const baseCityData = await fetchData(`/api/city?name=${encodeURIComponent(baseCity)}`);
        if (!baseCityData) { toast("出发城市未找到"); return; }

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
    document.getElementById("detail").style.display = "none";
    document.getElementById("homeWrap").style.display = "grid";
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.r === "all"));
    currentRegion = "all";
    
    const monthLabel = getCurrentMonthLabel();
    const data = await fetchData(`/api/top30?region=all`);
    if (data) {
        showList(`${monthLabel}热门城市排行榜 TOP30`, data, `TOP 1`);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
}

async function setRegion(r, el) {
    currentRegion = r;
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    el.classList.add("active");
    
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
    document.getElementById("baseCityInput").value = v; 
    await triggerSearch();
}

// ================================
// 6. Picker
// ================================
let pickerTarget = "top";
let pickerRegion = "国内"; 

async function openPicker(target = "top") {
    pickerTarget = target;
    document.getElementById("picker").classList.add("show");
    document.getElementById("pickerInput").value = "";
    await renderPicker("");
    setTimeout(() => document.getElementById("pickerInput").focus(), 30);
}

function closePicker() {
    document.getElementById("picker").classList.remove("show");
}

window.switchPickerRegion = function(region, btn) {
    pickerRegion = region === "domestic" ? "国内" : "国外";
    document.querySelectorAll(".picker-tabs .tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderPicker(document.getElementById("pickerInput").value || "");
};

async function renderPicker(keyword = "") {
    const body = document.getElementById("pickerBody");
    if (!body) return;

    const params = new URLSearchParams({ region: pickerRegion, keyword: keyword });
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
        groups[letter].forEach(c => html += `<button class="city-pill" onclick="chooseCity('${c.name}')">${c.name}</button>`);
        html += `</div>`;
    });
    body.innerHTML = html;
}

function chooseCity(name) {
    document.getElementById("baseCityInput").value = name;
    closePicker();
}

async function openDetail(n) {
    previousScroll = window.scrollY;

    const c = await fetchData(`/api/city?name=${encodeURIComponent(n)}`);
    if (!c) { toast('未找到该城市'); return; }

    if (!c.intro) c.intro = `${c.name}是一座拥有独特魅力的城市，期待您的探索。`;
    if (!c.food) c.food = '当地特色美食';
    if (!c.highlights || c.highlights.length===0) c.highlights = ['城市地标', '历史街区', '特色美食'];
    if (!c.score) c.score = 8.0;
    if (!c.budget) c.budget = 1500;

    currentCity = c;
    
    document.getElementById('headerHome').style.display = 'none';
    document.getElementById('headerDetail').style.display = 'flex';

    document.getElementById('homeWrap').style.display = 'none';
    document.getElementById('detail').style.display = 'block';

    document.getElementById('dHero').innerHTML = scene(c);
    
    document.getElementById('dIntro').textContent = c.detail_intro || c.intro; 
    document.getElementById('dBudget').innerHTML = budgetHTML(c);

    let rawSpots = c.highlights;
    if (typeof rawSpots === 'string') {
        rawSpots = rawSpots.split(/[，、,]/).map(item => item.trim()).filter(item => item.length > 0);
    }
    if (!Array.isArray(rawSpots) || rawSpots.length === 0) {
        rawSpots = ['城市地标', '历史街区', '特色美食'];
    }
    const spots = rawSpots.slice(0, 6);
    
    document.getElementById('dSpots').innerHTML = `
        <div class="grid">
            ${spots.map(name => {
                const randomImg = `https://source.unsplash.com/400x300/?${encodeURIComponent(name)},landmark`;
                return `
                    <div class="card" onclick="openDetail('${c.name}')" style="height: 160px; cursor: default;">
                        <div class="scene" style="background-image: url('${randomImg}') !important; background-size: cover; background-position: center; background-color: #1a1e2b;">
                            <div class="cityname" style="font-size: 18px; left: 16px; top: auto; bottom: 16px; transform: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${esc(name)}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    document.getElementById('dFood').innerHTML = c.food.split('、').map(x => `<span>${x}</span>`).join('');

    let transportText = c.transport_tips || '暂无详细交通建议。';
    transportText = transportText.replace(/\\n/g, '\n');
    transportText = transportText.replace(/^\?\?\s*交通指南：\s*/, '');
    document.getElementById('dTransport').innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${esc(transportText)}</div>`;
    
    let stayText = c.stay_tips || '暂无详细住宿建议。';
    stayText = stayText.replace(/\\n/g, '\n');
    stayText = stayText.replace(/^\?\?\s*住宿建议：\s*/, '');
    document.getElementById('dStay').innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${esc(stayText)}</div>`;

    await loadComments(c.name, 'hot');
    
    window.scrollTo({ top: 0, behavior: 'instant' });
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, 50);
}

function backToList() {
    document.getElementById("detail").style.display = "none";
    document.getElementById("homeWrap").style.display = "grid";
    
    document.getElementById('headerHome').style.display = 'flex';
    document.getElementById('headerDetail').style.display = 'none';

    window.scrollTo({ top: previousScroll, behavior: 'instant' });
}

function budgetHTML(c) {
    if(!c || !c.budgetPlans || c.budgetPlans.length===0) return '<p>暂无详细预算方案，后续将完善。</p>';
    
    let plans = c.budgetPlans;
    if (typeof plans === 'string') {
        try {
            plans = JSON.parse(plans);
        } catch (e) {
            return '<p>数据格式有误，无法解析。</p>';
        }
    }
    
    return plans.map(p => `
        <div class="plan-card">
            <h3>${esc(p.name)}</h3>
            <div class="plan-content" style="white-space: pre-wrap; line-height: 1.6; margin-top: 8px;">${esc(p.text)}</div>
        </div>
    `).join('');
}

async function loadComments(cityName, sortType = 'hot') {
    const container = document.getElementById('commentList');
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">正在加载评论...</div>';

    try {
        const data = await fetchData(`/api/comments?city=${encodeURIComponent(cityName)}&sort=${sortType}`);
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">暂无评价，去游玩后发布第一条吧！</div>';
            return;
        }

        container.innerHTML = data.map(comment => {
            const stars = '⭐'.repeat(comment.rating) + '☆'.repeat(5 - comment.rating);
            const likeText = comment.likes > 0 ? `👍 ${comment.likes}` : '👍 0';
            const dateStr = new Date(comment.created_at).toLocaleDateString('zh-CN');

            return `
                <div class="comment-item">
                    <div class="comment-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; color: #ebd6a3;">${esc(comment.username)}</span>
                        <span style="color: #ffd700; font-size: 14px;">${stars}</span>
                    </div>
                    <p style="margin: 8px 0; line-height: 1.6; color: #d8d8d8;">${esc(comment.content)}</p>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #999; margin-top: 10px;">
                        <span>${dateStr}</span>
                        <span>${likeText}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("评论加载失败", error);
        container.innerHTML = '<div style="text-align:center;color:#ff6b6b;padding:20px;">评论加载失败，请刷新或重试。</div>';
    }
}

function switchSort(type, btn) {
    document.querySelectorAll('.sorts button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (currentCity && currentCity.name) {
        loadComments(currentCity.name, type);
    }
}

// ================================
// 【核心新增】用户登录与个人主页系统
// ================================

function openLogin() {
    const modal = document.getElementById('loginModal');
    modal.innerHTML = `
        <div class="loginbox">
            <h2>登录 / 注册</h2>
            <input id="loginUser" placeholder="用户名" value="admin">
            <input id="loginPass" type="password" placeholder="密码" value="123456">
            <button class="primary" onclick="doLogin()">确认登录</button>
            <button class="secondary" onclick="closeLogin()">暂不登录，继续浏览</button>
        </div>
    `;
    modal.classList.add('show');
}

function closeLogin() {
    document.getElementById('loginModal').classList.remove('show');
}

function doLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if(!user || !pass) return toast('请输入账号和密码');

    // 模拟登录（永久存放于内存中）
    currentUser = {
        username: user,
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
        comments: [],
        likes: []
    };
    
    closeLogin();
    updateUIForLogin();
    toast(`欢迎回来，${currentUser.username}！`);
}

function logout() {
    if(!confirm('确定要退出登录吗？')) return;
    currentUser = null;
    updateUIForLogin();
    toast('已退出登录');
}

function updateUIForLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const regBtn = document.getElementById('regBtn');
    const profileBtn = document.getElementById('profileBtn');
    const avatar = document.getElementById('profileAvatar');

    const loginBtnD = document.getElementById('loginBtnD');
    const regBtnD = document.getElementById('regBtnD');
    const profileBtnD = document.getElementById('profileBtnD');
    const avatarD = document.getElementById('profileAvatarD');

    if(currentUser) {
        [loginBtn, loginBtnD].forEach(b => b.style.display = 'none');
        [regBtn, regBtnD].forEach(b => b.style.display = 'none');
        [profileBtn, profileBtnD].forEach(b => b.style.display = 'block');
        avatar.src = currentUser.avatar;
        avatarD.src = currentUser.avatar;
    } else {
        [loginBtn, loginBtnD].forEach(b => b.style.display = 'inline-block');
        [regBtn, regBtnD].forEach(b => b.style.display = 'inline-block');
        [profileBtn, profileBtnD].forEach(b => b.style.display = 'none');
    }
}

function openProfile() {
    if(!currentUser) return;
    
    const modal = document.getElementById('profileModal');
    const historyHTML = currentUser.comments.length > 0 
        ? currentUser.comments.map(c => `<div style="border-bottom:1px solid #333;padding:10px 0;"><b style="color:#ffd700;">${c.city}</b><br>${c.text}</div>`).join('')
        : `<div style="color:#888;text-align:center;padding:20px;">还没有发布过评价，去旅行吧！</div>`;

    modal.innerHTML = `
        <div class="profilebox" style="max-width:600px;width:100%;background:#111623;padding:30px;border-radius:24px;border:1px solid #3f4656;">
            <div class="profile-header" style="display:flex;align-items:center;gap:20px;border-bottom:1px solid #343a4a;padding-bottom:20px;margin-bottom:20px;">
                <div style="position:relative;">
                    <img id="profileAvatarBig" src="${currentUser.avatar}" style="width:80px;height:80px;border-radius:50%;border:2px solid #f4dd83;object-fit:cover;">
                    <input type="file" id="avatarUpload" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;" onchange="changeAvatar(event)">
                </div>
                <div style="flex:1;">
                    <input id="profileUsername" type="text" value="${currentUser.username}" style="background:transparent;border:none;border-bottom:1px solid #555;color:#f4dd83;font-size:22px;font-weight:bold;width:100%;outline:none;">
                    <div style="font-size:14px;color:#888;margin-top:4px;">点击头像上传新图</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <h3 style="color:#f6f1df;margin:0;">我的足迹</h3>
            </div>
            <div style="max-height:300px;overflow-y:auto;margin-bottom:20px;background:#1a1f2d;border-radius:12px;padding:8px;">
                ${historyHTML}
            </div>
            <div style="display:flex;gap:12px;justify-content:flex-end;border-top:1px solid #343a4a;padding-top:16px;">
                <button onclick="logout()" style="background:transparent;border:1px solid #d32f2f;color:#d32f2f;padding:8px 20px;border-radius:20px;cursor:pointer;">退出登录</button>
                <button onclick="document.getElementById('profileModal').classList.remove('show')" style="background:#252a36;border:1px solid #444b5c;color:#ddd;padding:8px 20px;border-radius:20px;cursor:pointer;">关闭</button>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

function changeAvatar(e) {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        currentUser.avatar = ev.target.result;
        document.getElementById('profileAvatarBig').src = currentUser.avatar;
        updateUIForLogin();
        toast('头像已更新');
    };
    reader.readAsDataURL(file);
}

// 给个人主页的名字添加修改监听
document.addEventListener('change', function(e) {
    if(e.target.id === 'profileUsername') {
        currentUser.username = e.target.value;
        toast('昵称已更新为: ' + currentUser.username);
    }
});

function postComment() {
    if(!currentUser) return toast('请先登录再发布评价！');
    const textarea = document.getElementById('commentText');
    const text = textarea.value.trim();
    if(!text) return toast('评论内容不能为空');
    
    // 记录评论
    currentUser.comments.push({
        city: currentCity.name,
        text: text,
        time: new Date().toLocaleString()
    });
    toast('评论发布成功！');
    textarea.value = '';
    // 刷新主页足迹数据
    // 实际项目应重新请求后端数据
}

// ================================
// 8. 初始化
// ================================
document.getElementById("tagFilters").innerHTML = tags.map(t => `<button class="chip" onclick="this.classList.toggle('active')">${t}</button>`).join("");
document.getElementById("searchBtn").addEventListener("click", triggerSearch);

document.getElementById('baseCityInput').addEventListener('input', function() {
    const clearBtn = document.getElementById('clearCityBtn');
    if (this.value.trim().length > 0) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
});

function clearBaseCity() {
    document.getElementById('baseCityInput').value = '';
    document.getElementById('clearCityBtn').style.display = 'none';
    triggerSearch(); 
}

function chooseCity(name) {
    document.getElementById('baseCityInput').value = name;
    document.getElementById('baseCityInput').dispatchEvent(new Event('input'));
    closePicker();
    triggerSearch();
}
goHome();