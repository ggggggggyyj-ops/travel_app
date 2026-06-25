// ==========================================
// 1. 引入必要的库
// ==========================================
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// 设置安全头 (CSP)
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "img-src * data: blob: 'self' 'unsafe-inline'");
    next();
});

// ==========================================
// 2. 静态文件服务 (修复了 Render 部署路径问题)
// ==========================================
// 正确指向当前目录下的 frontend 文件夹
const frontendPath = path.join(__dirname, 'frontend');
app.use(express.static(frontendPath));

// 使用 '*' 匹配所有前端路由，防止页面刷新导致 404
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==========================================
// 3. 完美代理转发接口（带浏览器伪装，破解 CORB 与防盗链）
// ==========================================
app.get('/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('Missing URL');

    try {
        // 模拟真实浏览器的请求头，骗过图床防盗链
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://my-travel-lz9w.onrender.com/'
            }
        });

        // 检查是否成功拿到图片
        if (!response.ok) {
            throw new Error(`图片服务器返回状态码 ${response.status}`);
        }

        // 拿到真正的图片二进制数据
        const buffer = await response.buffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // 把它原封不动地转发给浏览器
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);

    } catch (error) {
        console.error("代理下载图片失败:", error.message);
        // 即使代理彻底失败，重定向到极光图占位
        res.redirect('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop');
    }
});

// ==========================================
// 4. 数据库连接配置 (Railway MySQL)
// ==========================================
const dbConfig = {
    host: 'reseau.proxy.rlwy.net',
    port: 46086,
    user: 'root',
    password: 'befRsHMKZzaXNGstRgTYuvDYzpTHcZtb',
    database: 'railway'
};

// 创建连接池
const pool = mysql.createPool(dbConfig);

// ==========================================
// 5. 定义 API 接口
// ==========================================

// 接口 1：获取首页排行榜 (Top 30)
app.get('/api/top30', async (req, res) => {
    try {
        const region = req.query.region || 'all';
        const sqlQuery = `
            SELECT * FROM cities 
            WHERE (region = ? OR ? = 'all')
            ORDER BY score DESC LIMIT 30
        `;
        pool.query(sqlQuery, [region, region], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            res.json(results);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 接口 2：关键词搜索
app.get('/api/search/keyword', async (req, res) => {
    try {
        const q = req.query.q || '';
        const region = req.query.region || 'all';
        let sqlQuery = `
            SELECT * FROM cities 
            WHERE (region = ? OR ? = 'all')
            AND (name LIKE ? OR intro LIKE ?)
            ORDER BY score DESC LIMIT 30
        `;
        const searchTerm = `%${q}%`;
        pool.query(sqlQuery, [region, region, searchTerm, searchTerm], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            res.json(results);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 接口 3：综合筛选 (预算、天数、标签)
app.get('/api/search/filter', async (req, res) => {
    try {
        const budget = parseInt(req.query.budget) || null;
        const days = parseInt(req.query.days) || null;
        const tags = req.query.tags || null;
        const region = req.query.region || 'all';
        
        let sqlQuery = `SELECT * FROM cities WHERE 1=1 `;
        let params = [];

        if (region && region !== 'all') {
            sqlQuery += ` AND region = ? `;
            params.push(region);
        }
        if (budget) {
            sqlQuery += ` AND budget <= ? `;
            params.push(budget);
        }
        if (days) {
            sqlQuery += ` AND days_min <= ? `;
            params.push(days);
        }
        if (tags) {
            const tagArr = tags.split(',');
            sqlQuery += ` AND ( `;
            tagArr.forEach((tag, index) => {
                if (index > 0) sqlQuery += ` OR `;
                sqlQuery += ` tags LIKE ? `;
                params.push(`%${tag}%`);
            });
            sqlQuery += ` ) `;
        }
        sqlQuery += ` ORDER BY score DESC LIMIT 30`;

        pool.query(sqlQuery, params, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            res.json(results);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 接口 4：城市详情页
app.get('/api/city', async (req, res) => {
    try {
        const name = req.query.name || '';
        if (!name) return res.status(400).json({ error: '缺少城市名称' });
        const sqlQuery = `SELECT * FROM cities WHERE name = ?`;
        pool.query(sqlQuery, [name], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            if (results.length === 0) {
                return res.status(404).json({ error: '未找到该城市' });
            }
            res.json(results[0]);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 接口 5：城市选择器 (Picker) 列表
app.get('/api/picker/list', async (req, res) => {
    try {
        const region = req.query.region || '国内';
        const keyword = req.query.keyword || '';
        let sqlQuery = `SELECT id, name, pinyin FROM cities WHERE region = ?`;
        let params = [region];
        if (keyword) {
            sqlQuery += ` AND (name LIKE ? OR pinyin LIKE ?)`;
            const searchTerm = `%${keyword}%`;
            params.push(searchTerm, searchTerm);
        }
        sqlQuery += ` ORDER BY name ASC`;
        pool.query(sqlQuery, params, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            res.json(results);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// 接口 6：获取城市评论
app.get('/api/comments', async (req, res) => {
    try {
        const cityName = req.query.city;
        const sortType = req.query.sort || 'hot';
        if (!cityName) return res.json([]);
        let sqlQuery = `
            SELECT username, rating, content, likes, created_at 
            FROM travel_comments 
            WHERE city_name = ?
        `;
        if (sortType === 'new') {
            sqlQuery += ` ORDER BY created_at DESC`;
        } else {
            sqlQuery += ` ORDER BY likes DESC`;
        }
        pool.query(sqlQuery, [cityName], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('数据库查询错误');
            }
            res.json(results);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('服务器错误');
    }
});

// ==========================================
// 6. 启动服务器
// ==========================================
const PORT = process.env.PORT || 3000; // 改成了兼容 Render 的端口读取
app.listen(PORT, () => {
    console.log(`🚀 后端服务器已启动！请访问：http://localhost:${PORT}`);
});