# HHACMOJ 未出题清单（在线版）

一个自动更新的网页：显示 HHACMOJ 题库中**基础语法范围内、从未在任何作业中出现过**的题目。
数据由云端定时抓取，学生打开网址即可查看，**无需安装任何东西，无需登录**。

---

## 它是怎么工作的

```
GitHub Actions（每 4 小时）
        │
        ├─ 抓取 oj.hhacm.pw 题库列表（690 题 / 7 页）
        ├─ 抓取 oj.hhacm.pw 作业列表（页面内嵌 JSON，含每份作业的 pids）
        ├─ 求差集 → 得出「未出过」的题目
        └─ 写入 data.json 并提交回仓库
                │
                ▼
        GitHub Pages 托管 index.html + data.json
                │
                ▼
        学生打开网址 → 页面读取 data.json 渲染表格
```

**为什么要服务端环节？**
因为 `oj.hhacm.pw` 没有开放 CORS，浏览器直接请求 OJ 会被拦截。
所以抓取必须在云端做（Actions），页面只读自己域名下的 `data.json`。

---

## 部署步骤（5 步，约 5 分钟）

### 1. 建一个 GitHub 仓库

打开 https://github.com/new

- **Repository name**：随便起，比如 `hhacm-unsolved`
- **Public**（必须公开，否则免费的 Pages 用不了；公开也没关系，里面没有敏感信息）
- 勾选 **Add a README file**
- 点 **Create repository**

### 2. 上传本目录的文件

在本目录里，把这些文件/文件夹拖进 GitHub 网页的上传区：

```
index.html
scrape.mjs
preview.mjs
README.md
.github/workflows/update.yml      ← 注意 .github 是隐藏文件夹
```

> 上传方式：仓库页面 → **Add file** → **Upload files** → 把文件拖进去 → **Commit changes**
>
> ⚠️ `.github` 是隐藏目录，Windows 资源管理器里要先开启
> 「查看 → 显示 → 隐藏的项目」才能看到。
> 如果网页上传不方便，也可以用 Git 命令推送。

### 3. 打开 Actions 权限

仓库 → **Settings** → **Actions** → **General** →

- 找到 **Workflow permissions**
- 选 **Read and write permissions**
- 点 **Save**

> 这一步很关键。不设置的话，工作流无法把 `data.json` 提交回仓库。

### 4. 启用 GitHub Pages

仓库 → **Settings** → **Pages** →

- **Source** 选 **Deploy from a branch**
- **Branch** 选 **main**，目录选 **/ (root)**
- 点 **Save**

稍等 1~2 分钟，页面顶部会显示你的网址，形如：

```
https://你的用户名.github.io/hhacm-unsolved/
```

### 5. 手动跑一次工作流

仓库 → **Actions** 标签 → 左侧选 **更新未出题清单** → 右侧 **Run workflow** → **Run workflow**

等约 1 分钟跑完，会看到 `data.json` 被提交进仓库。

**然后打开第 4 步的网址，就能看到清单了。** 🎉

---

## 之后怎么维护

**基本不需要维护。**

- 工作流每 4 小时自动跑一次，`data.json` 自动更新，网址上的数据跟着变
- 想立刻更新：Actions → Run workflow
- 学生把网址收藏即可，手机上也能看

### 想改刷新频率

编辑 `.github/workflows/update.yml` 里的 cron：

```yaml
- cron: '0 */4 * * *'     # 每 4 小时
```

常用写法：

| 写法 | 含义 |
| --- | --- |
| `0 * * * *` | 每小时 |
| `0 */2 * * *` | 每 2 小时 |
| `0 0 * * *` | 每天 0 点（UTC，即北京 8 点） |
| `0 22 * * *` | 每天 UTC 22 点 = 北京 6 点 |

> 注意：GitHub 的定时任务在高峰期可能延迟，不是精确到分钟。
> 频繁刷新没有意义，4 小时足够——作业不是每分钟都在建。

### 想改筛选范围

编辑 `scrape.mjs` 顶部：

```js
const MIN_CH = 2;    // 起始章（一本通）
const MAX_CH = 16;   // 结束章
```

改成 `1` 和 `999` 就是整个题库不限基础语法。改完提交，下次工作流生效。

---

## 本地预览（可选）

想在部署前看看效果：

```bash
node preview.mjs            # 复用已有 data.json，秒开
node preview.mjs --fresh    # 先重新抓取一次数据
```

然后打开 `http://127.0.0.1:8788`。

> ⚠️ **不能直接双击 `index.html`**。浏览器会以 `file://` 协议打开，
> 出于安全限制无法读取 `data.json`，页面会报错。必须通过 HTTP 服务访问。

> 本地运行时若出现 `debug.log`，那是 Node 运行环境的崩溃报告器日志，
> 与项目无关，已被 `.gitignore` 忽略。GitHub 上不会产生。

---

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 网页界面（GitHub Pages 的入口） |
| `scrape.mjs` | 抓取 + 计算，生成 `data.json` |
| `data.json` | 数据文件，由 Actions 每 4 小时自动更新并提交 |
| `.github/workflows/update.yml` | 定时任务定义 |
| `preview.mjs` | 本地预览用的简易 HTTP 服务 |
| `.gitignore` | 忽略本地临时文件 |

---

## 页面功能

- 按章节分组展示，每章显示题数
- **搜索**：题号 / 标题 / pid 都能搜
- **筛选**：按章节
- **排序**：教材顺序 / pid / 通过率（低→高，方便挑简单题）
- **一键复制**：复制全部（或当前筛选后的）pid，直接粘到 OJ 作业创建页
- **每题直达**：点「打开 ↗」直接跳到 OJ 题目页
- **打印友好**：Ctrl+P 可存成 PDF 或打印（工具栏自动隐藏）
- 响应式，手机上可用

### 带条件的分享链接

支持 URL 参数，可以把筛选后的结果直接分享：

```
https://你的网址/?ch=9              只看第 9 章
https://你的网址/?q=字符串          搜索「字符串」
https://你的网址/?sort=rate         按通过率排序
```

---

## 已知限制

| 限制 | 说明 |
| --- | --- |
| 数据有延迟 | Actions 每 4 小时跑一次，新作业最多 4 小时后才反映到页面上 |
| 部分题目无难度 | OJ 里第 12 章之后大量题目**没有填难度**，页面显示为 `—`，这是站点数据本身如此 |
| 依赖 GitHub | 中国大陆访问 `github.io` 有时较慢，但一般可用 |
| 仅覆盖公开数据 | 只统计「作业」出过的题；如果某题是通过其他方式（如比赛）出过的，不会被排除 |

---

## 技术细节

- **Node 版本**：18+（Actions 里用 20）
- **零依赖**：只用 Node 内置的 `fetch`，不需要 `npm install`
- **容错**：
  - 工作流会校验 `data.json` 的完整性，题库数量异常（<100）会直接失败，避免把坏数据推上去
  - 抓取失败时不会提交，页面保持上一次的好数据
  - 数据无变化时不产生空提交
- **防目录穿越**：`preview.mjs` 做了路径校验
