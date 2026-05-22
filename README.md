# change-image-theme

一个用于给 PNG/JPG 资源 **换主题 / 换肤** 的 Node.js CLI：用 hex 颜色映射表把品牌主色及其明暗变体整体迁到新色相，针对 **品牌重塑（rebrand）、白标、多主题皮肤** 比单纯「逐像素换色」更贴切。算法在 **OKLCH 感知色彩空间**按色相归类再旋转 hue，保留每个像素原本的感知亮度（L）与色度（C）。

- **OKLCH 色相匹配**：在感知均匀色彩空间按色相距离判定，再做 hue 旋转，保留每个像素原本的**感知亮度**（L）与色度（C）。同一 L 值在不同色相下感知亮度真正相等（HSL 做不到）
- **中性色保留**：低色度（chroma）像素（白/灰/黑）天然被跳过，文字和背景不被破坏
- **色域映射**：旋转后若落出 sRGB，按 CSS Color 4 推荐方式 **保 L 降 C**，避免明度跳变
- **平滑边界**：smoothstep 在色相半径边缘软过渡，无锐利色块
- **Alpha 完整保留**（PNG 输出）
- **批量目录处理**：默认递归 + 保留目录结构 + 多文件并发

## 安装

```bash
npm install
npm run build
# 可选：全局链接（命令行工具名为 cit）
npm link
```

发布到 npm 后包名为 `change-image-theme`；本地开发可用 `npx change-image-theme …`（与全局的 `cit` 等价，均指向同一入口）。

开发模式直接跑 TS 源码：

```bash
npm run dev -- -i input.png -o output.png -m examples/mapping.json
```

## 颜色映射表

JSON 文件，键是源色（hex），值是目标色（hex），支持 `#rgb` 和 `#rrggbb`：

```json
{
  "#514cf9": "#f05416"
}
```

> **要点**：这里写的不是"精确像素颜色"，而是品牌的**代表色相**。算法只用映射表中两端颜色的 **OKLCH 色相差** 做旋转角度，每个像素自己的明度（L）和色度（C）会被保留下来。所以纯品牌色 `#514cf9` 不一定恰好变成 `#f05416`，但它的所有明暗变体（深紫 icon、浅紫背景、品牌色按钮…）都会被一并迁移到橙色相，且 **明暗节奏保持原图风貌**。如果你需要把"恰好这一种颜色"变成"恰好那一种颜色"，本工具不是合适的选择。

## 用法

### 单文件

```bash
cit \
  -i banner.png \
  -o banner-rebrand.png \
  -m examples/mapping.json
```

### 整个目录（默认递归，保留目录结构）

```bash
cit \
  -i ./assets \
  -o ./assets-rebrand \
  -m examples/mapping.json
```

### 调整色相容差

`-r` / `--hue-radius` 控制"多近的色相视为同一品牌色"，单位为度（0–180）：

```bash
# 只换非常接近源色相的像素（保守）
cit -i in.png -o out.png -m map.json -r 15

# 默认：能覆盖品牌色变体，不波及邻近色相
cit -i in.png -o out.png -m map.json

# 连邻近色相也调换（宽松）
cit -i in.png -o out.png -m map.json -r 60
```

### 中性色保留阈值

`-t` / `--chroma-threshold` 默认 `0.04`，**OKLCH 色度** 低于该值的像素被视为中性色保留。OKLCH 的色度典型范围是 0–0.4（sRGB 色域内），白/灰/黑都接近 0。如果你的品牌色变体里有非常浅的色调被误判为中性色，可以调小该值：

```bash
cit -i in.png -o out.png -m map.json -t 0.02
```

特殊场景：如果你确实要把白/灰也换掉，用 `--no-preserve-neutrals`：

```bash
cit -i in.png -o out.png -m map.json --no-preserve-neutrals
```

### 内联 JSON 映射

```bash
cit -i in.png -o out.png -m '{"#514cf9":"#f05416"}'
```

### 详细输出

```bash
cit -i in.png -o out.png -m map.json -v
```

输出样例：

```
OK  banner1.png (1200x720, affected 857302/858480 (skipped: neutral=263, far=743, transparent=172))
     #514cf9: 857302 px
```

## 全部 CLI 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `-i, --input <path>` | – | 输入文件或目录（必填） |
| `-o, --output <path>` | – | 输出文件或目录（必填；输入为目录时此项必须是目录） |
| `-m, --map <jsonOrPath>` | – | 映射表：JSON 文件路径，或以 `{` 开头的内联 JSON |
| `-r, --hue-radius <degrees>` | `30` | OKLCH 色相距离半径（0–180°），范围内的像素会向目标色相旋转，边缘 smoothstep 衰减 |
| `-t, --chroma-threshold <number>` | `0.04` | OKLCH 色度低于此值的像素视为中性色，保留不变（范围 0–0.5） |
| `--no-preserve-neutrals` | – | 禁用中性色保留 |
| `--no-recursive` | – | 目录模式下关闭递归 |
| `-c, --concurrency <number>` | CPU 核心数 | 批量并发数（目录模式） |
| `-v, --verbose` | `false` | 打印每种源色的命中数 |

## 算法详解

### 步骤

```mermaid
flowchart TD
  P["pixel (r,g,b,a)"] --> A{"alpha == 0?"}
  A -->|yes| Keep[keep original]
  A -->|no| H["rgbToOklch -> (L, C, h)"]
  H --> N{"preserveNeutrals AND<br/>C < chromaThreshold?"}
  N -->|yes| Keep
  N -->|no| F["find nearest source<br/>by hueDistance"]
  F --> R{"hueDist >= hueRadius?"}
  R -->|yes| Keep
  R -->|no| Rot["new_h = h + (target.h - source.h)<br/>(shortest path on hue circle)"]
  Rot --> Back["replaced_rgb = oklchToRgb(L, C, new_h)<br/>(gamut map: keep L, reduce C if OOG)"]
  Back --> Blend["w = 1 - smoothstep(hueDist / hueRadius)<br/>output = lerp(original, replaced, w)"]
  Blend --> Out[output pixel]
```

### 关键点

- **保留 L 与 C**：旋转 hue 时只动色相，不动感知亮度和色度。OKLCH 的 L 是 **真·感知亮度**，所以浅紫→浅橙、深紫→深橙的视觉亮度真正一致（HSL 的 L 在不同色相下感知不均，黄色看着比同 L 的蓝色亮得多）。
- **色相按最短路径旋转**：源 `h=275.5°`（OKLCH 蓝紫）→ 目标 `h=38.4°`（OKLCH 橙），shortest delta 是 `+122.9°`（顺时针经红），每个落入半径的像素都旋转同样的角度。
- **色域映射（gamut map）**：浅色 + 旋转后可能落出 sRGB（OKLCH 是 sRGB 的超集）。算法采用 CSS Color Level 4 推荐策略：**保 L 不变，二分降 C** 直到入色域，再做线性 sRGB → sRGB 转换。结果是色度略微下降但明度准确，避免"保 C 降 L"带来的明暗错乱。
- **smoothstep 边缘衰减 + sRGB 混合**：在 hue 距离 `t = hueDist / hueRadius` 上用 `1 - smoothstep(t)` 计算权重，最终结果是原始 sRGB 与"旋转后 sRGB"的线性插值。
- **中性色判定**：OKLCH 的 C（色度）天然量化了"色彩纯度"。白 / 灰 / 黑的 C 接近 0，远低于 `chromaThreshold = 0.04` 阈值，自然被跳过。

### 为什么不是 HSL 或 RGB？

| 用例 | RGB 欧氏距离 | HSL hue + 保 S/L | **OKLCH hue + 保 L/C** |
|---|---|---|---|
| 精确颜色映射（少量离散颜色 + 抗锯齿微小误差） | 简单直观 | 需要 HSL 转换 | 转换成本较高 |
| **品牌色重塑（多明暗变体）** | ❌ 浅紫 `#e8e8f8` 离 `#514cf9` 在 RGB 距离 217，无法与真灰区分 | ✅ 浅紫 `H≈240°` 自然归类 | ✅ 同样归类，且 |
| **感知亮度守恒** | ❌ | ⚠️ HSL 的 L=50% 在蓝色看着暗、在黄色看着亮 | ✅ OKLCH 的 L 是真感知亮度，跨色相恒定 |
| sRGB 色域外像素 | – | – | ✅ 自动 gamut-map（保 L 降 C） |

实测样张 `examples/input.png`（一张深浅不一的品牌紫 icon）→ `examples/output.png`：

- 浅紫 `#9476fd`（OKLCH L≈0.61）→ `#b9727d`（L≈0.61）
- 中紫 `#5b5bfa`（L≈0.55）→ `#ca4300`（L≈0.55）
- 深紫 `#2f45f7`（L≈0.45）→ `#a91f23`（L≈0.45）

整张图的明度阶梯完全对齐原图；如果用 HSL 同样的旋转，输出会整体偏亮 5–10%（因为同 L 的橙比紫感知更亮）。

## 注意事项

- **JPG 不支持透明度**：输出 `.jpg/.jpeg` 时透明像素会被压平为黑/白背景（sharp 默认）。需要保留透明度请输出为 `.png`。
- **同名覆盖**：目录模式默认覆盖输出文件，方便重跑。
- **批量容错**：单文件失败仅 `console.error` 并计数，不会中断整批；如有失败，进程退出码 `1`。
- **要把白/灰也换色** 时，传 `--no-preserve-neutrals`。这种场景较少见但保留了开关。
- **多个源色相靠近** 时：findNearestByHue 取最近的那个源色相做旋转，因此即便几个品牌色色相相近，结果仍然唯一确定。

## 项目结构

```
src/
├── cli.ts         # CLI 入口、参数解析、目录分发、并发池
├── color.ts       # hex<->RGB、sRGB<->linear<->OKLab<->OKLCH、gamut map、hue distance/delta
├── mapper.ts      # 映射表预解析（同时存 RGB & OKLCH & hueDelta）、findNearestByHue
├── processor.ts   # 单文件像素循环：OKLCH 匹配 -> hue 旋转 -> 色域映射 -> sRGB 混合
├── walker.ts      # 目录递归扫描
└── types.ts       # 类型定义与默认参数
```

## License

MIT
