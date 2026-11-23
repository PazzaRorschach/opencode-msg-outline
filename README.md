# opencode-msg-outline

OpenCode 2 TUI 插件：在会话侧边栏显示当前会话的用户消息列表，支持日期分组、滚轮浏览、点击跳转、全量历史分页和定位遮罩。

> English: a sidebar outline of user messages for the OpenCode 2 TUI, with full-history paging and click-to-jump.

## 功能

- 侧边栏常驻用户消息列表，按日期分组，显示时间与摘要
- 可视高度随终端自适应（约 10–30 行），其余历史用滚轮浏览；新消息保持在底部
- 通过服务端分页拉取完整用户消息历史，不依赖会话界面已加载的消息窗口
- 点击消息跳转到对应位置；目标不在本地消息窗口时，先在遮罩后分页加载，再定位
- `Alt+U`、`/outline`（别名 `/messages`、`/msgs`）或命令面板切换列表显隐
- 显隐状态持久化，重启 TUI 后保留
- 配色跟随 OpenCode 当前主题，切换主题时同步更新
- 再次点击已选中的消息可取消选中

## 时间与摘要布局

日期分组标题只显示一次 `MM-DD`（跨年时显示 `YYYY-MM-DD`），每条消息行内只保留 `HH:MM`：

```text
◆ 用户消息列表 (77)
────────────────
── 11-23 ──
17:08 ─ 这条消息的摘要内容……
17:09 ─ 另一条消息的摘要……
```

这样“月日 + 时间”信息仍然完整（日期看分组标题，时间看行首），但每条消息的摘要可以占满剩余宽度，不会被 `MM-DD HH:MM` 挤压。侧边栏较窄时，摘要会自动收窄（最多 32 列），不会换行。

## 安装

直接从 GitHub 安装（当前仓库已打包为可加载的 server + TUI 插件）：

```sh
opencode plugin add github:PazzaRorschach/opencode-msg-outline
```

需要固定版本时使用 tag：

```sh
opencode plugin add github:PazzaRorschach/opencode-msg-outline#v0.0.1
```

本地开发时也可以直接把目录加入全局 `opencode.json`：

```jsonc
{
  "plugins": [
    "/absolute/path/to/opencode-msg-outline"
  ]
}
```

发布到 npm 后也可以通过包名安装：

```sh
opencode plugin add opencode-msg-outline
```

该包同时提供 server 和 TUI 入口，因此 CLI 会把它写入全局 `opencode.json` 的 `plugins`，TUI 部分会自动加载。

## 使用

| 方式 | 操作 |
| --- | --- |
| 快捷键 | `Alt+U` |
| 命令面板 | `Ctrl+P` → “切换用户消息列表” |
| 斜杠命令 | `/outline`，别名 `/messages`、`/msgs` |

键位可以在 `cli.json` 中改：

```json
{
  "keybinds": {
    "msg-outline.toggle": "alt+u"
  }
}
```

## 选项

```jsonc
{
  "plugins": [
    {
      "package": "opencode-msg-outline",
      "options": {
        "scroll": true,
        "scrollStep": 3
      }
    }
  ]
}
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `visibleRows` | 自动 | 滚动区行数；不设置时按终端高度自适应（10–30 行），设置后固定 |
| `scroll` | `true` | 设为 `false` 时退回“只显示最新 N 条”的静态模式 |
| `scrollStep` | `3` | 每格滚轮移动的行数；长会话更容易翻 |

## 配色

面板直接读取 OpenCode 当前主题的语义色，不写死配色：

| 用途 | 主题 token |
| --- | --- |
| 标题、选中标记 | `background.action.primary.focused` |
| 消息摘要 | `text.base` |
| 时间、日期标题 | `text.muted` |
| 分隔线 | `border.base` |
| 遮罩背景 | `background.base` |

在 `tokyonight` 主题下分别对应 `#82aaff`、`#c8d3f5`、`#828bb8`、`#737aa2`、`#1a1b26`，与 OpenCode 自己的主题选择器一致。切换主题后 TUI 会重绘，面板颜色同步变化，不需要重载插件。

## 结构

```text
src/
  index.ts               server 壳（只注册 id）
  tui.tsx                TUI 入口：命令、slot、状态、遮罩
  theme.ts               当前主题色读取
  options.ts             选项读取与边界处理
  types.ts               消息/条目/选项类型
  lib/
    cache.ts             面板重挂载用的会话快照
    format.ts            终端宽度、截断、日期与时间格式
    messages.ts          用户消息判定、摘要、条目、分组
    history.ts           本地消息窗口、服务端分页、目标消息加载
    jump.ts              点击跳转与渲染等待
    model.ts             侧边栏状态机（本地增量 + 服务端全量）
  components/
    Panel.tsx            侧边栏列表与滚动区
    Mask.tsx             全屏定位遮罩
```

数据刷新策略：

1. 本地消息缓存负责实时增量；`createMemo` 的结构比较会忽略 assistant 流式更新。
2. 首次进入和 undo 触发全量分页；正常新增只从最新页拉到第一个已知条目。
3. 60 秒低频轮询只做最终一致性兜底。
4. 分页优先带 `type: "user"` 让服务端只返回用户消息；服务端不接受时自动退回无过滤请求。

## 兼容性

- OpenCode `>= 2.3.2`
- OpenTUI `>= 0.8.4`
- `@opencode/plugin` `2.3.2`
- `solid-js` `^1.9.12`

## 已知限制

- 跳转复用 OpenCode 内置命令 `session.messages_last_user` 和 `session.message.user.previous`；纯附件、无文本的消息无法单独定位，会落到上方最近一条可定位的文本消息。
- 很老的消息需要先分页加载；加载期间会显示全屏遮罩。
- 单会话最多回溯 40 页（每页 200 条）；极端超长会话会保留最近约 8000 条用户消息。
- 侧边栏宽度由 OpenCode 决定，摘要会在 12–32 列之间自适应。
- OpenCode 2.3.x 不会为插件自有的 Solid 更新主动排帧，所以数据或选中态变化时插件会重建 `sidebar.content` 的 slot claim，用一次新鲜挂载刷新面板。滚动位置会尽量保留；如果原来就在底部，则继续跟随最新消息。

## 开发

```sh
npm install
npm run typecheck
```

## 许可

MIT。
