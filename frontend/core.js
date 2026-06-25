// ================================
// 【终极自检版 core.js】
// 完全脱离后端数据库，自给自足！
// ================================

// 预先写好三个城市的数据，保证一定显示
const mockData = [
    { name: "三亚", score: 9.8, intro: "阳光沙滩，度假天堂。", highlights: ["海边", "潜水"] },
    { name: "成都", score: 9.6, intro: "天府之国，美食之都。", highlights: ["美食", "大熊猫"] },
    { name: "重庆", score: 9.5, intro: "8D魔幻城市，火锅之都。", highlights: ["夜景", "火锅"] }
];

// 渲染卡片的功能
function renderCards() {
    const grid = document.getElementById("cityGrid");
    let html = "";
    mockData.forEach((city, index) => {
        // 用真实 Unsplash 图片
        const imgUrl = `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400`;
        html += `
            <div class="card">
                <div class="scene" style="background-image: url('${imgUrl}') !important;">
                    <div class="cityname">${city.name}</div>
                </div>
                <div class="card-desc">${city.intro}</div>
            </div>
        `;
    });
    grid.innerHTML = html;
    
    // 写死标题
    document.getElementById("pageTitle").textContent = "本月热门城市排行榜（测试版）";
}

// 一打开页面就执行
window.onload = function() {
    renderCards();
    console.log("✅ 自检版 JS 成功加载！");
};

// 占位函数，防止点击报错
function goHome() { window.location.reload(); }
function setRegion() {}
function triggerSearch() {}
function openPicker() {}
function openDetail() {}
