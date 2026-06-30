// ================================
// 0. 配置
// ================================
const API_BASE = '';

// ================================
// 1. 状态
// ================================
let currentRegion = "all";
let mode = "home";
let previousScroll = 0;
let currentCity = null;
let currentUser = null;

// ================================
// 2. 工具函数（增强稳定性）
// ================================
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
}

function toast(t) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = t;
    el.style.display = "block";
    setTimeout(() => el.style.display = "none", 1800);
}

// ================================
// 3. API（防崩溃版）
// ================================
async function fetchData(endpoint, options = {}) {
    try {
        const res = await fetch(API_BASE + endpoint, options);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.error("API error:", e);
        return null;
    }
}

// ================================
// 4. 安全渲染核心（重点修复）
// ================================
function showList(title, list = [], label) {
    if (!Array.isArray(list)) list = [];

    document.getElementById("pageTitle").textContent = title;
    document.getElementById("listTitle").textContent = title;

    const hero = document.getElementById("hero");
    const grid = document.getElementById("cityGrid");

    if (!grid) return;

    if (list.length > 0) {
        hero.style.display = "block";
        hero.innerHTML = `
            <div class="scene">${esc(list[0].name || "城市")}</div>
        `;
    } else {
        hero.style.display = "none";
    }

    grid.innerHTML = list.length
        ? list.map((c, i) => `
            <div class="card" onclick="openDetail('${c.name}')">
                <div class="scene">${esc(c.name || "未知")}</div>
                <div class="card-desc">${esc(c.intro || "")}</div>
            </div>
        `).join("")
        : `<div class="empty">暂无数据</div>`;
}

// ================================
// 5. 首页
// ================================
async function goHome() {
    mode = "home";
    currentRegion = "all";

    const data = await fetchData(`/api/top30?region=all`);

    if (data && data.length > 0) {
        showList("本月热门城市排行榜", data);
    } else {
        showList("本月热门城市排行榜", []);
    }
}

// ================================
// 6. 搜索（修复 r / params bug）
// ================================
async function triggerSearch() {
    const baseCity = document.getElementById("baseCityInput")?.value?.trim() || "";
    const budget = Number(document.getElementById("budgetInput")?.value || 0);
    const days = document.getElementById("daysInput")?.value || "";

    const selectedTags = [...document.querySelectorAll(".chip.active")]
        .map(x => x.textContent);

    const params = new URLSearchParams({
        region: currentRegion,
        budget,
        days,
        tags: selectedTags.join(",")
    });

    const data = await fetchData(`/api/search/filter?${params.toString()}`);

    if (data && data.length > 0) {
        showList("搜索推荐结果", data);
    } else {
        toast("没有找到匹配城市");
    }
}

// ================================
// 7. 切换地区（修复 API 结构）
// ================================
async function setRegion(r, el) {
    currentRegion = r;

    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    if (el) el.classList.add("active");

    const data = await fetchData(`/api/top30?region=${r}`);

    if (data && data.length > 0) {
        showList("热门城市排行", data);
    } else {
        showList("热门城市排行", []);
    }
}

// ================================
// 8. 详情页（安全版）
// ================================
async function openDetail(name) {
    const data = await fetchData(`/api/city?name=${encodeURIComponent(name)}`);

    if (!data) {
        toast("城市不存在");
        return;
    }

    alert("进入城市：" + data.name);
}

// ================================
// 9. 初始化（关键修复点！！！！）
// ================================
window.addEventListener("DOMContentLoaded", () => {
    goHome();

    const btn = document.getElementById("searchBtn");
    if (btn) btn.addEventListener("click", triggerSearch);
});