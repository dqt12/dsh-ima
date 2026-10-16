# dsh-ima

> 把腾讯 [ima](https://ima.qq.com) 的知识库接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：侧边栏浏览知识库，**agent 能自动检索并读取库内文件**。

[English](#english) · 简体中文

---

## 它解决什么问题

你在 ima 里攒了很多资料（文档、笔记、网页、录音转写…），但对话里的 agent 看不见——每次都要手动复制粘贴。

装上这个插件后：

- **侧边栏多一个「知识库 ima」**：左目录、右文件地浏览，点击直接预览
- **agent 自动知道有这个知识库**：每轮对话开头会把库清单注入上下文，模型知道「这儿有资料可查」
- **按正文内容搜索**：不记得文件叫什么名？问「我的资料里提到过 X 吗」，agent 自己去搜

## 功能一览

| 能力 | 说明 |
|---|---|
| 绑定 | 一键绑定：自动打开浏览器让你登录 ima，其余全自动，不需要复制粘贴 |
| 浏览 | 全部 / 共享 / 个人 三类筛选，多层文件夹 + 面包屑 |
| 预览 | PDF、Word、Excel、PPT、图片、音视频、Markdown、XMind 等在面板内直接看 |
| 文件图标 | 按类型上色徽章（PDF 红 / Word 蓝 / Excel 绿 / 播客 粉…） |
| 网页类 | 网页、微信文章点击直接在新窗口打开原文 |
| 引用到对话 | 文件一键交给 agent 读取 |
| Agent 工具 | 5 个工具，含**按正文内容搜索** |
| 上下文注入 | 模型每轮自动看到知识库清单，主动去查 |

## 安装

### 方式一：clone 到插件目录（推荐）

```bash
git clone https://github.com/ikevssy/dsh-ima.git ~/.dsh/plugins/dsh-ima
```

然后把插件挂到你的 profile 上。以 `web` 为例：

**1. `~/.dsh/profiles/web/package.json`** —— 加依赖和 bundle：

```jsonc
{
  "dependencies": {
    "dsh-ima": "file:../../plugins/dsh-ima"   // ← 新增
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...原有内容...
        "dsh-ima"                               // ← 新增
      ]
    }
  }
}
```

**2. `~/.dsh/profiles/web/cordis.patch.yml`** —— 文件末尾加一段：

```yaml
- insert:
    - id: dsh-ima
      name: dsh-ima
```

**3. 把插件文件拷进 profile 的 node_modules**（不要用 `pnpm add`，容易搞坏 profile 的依赖解析）：

```bash
mkdir -p ~/.dsh/profiles/web/node_modules/dsh-ima
cp ~/.dsh/plugins/dsh-ima/{package.json,cordis.patch.yml} ~/.dsh/profiles/web/node_modules/dsh-ima/
cp ~/.dsh/plugins/dsh-ima/lib/*.js ~/.dsh/profiles/web/node_modules/dsh-ima/lib/
```

**4. 重启 DSH。**

### 桌面端（DeepSeek Harness Desktop）

同样三步，只是 profile 目录换成 `~/.dsh/profiles/desktop`：

```bash
# 1. 改 ~/.dsh/profiles/desktop/package.json（加 dependencies + bundles，同上）
# 2. 改 ~/.dsh/profiles/desktop/cordis.patch.yml（加 insert 段，同上）
mkdir -p ~/.dsh/profiles/desktop/node_modules/dsh-ima
cp ~/.dsh/plugins/dsh-ima/{package.json,cordis.patch.yml} ~/.dsh/profiles/desktop/node_modules/dsh-ima/
cp ~/.dsh/plugins/dsh-ima/lib/*.js ~/.dsh/profiles/desktop/node_modules/dsh-ima/lib/
# 3. 重启桌面端
```

> ⚠️ desktop profile 由桌面端独占管理，命令行 `dsh --profile desktop` 会拒绝启动——这是正常的。

## 绑定 ima 账号

1. 打开侧边栏「知识库 ima」→ 点「一键绑定 ima 账号」
2. 会自动弹出一个浏览器窗口，已打开 ima 授权页
3. **登录**（唯一需要你做的事）
4. 自动完成绑定，面板刷出知识库

> **备用方式**（没有 Chrome/Edge 时）：点「都试过了还是不行？」，打开 ima 授权页 → 点第 1 步的**「一键复制」**→ 回到插件，会自动识别。
> 注意：API Key **不在页面上显示**，藏在「一键复制」复制出来的那段文字里。

## Agent 工具

插件注册 5 个工具，模型按需调用：

| 工具 | 用途 |
|---|---|
| `ima_search_files` | **按正文内容搜索文件**（最常用）——不知道文件叫什么、想找"哪些资料提到过 X"时用 |
| `ima_list_knowledge_bases` | 列出全部知识库 |
| `ima_search_knowledge_bases` | 按关键词搜知识库（匹配库名/描述） |
| `ima_list_kb_files` | 列出某个库里的文件和文件夹 |
| `ima_read_file` | 读取文件正文（文本直接返回，二进制返回下载直链） |

### 上下文注入

插件在每轮对话的第一步，会把知识库清单注入模型上下文（10 分钟内不重复注入）：

```
[ima 知识库] 用户已连接 ima 知识库，下面这些库可以直接搜：
· 我的笔记（个人）
· 项目文档（共享）
...
· 找"哪份资料提到过 X" → ima_search_files
· 想浏览某个库里有啥 → ima_list_kb_files
· 读全文 → ima_read_file
```

所以模型会**主动去查**，而不是说"我看不到你的资料"。

## 架构

```
dsh-ima/
├── lib/
│   ├── index.js        宿主半：agent 工具 + 上下文注入 + /api/ima/* 路由
│   ├── ima-client.js   ima OpenAPI 客户端
│   ├── ima-browser.js  浏览器自动化取凭证（CDP，零依赖）
│   └── client.js       浏览器半产物（由 build/ 生成，已随仓库提供）
├── build/
│   ├── client.src.js   界面逻辑源码
│   ├── viewer.src.js   预览引擎配置
│   └── build.mjs       构建脚本（esbuild）
└── cordis.patch.yml    bundle patch
```

**两半设计**：宿主半跑在 Node 里（工具、HTTP 路由），浏览器半跑在 DSH 页面里（侧边栏面板、预览）。两者通过同源的 `/api/ima/*` 通信。

> 为什么要有 HTTP 路由？因为 ima 的接口**不返回 `Access-Control-Allow-Origin`**，浏览器直连会被 CORS 拦死。只能由宿主半代理。

## 开发

```bash
cd ~/.dsh/plugins/dsh-ima
npm install          # 构建依赖（约 400MB，仅开发时需要）
npm run build        # 重新生成 lib/client.js
npm test             # ima-client 冒烟测试
```

改 `build/client.src.js` → `npm run build` → 把 `lib/client.js` 拷进各 profile 的 node_modules → 刷新页面。
改 `lib/index.js` 等宿主半 → 拷进 profile → **重启 DSH**。

> `lib/client.js` 是构建产物，已随仓库提供，**普通用户不需要构建**，clone 下来即可使用。

## 预览能力

内置 [open-file-viewer](https://github.com/xushanpei/open-file-viewer)（MIT）做纯前端渲染：

| 类型 | 预览方式 |
|---|---|
| PDF | 浏览器原生 |
| Word / Excel / PPT | docx-preview / xlsx 纯前端渲染 |
| 图片 | 直接渲染 |
| 音视频 | 内置播放器 |
| Markdown / 文本 / 思维导图 | 内置渲染 |

> 小技巧：ima 的文件标题常常**没有扩展名**（例如播客标题就是一段描述）。插件会从文件真实地址里取扩展名补上再交给预览引擎，否则会误报"不支持预览"。

## 已知边界

| 项 | 说明 |
|---|---|
| 订阅知识库 | ima 产品策略不开放读取（错误码 220030），默认不显示 |
| 知识库列表 | 单页上限 20 个 |
| 浏览器要求 | 一键绑定需要本机有 Chrome 或 Edge；没有会自动降级到手动方式 |
| API Key | 有效期一年，到期需重新绑定 |
| 桌面端 | 插件支持，但 desktop profile 由桌面端独占管理 |

## 致谢

- [open-file-viewer](https://github.com/xushanpei/open-file-viewer) —— 提供纯前端文档预览能力
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 插件宿主

---

<a name="english"></a>

## English

**dsh-ima** connects [Tencent ima](https://ima.qq.com) knowledge bases to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

- Browse your ima knowledge bases from a sidebar panel (folders, file preview, colored type badges)
- **The agent automatically knows your knowledge base exists** — a short summary is injected into the model context at the start of each turn
- **Full-text search** — ask "does anything I saved mention X?" and the agent searches inside your documents
- 5 agent tools: `ima_search_files`, `ima_list_knowledge_bases`, `ima_search_knowledge_bases`, `ima_list_kb_files`, `ima_read_file`
- One-click binding: a browser opens the ima login page, everything else is automatic

See the Chinese section above for installation steps. Licensed under MIT.

---

## License

[MIT](./LICENSE) © 2026 ikevssy
