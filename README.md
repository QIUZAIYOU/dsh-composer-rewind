# 提示词历史 · Prompt Vault

给 DeepSeek Harness Web UI 的输入框加一份「本地草稿历史」：你在输入框里写下的内容会被静默留存，写错了、清空了、刷新了、切会话了，都能一键找回。

它是一个 Cordis 插件包（Host 半边为空壳，界面全部由 Client 半边渲染），装在 Harness 里就是输入框工具行上的一枚小按钮。

## 装了什么

| 位置 | 作用 |
| --- | --- |
| `conversation.input.left` | 输入框工具行左侧一枚历史按钮（带条数角标），旁边一个不可见的记录器 |
| `shell.overlay` | 点击按钮后浮出的居中面板：搜索、插入、复制、删除、清空 |

## 行为

记录分两层，这是这个插件最核心的设计：

- **当前草稿（live）**：始终只有一条，原地覆盖。停手约 620ms 后写一次，所以刷新、崩溃、标签页被杀，回来都能看到刚才写到一半的内容。
- **历史条目（history）**：只收「被放弃的整条草稿」——发出去、手动清空、切换会话、关闭页面，这四种时机各提交一次。**逐字输入不会产生条目**，否则删词时光标每退一格就会留下一条残句。
- **前缀合并**：新草稿是上一条的延续（或上一条是新草稿的前缀，10 分钟内）时，合并进同一条而不是新增，历史里只留下最终形态。
- **垃圾过滤**：单个字符、无空格无标点的短英文字母串（输入法误切英文再逐字删除的典型产物）直接丢弃；中文、带空格或标点的句子一律保留。
- **上限**：最多 300 条，超出丢最旧；完全相同的文案不重复，重复出现时提到最前。
- **插入**：把历史内容写回输入框，**不会自动发送**，可以改完再发。

## 快捷键

- `Ctrl+Alt+Z`：把上一条历史写回输入框。连按会继续往上翻（第 2 条、第 3 条……），自己重新打字后再按则从最新一条重来。面板打开时该快捷键让位给面板。
- 面板内：`↑` / `↓` 选择、`Enter` 插入、`Esc` 关闭，搜索框有焦点时同样生效。

## 主题适配

- 面板、按钮、输入框、浮层阴影全部跟随 Harness 的浅色 / 深色主题实时切换：运行时读取根元素的 `color-scheme` 与首个绘制表面的亮度判定当前主题，再每 2 秒与 DOM 变动时复查一次，不依赖操作系统的 `prefers-color-scheme`。
- 颜色只取 Theme Provider 公布的 `--dsw-alias-*` token；需要半透明层次的地方用 `color-mix()` 按 `label-primary` 调百分比，两层主题各自得到正确的深浅。
- 触发按钮用 `all:unset` 抹掉宿主按钮样式，图标用 `currentColor` 描边（不填色），因此在任何主题下都不会变成白块。

## 数据存在哪

浏览器 `localStorage`：

| 键 | 内容 |
| --- | --- |
| `dsh-prompt-vault:v2` | 历史条目数组 |
| `dsh-prompt-vault:live` | 当前未提交的草稿（单条） |
| `dsh-prompt-vault:v1` | 旧版本的原始记录，仅在首次升级时读取一次并清洗迁移 |

数据只在这台机器、这个浏览器配置里，不上传、不写日志、不进会话记录。面板里的「清空」会清掉历史条目。

> 已知取舍：`localStorage` 是**每个 Web GUI origin 一份**。换端口（`127.0.0.1:54798` → 别的端口）会被浏览器当成另一个站点，历史不共享；换浏览器同理。

## 已知限制

1. **不在 Host 侧持久化**：数据在页面 `localStorage`，清浏览器站点数据会一起清掉；Host `ctx.storage` 接入留作 Roadmap。
2. **只在 Harness composer 里工作**：拿的是 `conversation.input.left` 的 `useInput` / `inputActions`，不监控别的输入框。
3. **面板是居中浮层**：挂在 `shell.overlay`，不随输入框位置浮动。
4. **快捷键是页面级监听**：Harness 没有给插件留全局热键位，所以只用 `document` 上的 keydown 捕获；焦点不在这个页面时（比如切到别的应用）不生效。
5. **没有渲染自检**：开发环境没有可控浏览器，样式与交互靠静态检查 + vm 沙箱行为测试验证，观感以刷新后的界面为准。

## 开发

仓库：`https://github.com/QIUZAIYOU/dsh-prompt-vault`

```
# 安装到当前 Harness profile
plugin_manager install_bundle  target=D:\Github\dsh-prompt-vault

# 改完 client.js 后
node --check client.js        # 语法
node tools/check.mjs          # 静态检查：token 白名单、无硬编码色、图标描边、快捷键、文件清单
node tools/logic-test.mjs     # 行为测试：垃圾过滤、前缀合并、live 覆盖、v1 迁移、快捷键翻页
```

`tools/logic-test.mjs` 用 `node:vm` 在沙箱里加载真实的 `client.js`，用假 `window` / `localStorage` / `react` 驱动存储层，不需要浏览器。

改完刷新 Web GUI 页面即可生效（client 插件按模块加载；只有 `pnpm run dev:web` 在跑时才会免刷新热更）。

## 设计取舍

- **为什么是插件而不是浏览器扩展**：目标是 Harness 自己的输入框（slot + composer 状态），扩展拿不到 `inputActions.setDraft`，只能模拟键盘，不可靠。
- **为什么记「放弃的草稿」而不是每次停顿**：早先版本每 900ms 把当前内容存成一条，结果输入法误切英文后逐字删除，留下了 `l / li / liu…` 一串残句。改为「整条草稿退役时才入库」后，中间态只存在于 live 快照里，历史里只有完整意图。
- **为什么先 localStorage**：Host `ctx.storage` 只挂了 backend、没有现成 form，接入要自己定 backend 名与 schema；先用页内存储把行为做对。
- **为什么 Host 半边是空壳**：目前没有需要在 Host 跑的逻辑；保留 `apply()` 是为了将来挂 `prompt_vault` 工具给 Agent 读同一份历史。

## Roadmap

- [ ] Host 侧 `ctx.storage` 持久化 + 跨设备同步（可选）
- [ ] 暴露 `prompt_vault` Agent 工具（列表 / 读取 / 恢复某条草稿）
- [ ] 面板按会话分组、置顶、标签
- [ ] 可配置「发送时也留档」与历史容量
