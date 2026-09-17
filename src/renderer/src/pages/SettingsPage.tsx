import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Database,
  Download,
  FolderOpen,
  Info,
  Palette,
  RefreshCw,
  Repeat,
  Sparkles,
  Terminal,
  Timer,
  Trash2
} from 'lucide-react'
import type { AppSettings, ClockDateFormat, ClockLayout, ThemePreset } from '@shared/types/domain'
import {
  CLOCK_DATE_FORMATS,
  CLOCK_DATE_SIZE_TIERS,
  CLOCK_HEIGHT_TIERS,
  CLOCK_SIZE_TIERS,
  CLOCK_SPACING_TIERS,
  CLOCK_WEIGHT_TIERS,
  CLOCK_WIDTH_TIERS,
  FONT_SIZE_META,
  THEME_PRESETS,
  nearestTier,
  resolveClockSettings
} from '@shared/constants'
import { Card, SectionHeader } from '../components/ui/Card'
import { Badge, Spinner } from '../components/ui/Feedback'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Switch } from '../components/ui/Field'
import { Tabs } from '../components/ui/Tabs'
import { ClockTile } from '../components/layout/ClockTile'
import type { ClockStyle } from '@shared/types/domain'
import { resolveTheme, useAppStore } from '../stores/appStore'
import { api } from '../lib/ipc'
import { cn, todayKey } from '../lib/utils'

/** 设置分区：列表页纵向排列，点击进入详情修改 */
const SECTIONS: { key: string; title: string; description: string; icon: typeof Palette }[] = [
  { key: 'general', title: '外观与通用', description: '称呼、主题配色（10 套预设）、深浅色与字号', icon: Palette },
  { key: 'review', title: '复习与计划', description: '复习算法、每日上限、工作时段与自动排程', icon: Repeat },
  { key: 'notify', title: '提醒与通知', description: '提醒提前量与截止提醒提示音', icon: Bell },
  { key: 'pomodoro', title: '番茄钟', description: '专注时长、休息节奏与阶段提示音', icon: Timer },
  { key: 'deps', title: '外部工具依赖', description: 'Pandoc、FFmpeg、yt-dlp、Playwright 检测与排查', icon: Terminal },
  { key: 'data', title: '数据与维护', description: '数据目录、日报导出与示例数据', icon: Database },
  { key: 'about', title: '关于与版本', description: '当前版本与本版较于上一版本的更新内容', icon: Info }
]

/** 可选时钟风格（只描述时间怎么显示） */
const CLOCK_STYLES: { key: ClockStyle; label: string; hint: string }[] = [
  { key: 'flip', label: '翻页', hint: '大号时分秒配合翻页动画，最贴合本站默认气质。' },
  { key: 'minimal', label: '极简', hint: '细体数字 + 小号秒，留白充足、观感安静。' },
  { key: 'ring', label: '秒环', hint: '秒环随秒针走一圈，旁边显示时分。' },
  { key: 'mono', label: '终端', hint: '等宽字体与括号包裹，终端 / 极客风格。' },
  { key: 'analog', label: '表盘', hint: '指针表盘 + 时分数字，最安静的传统读法。' },
  { key: 'dot', label: '圆点', hint: '时 · 分 · 秒用圆点分隔的大号数字。' },
  { key: 'stack', label: '竖排', hint: '时 / 分 / 秒三行竖排，适合瘦高的小方块。' }
]

/** 可选时钟摆放（只描述日期相对时间的位置，与风格自由组合） */
const CLOCK_LAYOUTS: { key: ClockLayout; label: string; hint: string }[] = [
  { key: 'date-bottom', label: '日期在下', hint: '时间在上、日期在下' },
  { key: 'date-top', label: '日期在上', hint: '日期在上、时间在下' },
  { key: 'date-left', label: '日期在左', hint: '日期在左、时间在右' },
  { key: 'date-right', label: '日期在右', hint: '时间在左、日期在右' }
]

/** 时钟形状的默认档位（字号 0 = 随方块尺寸自适应） */
const CLOCK_SHAPE_DEFAULTS = {
  clockFontSize: 0,
  clockFontWeight: 700,
  clockWidthScale: 100,
  clockHeightScale: 100,
  clockLetterSpacing: 0
} satisfies Partial<AppSettings>

/** 日期行的默认设置 */
const CLOCK_DATE_DEFAULTS = {
  clockShowDate: true,
  clockDateFormat: 'cn' as const,
  clockShowWeekday: true,
  clockDateSize: 13
} satisfies Partial<AppSettings>

/** 档位选择行：一排可点选的档位按钮，点一下即写入该档位的确定值 */
function TierRow(props: {
  label: string
  value: number
  tiers: { value: number; label: string }[]
  format?: (value: number) => string
  onChange: (value: number) => void
}): JSX.Element {
  const { label, value, tiers, format, onChange } = props
  const current = nearestTier(value, tiers)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{format ? format(current) : current}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tiers.map((tier) => (
          <button
            key={tier.value}
            type="button"
            onClick={() => onChange(tier.value)}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] transition-colors',
              tier.value === current
                ? 'border-primary bg-primary/12 font-medium text-tint-primary'
                : 'border-border bg-input text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground'
            )}
          >
            {tier.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 带示例文案的选项行（日期格式这类字符串取值用） */
function OptionRow(props: {
  label: string
  value: string
  options: { key: string; label: string; hint?: string }[]
  onChange: (value: string) => void
}): JSX.Element {
  const { label, value, options, onChange } = props
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-md border px-2 py-1 text-left transition-colors',
              option.key === value
                ? 'border-primary bg-primary/12'
                : 'border-border bg-input hover:border-muted-foreground/60'
            )}
          >
            <span
              className={cn(
                'block text-[11px] font-medium',
                option.key === value ? 'text-tint-primary' : 'text-foreground'
              )}
            >
              {option.label}
            </span>
            {option.hint ? (
              <span className="block truncate text-[10px] tabular-nums text-muted-foreground">{option.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 主题配色选择：每张卡片用真实 CSS 变量渲染一个迷你窗口，所见即所得 */
function ThemePicker(props: {
  value: ThemePreset
  mode: 'dark' | 'light'
  onChange: (value: ThemePreset) => void
}): JSX.Element {
  const { value, mode, onChange } = props
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {THEME_PRESETS.map((preset) => {
        const selected = preset.key === value
        return (
          <button
            key={preset.key}
            type="button"
            title={preset.hint}
            onClick={() => onChange(preset.key)}
            className={cn(
              'rounded-lg border p-1.5 text-left transition-colors',
              selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-muted-foreground/60'
            )}
          >
            <span className="themed block overflow-hidden rounded-md border border-border" data-preset={preset.key} data-theme={mode}>
              <span className="flex items-center gap-1 px-1.5 py-1" style={{ background: 'hsl(var(--primary))' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(var(--primary-foreground))' }} />
                <span className="h-1 w-6 rounded-full" style={{ background: 'hsl(var(--primary-foreground) / 0.65)' }} />
              </span>
              <span className="block space-y-1 p-1.5" style={{ background: 'hsl(var(--background))' }}>
                <span className="block h-1 w-3/4 rounded-full" style={{ background: 'hsl(var(--foreground))' }} />
                <span className="block h-1 w-1/2 rounded-full" style={{ background: 'hsl(var(--muted-foreground))' }} />
                <span className="mt-1.5 flex gap-1">
                  <span
                    className="h-4 flex-1 rounded"
                    style={{ background: 'hsl(var(--card))', boxShadow: 'inset 0 0 0 1px hsl(var(--border))' }}
                  />
                  <span className="h-4 flex-1 rounded" style={{ background: 'hsl(var(--muted))' }} />
                </span>
              </span>
            </span>
            <span className="mt-1.5 block truncate text-[11px] font-medium text-foreground">{preset.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 版本更新日志（新版本发布时在最上方追加一条） */
const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '1.2.3',
    date: '2026-09-17',
    items: [
      '左上角字标改为 MOL-WORK，窗口标题、任务栏、托盘提示与到点提醒统一使用同一个软件名',
      '界面整体改为简约风：去掉极光渐变背景与网格蒙版、毛玻璃与渐变填充，卡片统一实底 + 1px 细描边，圆角整体收紧，弹窗不再半透明糊底',
      '主题从「深色 / 浅色」两档扩为 10 套预设配色：素白简约（默认）、极简黑白、宣纸暖白、靛青、苔原、暮沙、石墨、午夜靛蓝、紫棠、墨绿夜色',
      '主题配色与深浅色解耦：任意一套配色都能在深色或浅色下使用，设置页每张卡片用真实配色渲染迷你预览，所见即所得',
      '时钟「字号 / 笔画粗细 / 横向纵向拉伸 / 字距」由滑块改为预设档位，点一下即写入确定值，不再出现拖动时某一段不动的情况',
      '时钟日期行改为可设置：可显示或隐藏、5 种日期格式（中文 / 斜杠 / 短横 / 缩写 / 英文）、是否附带星期、4 档日期字号',
      '统计图表与状态色改读主题令牌，换主题后趋势图、环形图、拖延分析与着色标签同步变色',
      'README 重写为面向使用者的功能说明，去掉设计与制作过程记录'
    ]
  },
  {
    version: '1.2.2',
    date: '2026-09-15',
    items: [
      '修复桌面图标仍有白底：白底来自 Windows 图标缓存，安装程序结束时主动刷新图标缓存，升级后无需注销即可看到新图标',
      '新增 scripts/make-icon.mjs（npm run make-icon）：图标改为可复现的矢量脚本生成，改笔画宽度即可重出全尺寸图标，不依赖在线生图服务',
      '图标去除后方白色背景，改为透明底（只保留黑色圆角瓦片本体），任务栏与 Alt-Tab 不再出现白边方块',
      '托盘改用同一枚图标：随包分发 build/tray.png，读取失败时自动回退到内置方块',
      '新增应用图标：黑色圆角瓦片 + 白色镂空「MW」连写字母（M 的右竖即 W 的左竖，一笔连成），替换此前的 Electron 默认图标',
      '图标由矢量参数生成并逐尺寸做光学修正：16/24/32/48/64px 分别加粗笔画、放大瓦片，托盘与任务栏小尺寸下不再糊成一团',
      '新增 build/icon.png（1024）与 build/icon.ico（16/24/32/48/64/128/256 全尺寸集），快捷方式随之显示新图标'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-14',
    items: [
      '「一键排列」重做：同组模块聚在一起、按行紧凑铺满，行内按比例分配宽度并统一行高，模块为贴合四边自动调整大小',
      '缩放弹开判定重做：只挪开真正重叠的模块，未被影响的模块保持原位',
      '工具页四个指标卡支持点击，弹出对应明细（工具清单 / 依赖状态 / 今日调用 / 累计耗时）'
    ]
  },
  {
    version: '1.1.19',
    date: '2026-09-13',
    items: [
      '悬停白光改为纯半透明柔光（去掉模糊滤镜），模块内文字与图片保持清晰不虚',
      '缩放手柄白条重做：改为紧贴模块边缘的 2px 直角细白线，更细更有贴合感',
      '「一键排列」改为紧凑重排：随机打乱顺序后自上而下紧凑落位，模块彼此相邻不再散落'
    ]
  },
  {
    version: '1.1.18',
    date: '2026-09-13',
    items: [
      '模块悬停反馈改为「淡淡的白色磨砂蒙层」，不再显示边框线条与白色圆点手柄',
      '修复长按指标卡等「整块本身就是按钮」的模块无法进入编辑模式的问题',
      '统计页「统计与复盘」解除锁定，现在可以自由拖拽与缩放',
      '编辑模式新增：点击页面空白处即可退出编辑，本次调整自动保留',
      '「一键清空」升级为「一键排列」：随机重新摆放本页所有模块（互不重叠，可继续微调）'
    ]
  },
  {
    version: '1.1.17',
    date: '2026-09-13',
    items: [
      '新增「编辑布局」模式：点按钮或长按任意模块约 0.55 秒进入，模块轻微颤动提示可动',
      '编辑模式下整块直接拖动（无需拖动键）、四边四角直接拉伸，模块内容暂不可点击防误操作',
      '新增「一键清空」：所有模块清空并排列到页面左侧一列，供用户重新自由排布',
      '新增「我的默认布局」：可把当前布局保存为自己的默认，重置时回到自己的默认，也可一键恢复系统默认',
      '缩放手柄改为细白色条纹（原为蓝色粗条）；工具页指标卡紧贴说明卡、工具集市整行全宽、依赖与运行记录并排',
      '修复统计页「统计与复盘」被指标卡遮挡；番茄钟右列与计时器底部对齐'
    ]
  },
  {
    version: '1.1.16',
    date: '2026-09-13',
    items: [
      '拖拽互换改为完全交换：位置与宽高严格对调，不再出现互换后大小不一致的边界侵入',
      '落位与视图切换自动消解重叠：重叠的一方弹到最近空闲位置（小幅重叠也不会压住相邻模块）',
      '模块靠页面右侧时也能拖左侧手柄向左扩展加宽；缩放手柄加宽高亮、层级提升不再被卡片内容遮挡',
      '任务页重排：工具头与日程看板紧邻无空行、看板高度贴合内容、卡片内容区自适应滚动',
      '时钟「风格」（翻页/极简/秒环/终端）与「摆放」（日期上/下/左/右）拆成两个维度，可自由组合实时预览',
      '新增「调试模式」：开启后关闭窗口直接退出，不再弹出关闭行为确认，便于调试期间关闭软件'
    ]
  },
  {
    version: '1.1.15',
    date: '2026-09-13',
    items: [
      '修复互换只能「小换大」：改为按较小面积判定，大卡片同样可换到小卡片并受最小尺寸保护',
      '新增 5 种时钟样式（翻页 / 极简 / 秒环 / 终端 / 日期在上），设置页可实时预览切换',
      '「任务与回收站」并入「外观与通用」；统计页顶部工具条锁定不可拖动缩放',
      '时钟默认只在仪表盘显示，其余页面可点「添加时钟」自行加入或移除'
    ]
  },
  {
    version: '1.1.14',
    date: '2026-09-12',
    items: [
      '时间显示默认置于页面最上方且横向占满整行（任务页仍不显示）',
      '拖动改为与目标模块互换位置（双方大小互换），不再推挤其他模块',
      '缩放与拖动判定区域收紧贴合模块本身；各模块默认高度更贴近内容'
    ]
  },
  {
    version: '1.1.13',
    date: '2026-09-12',
    items: [
      '拖拽边界加强：半格吸附 + 纵向落位上限，杜绝越拖越远与乱跑',
      '缩放扩展为八向（四边 + 四角），西/北方向对边自动锚定',
      '任务日程页移除时钟方块；右下角缩放提示改为圆滑弧线'
    ]
  },
  {
    version: '1.1.12',
    date: '2026-09-12',
    items: [
      '仪表盘到统计六大页面全部模块化：自由拖拽 + 任意缩放，布局按页面持久化',
      '拖动/缩放全程 rAF 直写 DOM，零 React 重渲染；其他方块 CSS 过渡平滑补位',
      '新增时钟方块 ClockTile（字号随尺寸自适应）；release 目录归档历史版本安装包'
    ]
  },
  {
    version: '1.1.11',
    date: '2026-09-12',
    items: [
      '拖延识别量化升级：截止到期后延期/逾期均计拖延，次数×单次时长双因子评分',
      '统计页新增拖延程度环、日/周/月对比与走势图、记忆流水与分级提醒',
      '统计页模块可拖拽缩放；四个指标卡点击查看明细；删除顶部说明文字'
    ]
  },
  {
    version: '1.1.10',
    date: '2026-09-12',
    items: [
      '版本中心升级：任意版本均可查看本版与历史版本的完整更新信息',
      '番茄钟计时器全新设计：更精致的番茄造型（果体渐变、高光、萼叶）与外圈进度环',
      '任务页时钟数字加大；仪表盘「预计专注」卡片可点击跳转番茄钟'
    ]
  },
  {
    version: '1.1.9',
    date: '2026-09-11',
    items: [
      '番茄钟计时器改为番茄造型（专注红番茄 / 休息绿番茄），内圈进度弧显示剩余时间',
      '番茄钟四个统计卡片可点击，弹出环形图、柱状图与趋势面积图',
      '任务页与设置页隐藏全局时钟；未排期任务为 0 时面板自动收起；当日事项卡片加大',
      '侧边栏删去英文副标题；移除工具页与统计页的阶段交付徽标'
    ]
  },
  {
    version: '1.1.8',
    date: '2026-09-11',
    items: [
      '设置页改为分区列表：点击条目进入对应详情修改，并新增「关于与版本」分区',
      '新增版本检查：可查看当前版本以及本版较于上一版本的更新内容',
      '全局时钟从顶栏移至页面内容区顶部（数字加大）；任务页时钟恢复翻页样式（仅时分秒）'
    ]
  },
  {
    version: '1.1.7',
    date: '2026-09-11',
    items: [
      '提示音改为机械门铃「叮咚」声，且仅截止/超时提醒弹窗首次弹出时响',
      '软件名改为「XX的工作站」，称呼可自定义（默认 MOL）',
      '新增顶栏中央全局翻页时钟；延时转盘加大并带指针拨动「咔哒」声'
    ]
  },
  {
    version: '1.1.6',
    date: '2026-09-11',
    items: [
      '软件最小化/后台时改用系统级通知提醒',
      '点击窗口 X 可选择进入后台或真正关闭（可记住选择），新增系统托盘',
      '超时（逾期）事项优先级提升为最高；弹窗出现伴随提示音（可关闭）'
    ]
  },
  {
    version: '1.1.5',
    date: '2026-09-11',
    items: [
      '截止提醒延时转盘扩展为时/分/秒三个钟表转盘，延期精确到秒',
      '「稍后提醒」自动将事项转为超时状态并每 5 分钟重提醒',
      '修复项目弹窗顶部被截断；任务页搜索候选改为全局搜索同款样式'
    ]
  },
  {
    version: '1.1.4',
    date: '2026-09-11',
    items: [
      '回收站内可直接切换保留时长（一天/一周/一个月）',
      '任务详情 tag 点击即可直接修改；提醒页签支持实时新建/修改/删除提醒',
      '修复弹窗内容显示不完全；搜索候选列出全部匹配任务'
    ]
  },
  {
    version: '1.1.3',
    date: '2026-09-11',
    items: [
      '新增任务回收站（软删除/恢复/到期自动清理）',
      '到期提醒支持快捷延后档位与延时转盘；事项可升级为超时状态',
      '新建任务默认不设置截止时间；拖拽打乱时间顺序时弹窗确认改期'
    ]
  },
  {
    version: '1.1.2',
    date: '2026-09-11',
    items: [
      '仪表盘今日任务与任务清单支持拖拽自由排序',
      '日程卡片新增快捷完成/删除按钮；移除设置页实现状态板块'
    ]
  },
  {
    version: '1.1.1',
    date: '2026-09-11',
    items: [
      '优先事项每日置顶；周条点击切换日期；导航移至日程区',
      '大号日期 + 实时时钟；搜索支持即时候选'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-11',
    items: [
      '任务与日程合并：拖拽排序、优先事项、截止到点弹窗',
      '新增主题与字号设置；番茄钟与工具集市模块拆分上线'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-11',
    items: [
      '个人工作站首次发布：任务管理中枢 / 可插拔工具集 / 统计复盘 / 全局搜索',
      '本机 SQLite 存储，无云端上传；文档转换、音视频处理、网页提取等工具链闭环'
    ]
  }
]

export function SettingsPage(): JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const dependencies = useAppStore((state) => state.dependencies)
  const refreshDependencies = useAppStore((state) => state.refreshDependencies)
  const pushToast = useAppStore((state) => state.pushToast)
  const seedDemo = useAppStore((state) => state.seedDemo)

  const [active, setActive] = useState<string | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [draft, setDraft] = useState<AppSettings | null>(settings)

  useEffect(() => {
    void api.app.getDataDir().then(setDataDir)
  }, [])

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const patch = async (partial: Partial<AppSettings>): Promise<void> => {
    setDraft((current) => (current ? { ...current, ...partial } : current))
    await updateSettings(partial)
  }

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    await refreshDependencies(true)
    setChecking(false)
    pushToast({ title: '依赖检测完成', description: '检测结果已刷新', tone: 'success' })
  }

  const handleExport = async (): Promise<void> => {
    setExporting(true)
    const dateKeyValue = todayKey()
    const result = await api.app.exportReport(dateKeyValue)
    setExporting(false)
    await api.app.showItemInFolder(result.path)
    pushToast({ title: '日报已导出', description: result.path, tone: 'success' })
  }

  if (!draft) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        <span className="text-sm">加载设置…</span>
      </div>
    )
  }

  const activeSection = SECTIONS.find((section) => section.key === active) ?? null
  // 归一化时钟设置（兼容旧版 stacked 值）：风格与摆放两个维度相互独立
  const clockSettings = resolveClockSettings(draft.clockStyle, draft.clockLayout)
  const clockStyle = clockSettings.style
  const clockLayout = clockSettings.layout
  // 当前生效的深浅色：主题配色卡片按它渲染预览
  const mode = resolveTheme(draft.theme)

  /** 各分区详情内容 */
  const renderSectionContent = (): JSX.Element | null => {
    switch (active) {
      case 'general':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="称呼" hint="显示在左上角字标下方，也用于关闭确认等问候文案">
                <Input value={draft.userName} onChange={(event) => void patch({ userName: event.target.value })} placeholder="例如：MOL" />
              </Field>
              <Field label="深浅色" hint="跟随系统会随操作系统实时切换">
                <Select value={draft.theme} onChange={(event) => void patch({ theme: event.target.value as AppSettings['theme'] })}>
                  <option value="dark">深色</option>
                  <option value="light">浅色</option>
                  <option value="system">跟随系统</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-2.5 rounded-lg border border-border bg-muted/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">主题配色</p>
                <span className="text-[11px] text-foreground">
                  {THEME_PRESETS.find((item) => item.key === draft.themePreset)?.label ?? '素白简约'}
                </span>
              </div>
              <ThemePicker
                value={draft.themePreset ?? 'minimal'}
                mode={mode}
                onChange={(key) => void patch({ themePreset: key })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {THEME_PRESETS.find((item) => item.key === draft.themePreset)?.hint ?? ''}。
                配色与深浅色互不影响，上面显示的是当前{mode === 'dark' ? '深色' : '浅色'}下的效果。
              </p>
            </div>
            <div className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs font-medium text-muted-foreground">字体大小</p>
              <Tabs
                size="sm"
                value={draft.fontSize}
                onChange={(key) => void patch({ fontSize: key as AppSettings['fontSize'] })}
                items={Object.entries(FONT_SIZE_META).map(([key, meta]) => ({ key, label: meta.label }))}
              />
              <p className="text-[11px] text-muted-foreground/80">
                当前字号 {FONT_SIZE_META[draft.fontSize]?.label ?? '标准'}（根字号 {FONT_SIZE_META[draft.fontSize]?.root ?? '16px'}），界面会立即缩放。
              </p>
            </div>
            <div className="grid gap-3 rounded-xl border border-border bg-muted/25 p-3">
              <p className="text-xs font-medium text-muted-foreground">时钟风格（时间的显示方式）</p>
              <Tabs
                size="sm"
                value={clockStyle}
                onChange={(key) => void patch({ clockStyle: key as ClockStyle, clockLayout })}
                items={CLOCK_STYLES.map((item) => ({ key: item.key, label: item.label }))}
              />
              <p className="text-xs font-medium text-muted-foreground">时钟摆放（日期相对时间的位置）</p>
              <Tabs
                size="sm"
                value={clockLayout}
                onChange={(key) => void patch({ clockLayout: key as ClockLayout, clockStyle })}
                items={CLOCK_LAYOUTS.map((item) => ({ key: item.key, label: item.label }))}
              />
              <div className="h-[210px] overflow-hidden rounded-lg border border-border bg-background">
                <ClockTile style={clockStyle} layout={clockLayout} />
              </div>

              <div className="grid gap-3 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">时间形状（点选档位，即时生效）</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="恢复自适应字号与默认形状"
                    onClick={() => void patch(CLOCK_SHAPE_DEFAULTS)}
                  >
                    恢复默认
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TierRow
                    label="字号"
                    value={draft.clockFontSize ?? 0}
                    tiers={CLOCK_SIZE_TIERS}
                    format={(value) => (value === 0 ? '随方块自适应' : value + 'px')}
                    onChange={(value) => void patch({ clockFontSize: value })}
                  />
                  <TierRow
                    label="笔画粗细"
                    value={draft.clockFontWeight ?? 700}
                    tiers={CLOCK_WEIGHT_TIERS}
                    format={(value) => value}
                    onChange={(value) => void patch({ clockFontWeight: value })}
                  />
                  <TierRow
                    label="横向拉伸"
                    value={draft.clockWidthScale ?? 100}
                    tiers={CLOCK_WIDTH_TIERS}
                    format={(value) => value + '%'}
                    onChange={(value) => void patch({ clockWidthScale: value })}
                  />
                  <TierRow
                    label="纵向拉伸"
                    value={draft.clockHeightScale ?? 100}
                    tiers={CLOCK_HEIGHT_TIERS}
                    format={(value) => value + '%'}
                    onChange={(value) => void patch({ clockHeightScale: value })}
                  />
                  <TierRow
                    label="字距"
                    value={draft.clockLetterSpacing ?? 0}
                    tiers={CLOCK_SPACING_TIERS}
                    format={(value) => (value > 0 ? '+' : '') + value + '×0.01em'}
                    onChange={(value) => void patch({ clockLetterSpacing: value })}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                  选「自适应」时字号随时块大小变化；选固定档位时，若方块太小，
                  仍按能完整显示的最大尺寸呈现（把方块拖大即可看到该档位的真实效果）。
                </p>
              </div>

              <div className="grid gap-3 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">日期行（显示与格式）</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="恢复默认中文日期与星期"
                    onClick={() => void patch(CLOCK_DATE_DEFAULTS)}
                  >
                    恢复默认
                  </Button>
                </div>
                <div className="grid gap-2.5">
                  <Switch
                    checked={draft.clockShowDate !== false}
                    onChange={(checked) => void patch({ clockShowDate: checked })}
                    label="显示日期"
                  />
                  <Switch
                    checked={draft.clockShowWeekday !== false}
                    onChange={(checked) => void patch({ clockShowWeekday: checked })}
                    label="日期后附带星期"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <OptionRow
                    label="日期格式"
                    value={draft.clockDateFormat ?? 'cn'}
                    options={CLOCK_DATE_FORMATS.map((item) => ({
                      key: item.key as string,
                      label: item.label,
                      hint: item.sample
                    }))}
                    onChange={(value) => void patch({ clockDateFormat: value as ClockDateFormat })}
                  />
                  <TierRow
                    label="日期字号"
                    value={draft.clockDateSize ?? 13}
                    tiers={CLOCK_DATE_SIZE_TIERS}
                    format={(value) => value + 'px'}
                    onChange={(value) => void patch({ clockDateSize: value })}
                  />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {CLOCK_STYLES.find((item) => item.key === clockStyle)?.hint ?? ''}
                {CLOCK_LAYOUTS.find((item) => item.key === clockLayout)?.hint ?? ''}。
                风格、摆放、形状档位与日期设置彼此独立，任意组合都立即生效。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="回收站保留时长" hint="删除的任务在回收站保留的时间，到期自动彻底删除">
                <Select
                  value={String(draft.recycleBinDays ?? 7)}
                  onChange={(event) => void patch({ recycleBinDays: Number(event.target.value) })}
                >
                  <option value="1">一天</option>
                  <option value="7">一周</option>
                  <option value="30">一个月</option>
                </Select>
              </Field>
              <Field label="关闭窗口行为" hint="点击右上角 X 后的动作">
                <Select
                  value={draft.closeAction ?? 'ask'}
                  onChange={(event) => void patch({ closeAction: event.target.value as AppSettings['closeAction'] })}
                >
                  <option value="ask">每次询问（进入后台或退出）</option>
                  <option value="background">直接进入后台（托盘运行）</option>
                  <option value="exit">直接退出软件</option>
                </Select>
              </Field>
            </div>
            <div className="rounded-xl border border-border bg-muted/25 p-3">
              <Switch
                checked={draft.debugMode ?? false}
                onChange={(checked) => void patch({ debugMode: checked })}
                label="调试模式（关闭窗口时直接退出，不弹出确认）"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                用于开发与排查：开启后点击右上角 X 会直接关闭软件，不再询问「进入后台 / 真正关闭」；调试结束请关闭本项，恢复原来的关闭行为。
              </p>
            </div>
          </div>
        )
      case 'review':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="复习算法" hint="SM-2 会随评分动态调整难度系数">
                <Select
                  value={draft.reviewAlgorithm}
                  onChange={(event) => void patch({ reviewAlgorithm: event.target.value as AppSettings['reviewAlgorithm'] })}
                >
                  <option value="sm2">SM-2 自适应（推荐）</option>
                  <option value="ebbinghaus">艾宾浩斯固定间隔</option>
                </Select>
              </Field>
              <Field label="每日复习上限" hint="自动排程时单日最多安排的复习条数">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.dailyReviewLimit}
                  onChange={(event) => void patch({ dailyReviewLimit: Number(event.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="工作时段开始">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.workStartHour}
                  onChange={(event) => void patch({ workStartHour: Number(event.target.value) })}
                />
              </Field>
              <Field label="工作时段结束">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={draft.workEndHour}
                  onChange={(event) => void patch({ workEndHour: Number(event.target.value) })}
                />
              </Field>
              <Field label="自动排程时刻" hint="每天该时刻后把到期复习排入次日">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.autoScheduleHour}
                  onChange={(event) => void patch({ autoScheduleHour: Number(event.target.value) })}
                />
              </Field>
            </div>
            <div className="rounded-xl border border-border bg-muted/25 p-3">
              <Switch
                checked={draft.autoScheduleNextDay}
                onChange={(checked) => void patch({ autoScheduleNextDay: checked })}
                label="每日自动把到期复习内容排入次日日程"
              />
            </div>
          </div>
        )
      case 'notify':
        return (
          <div className="grid gap-4">
            <Field label="提醒提前量（分钟）" hint="日程到点前多久推送系统通知">
              <Input
                type="number"
                min={0}
                max={120}
                value={draft.notifyLeadMinutes}
                onChange={(event) => void patch({ notifyLeadMinutes: Number(event.target.value) })}
              />
            </Field>
            <div className="rounded-xl border border-border bg-muted/25 p-3">
              <Switch
                checked={draft.dialogSound}
                onChange={(checked) => void patch({ dialogSound: checked })}
                label="截止提醒弹窗提示音"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                仅截止时间与超时事项的提醒弹窗在首次弹出时播放「叮咚」声，其他弹窗静默。
              </p>
            </div>
          </div>
        )
      case 'pomodoro':
        return (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="专注时长（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.defaultFocusMinutes}
                  onChange={(event) => void patch({ defaultFocusMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="短休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.pomodoroShortMinutes}
                  onChange={(event) => void patch({ pomodoroShortMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="长休息（分钟）">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={draft.pomodoroLongMinutes}
                  onChange={(event) => void patch({ pomodoroLongMinutes: Number(event.target.value) })}
                />
              </Field>
              <Field label="长休息间隔（个）">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.pomodoroRoundsPerLong}
                  onChange={(event) => void patch({ pomodoroRoundsPerLong: Number(event.target.value) })}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/25 p-3">
              <Switch
                checked={draft.pomodoroAutoStartNext}
                onChange={(checked) => void patch({ pomodoroAutoStartNext: checked })}
                label="阶段结束后自动进入下一阶段"
              />
              <Switch
                checked={draft.pomodoroSound}
                onChange={(checked) => void patch({ pomodoroSound: checked })}
                label="阶段结束时播放提示音"
              />
            </div>
          </div>
        )
      case 'task':
        return (
          <div className="grid gap-4">
            <Field label="回收站保留时长" hint="删除的任务在回收站保留的时间，到期自动彻底删除">
              <Select
                value={String(draft.recycleBinDays ?? 7)}
                onChange={(event) => void patch({ recycleBinDays: Number(event.target.value) })}
              >
                <option value="1">一天</option>
                <option value="7">一周</option>
                <option value="30">一个月</option>
              </Select>
            </Field>
            <Field label="关闭窗口行为" hint="点击右上角 X 后的动作">
              <Select
                value={draft.closeAction ?? 'ask'}
                onChange={(event) => void patch({ closeAction: event.target.value as AppSettings['closeAction'] })}
              >
                <option value="ask">每次询问（进入后台或退出）</option>
                <option value="background">直接进入后台（托盘运行）</option>
                <option value="exit">直接退出软件</option>
              </Select>
            </Field>
          </div>
        )
      case 'deps':
        return (
          <div className="grid gap-3">
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={checking} onClick={handleCheck}>
                重新检测
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {dependencies.map((dependency) => (
                <div key={dependency.id} className="rounded-xl border border-border bg-muted/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      {dependency.label}
                    </span>
                    <Badge tone={dependency.available ? 'success' : 'warning'} dot>
                      {dependency.available ? '可用' : '未安装'}
                    </Badge>
                  </div>
                  {dependency.version ? (
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{dependency.version}</p>
                  ) : (
                    <code className="mt-1.5 block overflow-x-auto rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                      {dependency.installHint}
                    </code>
                  )}
                  {dependency.resolvedPath ? (
                    <button
                      type="button"
                      className="mt-1 block max-w-full truncate text-left text-[10px] text-muted-foreground/80 hover:text-foreground"
                      title="在文件夹中显示"
                      onClick={() => void api.app.showItemInFolder(dependency.resolvedPath as string)}
                    >
                      {dependency.resolvedPath}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      case 'data':
        return (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-muted/25 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Database className="h-3 w-3" />
                数据目录
              </p>
              <p className="mt-1 break-all text-[11px] text-foreground">{dataDir || '—'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                onClick={() => void api.app.openPath(dataDir)}
              >
                打开数据目录
              </Button>
              <Button size="sm" variant="secondary" loading={exporting} icon={<Download className="h-3.5 w-3.5" />} onClick={handleExport}>
                导出今日日报
              </Button>
              <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => void seedDemo()}>
                写入示例数据
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              示例数据仅在任务表为空时写入，用于快速体验任务 → 笔记 → 复习计划 → 日程提醒的完整闭环。
            </p>
          </div>
        )
      case 'about':
        return <AboutSection />
      default:
        return null
    }
  }

  /** 分区列表页 */
  if (active === null || !activeSection) {
    return (
      <div className="grid gap-5">
        <Card padded={false} className="overflow-hidden">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActive(section.key)}
                className="flex w-full items-center gap-4 border-b border-border/50 px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-tint-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{section.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{section.description}</span>
                </span>
                {section.key === 'about' ? <AboutBadge /> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </Card>
        <p className="text-center text-[11px] text-muted-foreground">点击任意分区进入详情修改，所有改动即时保存</p>
      </div>
    )
  }

  /** 分区详情页 */
  return (
    <div className="grid gap-5">
      <Card>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回设置
        </button>
        <SectionHeader title={activeSection.title} description={activeSection.description} />
        {renderSectionContent()}
      </Card>
    </div>
  )
}

/** 设置列表中「关于与版本」的小红点提示：检测到版本变化时显示「新」 */
function AboutBadge(): JSX.Element | null {
  const [isNew, setIsNew] = useState(false)
  useEffect(() => {
    let active = true
    void api.app
      .diagnostics()
      .then((info) => {
        if (!active) return
        const seen = window.localStorage.getItem('workstation.last-seen-version')
        setIsNew(Boolean(seen) && seen !== info.version)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  if (!isNew) return null
  return (
    <Badge tone="primary" dot>
      新
    </Badge>
  )
}

/** 关于与版本：显示当前版本 + 本版较于上一版本的更新内容 + 完整历史日志 */
function AboutSection(): JSX.Element {
  const [version, setVersion] = useState('…')
  const [previousSeen, setPreviousSeen] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(true)

  useEffect(() => {
    let active = true
    void api.app
      .diagnostics()
      .then((info) => {
        if (!active) return
        const current = info.version
        const seen = window.localStorage.getItem('workstation.last-seen-version')
        setVersion(current)
        setPreviousSeen(seen && seen !== current ? seen : null)
        window.localStorage.setItem('workstation.last-seen-version', current)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const matchedIndex = CHANGELOG.findIndex((entry) => entry.version === version)
  const isMatched = matchedIndex >= 0
  // 当前版本缺少独立日志时回退展示最新一条，保证任何版本都有更新信息可看
  const current = isMatched ? CHANGELOG[matchedIndex] : (CHANGELOG[0] ?? null)
  const history = CHANGELOG.filter((entry) => entry.version !== current?.version)

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">当前版本</p>
          <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">v{version}</p>
        </div>
        {previousSeen ? (
          <Badge tone="primary" dot>
            已从 v{previousSeen} 更新
          </Badge>
        ) : (
          <Badge tone="success" dot>
            已是最新
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/25 p-4">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
          本版更新内容
          {isMatched ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              v{current?.version}
              {current?.date ? ` · ${current.date}` : ''}
            </span>
          ) : (
            <span className="text-[11px] font-normal text-warning">该版本日志待补充，以下为最新版本 v{current?.version} 的更新内容</span>
          )}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {(current?.items ?? ['暂无更新记录']).map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#A5B4FC]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-muted/25">
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-xs font-medium text-foreground">历史版本更新日志 · {history.length} 个版本</span>
          <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showHistory && 'rotate-90')} />
        </button>
        {showHistory ? (
          <div className="flex flex-col gap-3 border-t border-border/50 px-4 py-3">
            {history.map((entry) => (
              <div key={entry.version}>
                <p className="text-[11px] font-semibold text-foreground">
                  v{entry.version} <span className="ml-1 font-normal text-muted-foreground">{entry.date}</span>
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {entry.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        本地应用无在线更新源；发布新版本后重新安装即可，此页面会自动对比上次使用的版本并展示更新内容。
      </p>
    </div>
  )
}
