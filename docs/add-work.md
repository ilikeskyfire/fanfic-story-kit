# 新增一部作品

本仓库的多作品机制是「共用查看器 + 每作品独立数据」。新增作品不需要改 `_shared/` 的任何代码，只需添加一个作品目录并在 `works.js` 注册。

## 步骤

### 1. 建目录

以「新作品」为例（目录名建议用中文作品名）：

```bash
mkdir -p 新作品/content/10-story 新作品/content/20-characters
cp 绝区零/build.py 新作品/build.py
```

### 2. 写作品元信息 `新作品/work.json`

```json
{
  "name": "新作品",
  "en": "English Name",
  "kicker": "Fanfic Story Kit / XXX",
  "sub": "主线 · 角色 · 世界观 · 时间线",
  "intro": "一句话介绍这部作品与收录范围。",
  "updated": "2026-11",
  "footer": "同人创作参考，版权归米哈游所有。",
  "home": "../index.html"
}
```

### 3. 复制作品入口 `新作品/index.html`

复制 `绝区零/index.html`，只需改三处：
- `<title>` 改为作品名；
- `.mobile-title` 文本改为作品名；
- 保留 `<head>` 里的防主题闪烁脚本、`data.js` 与 `../_shared/viewer.js` 两个 `<script>`，以及两个 `data-theme-toggle` 按钮。

### 4. 写内容

按 [content-format.md](content-format.md) 编写：
- `content/00-worldview.md`（可选）
- `content/01-timeline.md`（可选）
- `content/10-story/*.md`（主线，建议至少有）
- `content/20-characters/*.md`（角色）

### 5. 构建

```bash
cd 新作品
python3 build.py        # 生成 data.js
node --check data.js    # 校验
```

### 6. 注册到作品列表

编辑根目录 `works.js`，在 `window.WORKS` 数组追加：

```js
{
  id: "xxx",
  name: "新作品",
  en: "English Name",
  initial: "新",            // 卡片左侧单字
  color: "#ffd60a",        // 卡片主题色（accent）
  desc: "一句话描述。",
  path: "新作品/index.html",
  status: "已收录……",
  updated: "2026-11"
}
```

### 7. 本地验证

- 直接双击根目录 `index.html`，确认新作品卡片出现并能进入。
- 进入作品后检查：主线章节顺序、角色列表、时间线、世界观、搜索与亮 / 暗切换。
- 也可用静态服务器：`python3 -m http.server` 后访问 `http://localhost:8000/`。

### 8. 提交与部署

```bash
git add -A
git commit -m "feat: add <作品名> story kit"
git push origin main
```

仓库通过 GitHub Pages 发布根目录，`main` 更新后线上约 1–2 分钟生效；`.nojekyll` 已存在，无需额外配置。

## 注意

- `data.js` 是构建产物，**不要手改**，改内容请改 Markdown 后重新构建。
- `_shared/viewer.css` 与 `viewer.js` 为所有作品共用，改动会影响全部作品，请谨慎。
- 主题偏好通过 `localStorage` 的 `storykit-theme` 全站共享，新作品只要保留入口里的脚本与按钮即可自动支持亮 / 暗切换。
