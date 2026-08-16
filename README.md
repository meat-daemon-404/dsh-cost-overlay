# dsh-cost-overlay — DeepSeek 费用悬浮条

DeepSeek Harness Web GUI 插件：在屏幕**正上方中间**悬浮显示当前模型的 DeepSeek
API 单价（元/百万 token，区分高峰/空闲时段与缓存命中/未命中），并按当前会话的
**真实 token 用量**（输入/输出/缓存命中）实时累计显示本会话花费。数据全部来自
DSH 运行时，无需 API Key。

## 功能

- **顶部悬浮条**：当前模型 + 时段徽标（高峰/空闲/平峰）+ 当前单价（命中/未命中/输出）
  + 本会话累计花费 + 缓存命中率；点击展开详情面板。
- **真实用量计价**：从会话事件折叠每次模型调用的精确 token 用量（含缓存命中
  拆分），按每条消息实际使用的模型分账累计；中途切换模型（flash → pro）自动
  分账，切换价格体制（平峰 → 峰谷）自动按事件发生时刻计价。
- **峰谷定价**：内置 DeepSeek 官方价格表（2026-08-16 采集）。高峰时段为本地
  时间 9:00–12:00、14:00–18:00，其余为空闲时段（空闲价 = 高峰价一半）；
  平峰体制于 2026-08-17 00:00（北京时间）自动切换为峰谷体制，悬浮条在时段
  边界自动更新单价。
- **刷新可恢复**：花费随会话累计，刷新页面后从会话历史重新计算，不丢失。
- **设置**：总开关、价格表逐格覆盖（保存后本会话花费自动按新价格重算）、
  「重新计算」按钮。
- **非 DeepSeek 模型**：自动隐藏悬浮条。

## 官方价格（元/百万 token，2026-08-16 采集）

| 模型 | 时段 | 缓存命中 | 未命中 | 输出 |
| --- | --- | --- | --- | --- |
| deepseek-v4-flash | 平峰（8/17 前） | 0.02 | 1.0 | 2.0 |
| deepseek-v4-flash | 空闲（8/17 起） | 0.05 | 1.5 | 4.5 |
| deepseek-v4-flash | 高峰（8/17 起） | 0.10 | 3.0 | 9.0 |
| deepseek-v4-pro | 平峰（8/17 前） | 0.025 | 3.0 | 6.0 |
| deepseek-v4-pro | 空闲（8/17 起） | 0.15 | 4.5 | 13.5 |
| deepseek-v4-pro | 高峰（8/17 起） | 0.30 | 9.0 | 27.0 |

价格来源：[DeepSeek 官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。
官方调价后可在插件设置中覆盖，无需改代码。

## 架构

- **host 半边**（`src/index.ts`）：注册 `deepseekCost` 会话投影（折叠
  `request/header` 取模型、`assistant/chunk` / `assistant/message` 取精确用量，
  按模型分账并计价），注册插件设置区，提供 loopback-only 的重新计算路由。
- **计价**（`src/core/pricing.ts`）：纯函数价格模型，host 与浏览器共享。
- **浏览器半边**（`src/client/`）：顶部悬浮条（fixed portal，读当前会话的
  `deepseekCost` 投影，事件驱动刷新 + 时段定时器）、设置卡（`web-ui.plugin.item`
  槽位）。

## 安装

```sh
pnpm install && pnpm build && pnpm pack
```

将生成的 `dsh-cost-overlay-0.1.0.tgz` 加入 DSH web profile：

```json
{
  "dependencies": { "dsh-cost-overlay": "file:/abs/path/dsh-cost-overlay-0.1.0.tgz" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-cost-overlay" ] } }
}
```

在 profile 目录执行 `pnpm install`，重启 `dsh web` 后生效。插件行由包内
`cordis.patch.yml` 插入，不修改 DSH 源码。

## 开发

```sh
pnpm install      # 依赖（store/cache 均指向 D 盘）
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest（计价 + 投影折叠单测）
pnpm build        # tsc 声明 + tsdown（lib/index.js + lib/client.js）
```

## 已知限制

- 时段按机器本地时区判断（官方口径为北京时间，机器在中国时二者一致）。
- 一条消息跨时段边界时按用量结算时刻的时段计价（DeepSeek 计费口径的近似）。
- 价格表内置为官方 2026-08-16 采集值；官方调价后请在设置中更新。

## License

Apache-2.0
