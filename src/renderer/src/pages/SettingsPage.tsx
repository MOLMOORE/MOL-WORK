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
  Timer
} from 'lucide-react'
import type { AppSettings, ClockDateFormat, ClockLayout, ThemePreset, ThemeSkin } from '@shared/types/domain'
import {
  CLOCK_DATE_FORMATS,
  CLOCK_DATE_SIZE_TIERS,
  CLOCK_HEIGHT_TIERS,
  CLOCK_SIZE_TIERS,
  CLOCK_SPACING_TIERS,
  CLOCK_WEIGHT_TIERS,
  CLOCK_WIDTH_TIERS,
  FONT_SIZE_META,
  THEME_GROUP_META,
  THEME_PRESETS,
  THEME_SKINS,
  themePresetsOf,
  themeSkinLabel,
  nearestTier,
  resolveClockSettings,
  type ThemeGroup
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
  { key: 'general', title: '外观与通用', description: '称呼、8 款主题皮肤（默认主题下再挑 18 种风格）、深浅色与字号', icon: Palette },
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

/**
 * 主题（皮肤）选择：8 款皮肤与「默认主题」并列，每张卡用同一份迷你界面 markup，
 * 由 index.css 里的 [data-skin] 规则各自摆出不同结构（导航位置 / 卡片造型 / 状态栏）。
 */
function SkinPicker(props: {
  value: ThemeSkin
  mode: 'dark' | 'light'
  onChange: (value: ThemeSkin) => void
}): JSX.Element {
  const { value, mode, onChange } = props
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {THEME_SKINS.map((skin) => {
        const selected = skin.key === value
        return (
          <button
            key={skin.key}
            type="button"
            title={skin.hint}
            onClick={() => onChange(skin.key)}
            className={cn(
              'rounded-lg border p-1.5 text-left transition-colors',
              selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-muted-foreground/60'
            )}
          >
            <span className="themed skin-thumb block" data-skin={skin.key} data-theme={mode}>
              <span className="st-top block" />
              <span className="st-wrap flex">
                <span className="st-side">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="st-main">
                  <span className="st-card" />
                  <span className="st-card" />
                  <span className="st-card" />
                </span>
              </span>
              <span className="st-foot block" />
            </span>
            <p className="mt-1.5 truncate text-xs font-medium text-foreground">{skin.label}</p>
            <p className="truncate text-[10px] text-muted-foreground">{skin.layout}</p>
          </button>
        )
      })}
    </div>
  )
}

/** 默认主题下的风格选择：先「配色风格」后「观感风格」，每张卡片用真实 CSS 变量渲染一个迷你窗口 */
function ThemePicker(props: {
  value: ThemePreset
  mode: 'dark' | 'light'
  onChange: (value: ThemePreset) => void
}): JSX.Element {
  const { value, mode, onChange } = props
  const groups: ThemeGroup[] = ['palette', 'style']
  return (
    <>
      {groups.map((group) => (
        <div key={group} className="grid gap-1.5">
          <p className="text-[11px] font-medium text-foreground">
            {THEME_GROUP_META[group].label}
            <span className="ml-1.5 font-normal text-muted-foreground/80">{THEME_GROUP_META[group].description}</span>
          </p>
          <ThemeGrid group={group} value={value} mode={mode} onChange={onChange} />
        </div>
      ))}
    </>
  )
}

function ThemeGrid(props: {
  group: ThemeGroup
  value: ThemePreset
  mode: 'dark' | 'light'
  onChange: (value: ThemePreset) => void
}): JSX.Element {
  const { group, value, mode, onChange } = props
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {themePresetsOf(group).map((preset) => {
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
            <span
              className="themed app-shell block overflow-hidden rounded-md border border-border"
              data-preset={preset.key}
              data-skin="default"
              data-theme={mode}
              style={{ borderWidth: 'var(--border-w)', backgroundImage: 'var(--page-bg-image)' }}
            >
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
                    style={{
                      background: 'hsl(var(--card))',
                      boxShadow: 'inset 0 0 0 1px hsl(var(--border))',
                      borderRadius: 'var(--r-lg)'
                    }}
                  />
                  <span className="h-4 flex-1 rounded" style={{ background: 'hsl(var(--muted))' }} />
                </span>
              </span>
            </span>
            <p className="mt-1.5 truncate text-[11px] font-medium text-foreground">{preset.label}</p>
            <p className="truncate text-[10px] text-muted-foreground">{preset.hint.split('，')[0]}</p>
          </button>
        )
      })}
    </div>
  )
}

/** 版本更新日志（新版本发布时在最上方追加一条） */
const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '1.2.5',
    date: '2026-09-23',
    items: [
      "翻页动效改挂在「图层」上：双页时左右两页作为一整张纸整体移动，不再各页散开、中缝互相遮挡；推移 / 覆盖走满一整页宽，方向感更明显",
      "修回翻上一页与双页翻页时的闪动：动效启动前先把目标页画布准备好（先画再动，第一帧就是成品，不再白纸蹦内容）、去掉 preserve-3d（原来两张纸在 3D 里穿插会让 z-index 失效、翻到一半跳层）、翻书只转到接近侧立并同步淡出（不越过 90° 不露纸背）、翻页这一下锁住滚动容器（不再撑出滚动条抖一格）",
      "回翻改成物理方向：新页从左侧翻落回书面、旧页被慢慢盖住；连点翻页时动画从真正显示着的那一页开始，不再跳页；排版模式不再每次翻页重挂 iframe（重挂一次白屏一次），改为内容平滑滚过去",
      "点书页左右侧翻页不再触发双击放大（防误触）；翻到最后一页还想往后翻、第一页还想往前翻，舞台下方就地提示「已到最后一页 / 已在第一页」",
      "新增「页面对比」：整页工作台，最多同时看 4 页——1-3 页横排、4 页两行两列；每一页都能按住标题条自由拖动、拖右下角拉大纸框，也能单独放大（滚轮 / 标题条上的 −／+ / 双击），放大后按住页面平移细看，方便逐处比对差异；缩略图点一下加入 / 移出，点页码直接翻到那一页",
      "新增「页面提取」：勾选任意几页拼成一份新的 PDF 资料存进书柜（原样搬运页面对象，矢量文字与图片不重画），也可另存为 PDF 文件；支持 1,3,5-8 这种页码写法",
      "阅读侧栏右上标签换位：「页面」与「目录」对调（页面 · 目录 · 书签 · 注释 · 查找 · 本页），打开侧栏默认落在「页面」",
      "笔记列表每条资料 / 笔记可按住卡片自由拖拽排序，顺序落库保存（数据库 v7：notes.sort_order，老库自动追加）；拖动会自动切回手动排序",
      "笔记列表上方新增排序按键：手动排序 / 按修改日期排序 / 按加入日期排序 / 按首字符排序（中文按拼音）/ 按格式排序，并配「正序 / 倒序」切换按键，每种排序各自记住自己上次的方向；选择都记在本地",
      "文本与排版模式（TXT / MD / DOC / PPT / 网页等非书页资料）支持换字体与放大：工具条新增字体下拉（跟随原文 / 黑体 / 宋体 / 楷体 / 仿宋 / 圆体 / 无衬线西文 / 衬线西文 / 等宽），文本模式字号与页面缩放各自独立可调；Ctrl+滚轮、Ctrl+±、+／- 与 0 复位都可用，字体与字号选择记在本地",
      "详情里的「资料简介」只留标题、占位改「简介填在此处」并删掉两处说明文字；拖文件进列表的提示简化为「将文件拖入此处」；导入确认窗标题改「保存资料」",
      "工具集页头那段「清单一经注册……」说明删除；自绘标题栏的「最小化」按钮改回减号样式",
      "新增全局快捷键：全屏下按 Esc 直接退出全屏（侧栏 / 弹窗 / 对比与提取浮层开着时 Esc 先关它们，不会一把退出）",
      "「页面」缩略图上方新增「全部页面 / 仅书签」切换：只看加过书签与重点的页面，缩略图角上直接标出书签页、点一下即可取消；原来单独的「书签」标签删除（顶上书签（B）与重点页（S）按键保留）",
      "注释能圈住了：顶栏新增「圈注」模式，在书页上按住鼠标圈出任意一块、松手写批注，纸面留下圈画并挂编号圆点，批注按编号排在旁边（数据库 v8：note_marks.region，存归一化到页面自身坐标的轨迹，缩放旋转都不跑位）",
      "整页注释不再只躺在侧栏：自动排在页面边上，舞台左右放不下时落到页面的上下空白，带序号、原文摘录与删除按钮；新增「圈画」「旁注」两个显示开关，纸上的圈注与边上的批注可分别隐藏显示，选择记在本地",
      "页面对比：每一页可自由调显示优先级（上移一层 / 下移一层，标题条上的角标显示谁压着谁），按住纸框拖动会自动提到最上层；鼠标中键按住任意一页即可拖走整张纸，放大状态下照样成立",
      "修页面对比「放大到 200% 以后纸面最下面一段拖不出来」：每页的格子先让出标题条的高度、纸框也不许被拖出画布，整页终于能拖到看全",
      "Word / PDF 这类原版式书页新增「书页 / 文字」阅读方式切换，切到文字视图后照样能挑字体、调字号与放大；修纯文本（TXT）换字体没反应：Tailwind 预置把 pre 标签钉成等宽字体，盖掉了阅读器的设置",
      "第四轮：圈注可选形状 —— 自由手绘 / 矩形 / 圆圈 / 多边形（多边形逐点落点，点回起点或按 Enter 闭合成形，Esc 作废），选择记在本地",
      "第四轮：批注改成就地气泡 —— 点纸上的圈、圈角编号或页顶快捷按键，批注就贴着圈住的那块显示（右边放不下自动翻到左边），不再一律排到页面下方；点空白处或按 Esc 收起，刚写完的批注保存后会自动展开确认落点",
      "第四轮：整页旁注更醒目（主色竖条 + 投影 + 加大字号，边栏带虚线导轨），并在每一页纸的上方加一排注释快捷按键，实心编号是圈注、空心编号是旁注",
      "第四轮：阅读方式按格式分两类 —— PDF / PPT / Excel 只走书页（整页缩放，不做字体功能），Word（doc / docx / rtf / wps / odt）与 TXT / MD 走文字（字体、字号、页面缩放都能调），Word 类打开默认就是文字视图，可切回书页核对原版式；笔记列表标签与摘要同步显示「文字」",
      "第四轮：修「点文字后一直卡在正在准备文字视图」—— 正文已经在库里的文档会跳过抽取却仍在等抽取结果，界面永远停在占位句；现在文字视图直接读库里正文，秒开",
      "第四轮：修页面对比「上移一层 / 下移一层没反应」—— 层级排序写反（最上面那张点了没动、下面那张点了反而沉底），现在按第 1 层在最上面排，编号角标也能点一下置顶",
      "第四轮：页面对比放大后能看全整页 —— 纸框改成自己出滚动条（原来靠手算位移钳制，纸框一矮右下两个角永远拖不到），放大时指针那一点原地不动，按住纸面能拖到任意一角；拉大纸框的拉手移到框外不再跟着滚动跑掉",
      "第四轮：新增 docs/feature-index.md 功能文件索引与 docs/modifications/ 修改记录（按版本轮次 + 按功能线），AGENTS.md 增补「开工先读」与「功能索引与修改记录」两节",
      "第五轮：工具条新增「滚轮翻页」开关——开着时滚到页面边缘就翻页（原行为），关掉后滚轮只滚动当前这一页，防误触；Ctrl+滚轮缩放不受影响，选择记在本地",
      "第五轮：修页面对比「上移一层 / 下移一层点了没反应」——一页一页加进对比时新页的层级编号会和已有页撞成同一个数字，交换两个一样的数是空操作；现在每次增删都把编号重排成一串互不相同的层（原有相对次序不变），到顶与到底的按键直接变灰",
      "第五轮：修「手动调好的层级一点就没了」——以前只要按住纸面就顺手把这一页置顶，现在只有拖标题条或中键搬整页才置顶，左键按住纸面平移不动层级；新增「叠放」按键把几页错开摞成一叠（两页不重叠时上下层怎么调都看不出来）",
      "第五轮：修「放大后左键拖不动右下、中键拖整页也在同一片失灵、滚动条却一直好用」——起拖判据用了 offsetX，而它是相对被命中的那个元素量的，放大后比纸框宽得多，把右下那一大片全误判成滚动条；改成按纸框自己的矩形量",
      "第五轮：修「拖到最右下仍差一截看不全」——纸框能滚多远改成以 DOM 真实滚动范围（scrollWidth - clientWidth）为准，不再按公式推（公式会漏掉纸框那圈 8px 内边距）；越界的期望位置渲染后自动收回，下次起拖不再先空拖一段",
      "第六轮：文字模式也先给一张纸 —— 正文按页面边界排栏、一栏就是一页，单页 / 双页 / 连续与直切 / 淡入 / 推移 / 覆盖 / 翻书全部照书页那套走，页码、阅读进度、书签重点、圈注、旁注、到头提示与滚轮翻页开关一并接上",
      "第六轮：页面边界可自己拖 —— 按住纸的右边 / 下边 / 右下角改纸张大小，正文实时重排、页数跟着变，尺寸记在本地；点缩放条上的百分比把边界交还给窗口自适应",
      "第六轮：文字模式新增选中正文的批注 —— 选中一段后浮出小条，可涂成荧光笔（跨行跨栏都带满底色）或直接给这段写旁注，点标记就贴着它展开气泡；侧栏注释列表带上荧光标记，可跳页删除",
      "第六轮：文字页与书页共用同一套批注层（圈注四种形状、编号圆点、页顶快捷按键、边上旁注、就地气泡），文字页只是把「页」换成「栏」",
      "第六轮：修对比界面顶栏「重排」等按钮按了没反应 —— 自绘标题栏那 34px 是 Electron 的窗口拖动区域，整页浮层压在它上面时点击会被拖动判定吃掉；浮层显式声明 no-drag（对比工作台与提取 / 注释弹窗都算）",
      "第六轮：修文字页页数收敛 —— Chromium 的 column-count 给少了会自己往外长、给多了留空栏，判据改成量最后一个块右沿落在第几栏（原来量左沿会在栏分界上因亚像素误差来回弹，栏数永远定不下来）",
      "第七轮：左右翻页改成两颗小按键 —— 以前整条 14% 宽的透明区域都能翻页，鼠标路过就误翻；现在只有点得着那两颗按键才算翻页",
      "第七轮：顶栏注释一族（注释 / 圈注 / 圈画 / 旁注）统一成一组同样式的按键：图标 + 文字、点亮走主色，圈画与旁注各用自家图标，不再是一个裸图标夹在三个带框按键中间",
      "第七轮：文字模式分页重做 —— 一张纸最多就是一屏，正文按纸的大小排栏，装不下的自动推到下一页、纸变大又拉回来；拖纸边实时重排，页数与翻页跟着变，不会再「整篇挤成一页、再也翻不动」",
      "第七轮：修「上一页会露出下一页的一条字」—— 可见窗口以前按纸宽裁，纸的出血比栏距还宽就会留下邻栏一条字；现在窗口收紧到正文区两侧各 8px，邻栏必然被切掉",
      "第七轮：文字模式分页与连续都能改字号与字体，顶栏不再并排两个一模一样的缩放组；切到「连续」也留着「单页 / 双页 / 连续」，随时切得回来",
      "第七轮：「连续」滚动也支持选中正文涂荧光、给选中那段写旁注、点标记就地展开气泡，与分页文字纸同一套存法、互认彼此的标记",
      "第七轮：文字页能正常选中文字了（没放大到溢出时左键不再被当成拖动平移）；从「文字」切回「书页」把页数交还给原文档，修「文字页卡在 1 页之后连书页也翻不动」",
      "第七轮：深色模式与各款皮肤下文字页的纸改走主题色，去掉压在纸上的那块代码块深底；「圈画」开关现在也管正文里涂亮的荧光",
      "第七轮：双页模式切过去自动对齐到奇数页，第 1 页不会被挤到第二张纸上",
      "第八轮：修「文字模式单页 / 双页还是选不中正文」—— 每一栏上盖着的批注层以前把鼠标全吃了，正文一个字也框不住；现在它只画不接鼠标，圈注与批注按键照样能点",
      "第八轮：连续（滚动）里选中一段后浮出的「注释 / 高亮」小条不再离选区一大截 —— 贴着选中那一行的上方，内容滚动时跟着走，上面放不下自动翻到下面；样式改成实底卡片 + 主色描边 + 图标带文字，一眼看得见",
      "第八轮：高亮新增五种荧光色可挑（黄 / 绿 / 青 / 粉 / 紫），点哪个色就涂哪个色；同一段再点同色取消、点别的色是改色而不是叠一层，用色记在本地",
      "第八轮：修「文字页下方那截字符排版出错」—— 比一页还高的图片、代码块一类的整块不再顶穿栏底漏进纸的下边距：图片等比缩到一页高，代码块换成软换行、能像正文一样一栏一栏断",
      "第八轮：文字模式保留侧栏的页面功能并改名「文字页」（同样支持「全部页面 / 仅书签」与书签角标）—— 缩略图按当前字体、字号与页面边界实时排版，改排版立刻跟着变；与书页的原版式页码明确区分，也修掉「缩回侧栏再展开会看到书页的页面」",
      "第八轮：查找改成「能搜的就涂色，涂不了的就圈出来」—— 文字（分页与连续）把全篇每一处命中都涂亮并列出落在第几页，书页 PDF 用虚线椭圆像批注那样把命中那一行圈在页面上（缩放、旋转、双页都跟着走）；新增「上一处 / 下一处」绕圈跳，Ctrl+F 直接进输入框",
      "第八轮：双页下从缩略图或查找列表跳到偶数页，会自动对齐到它左边那一页；文字模式重新展开侧栏会落在当前阅读方式真有内容的那一栏",
      "第八轮：顶栏注释工具组按阅读方式各自显示（圈注 / 旁注要有「页」才给，圈画在连续文字里也照样管得住正文荧光）；文字模式的侧栏目录不再拿书页的 PDF 书签冒充",
      "第八轮：顺手清理历轮留下的死代码与无用导入（旧版网格压缩函数、任务页没在用的分组、没人用的扩展名表与数据库辅助函数等），三处重复的正文渲染树合并成一份，功能不变",
      "第九轮：高亮新增快捷键 —— 选中一段正文按 Ctrl+Shift+H 就涂上当前荧光色，这段已经亮着再按一次直接抹掉（浮条上的色板照旧可用）",
      "第九轮：修侧栏「文字页」除了第一页其余都没有预览 —— 缩略图以前把正文自己又裁了一遍，第二页起被整条裁掉；现在与纸上同一套裁切结构，每一页都有预览",
      "第九轮：文字模式的页面边界横向放开 —— 纸可以拖得比窗口还宽（最宽 2600），不再被一屏宽卡住，超出部分用滚动条看；纵向仍一屏封顶，免得整篇挤进一页翻不动",
      "第九轮：修底部「第 N / M 页 + 快捷键提示」在打开侧栏时显示不全 —— 提示排不下自动换第二行，每条提示也不会被切一半，并精简掉重复的几条",
      "第十轮：侧栏「文字页」的预览改成整张纸的等比小版 —— 连纸的四边留白与裁切窗口都和本页同一套数值，一眼就是本页缩小版，不再只有正文那一栏字",
      "第十轮：阅读页底部快捷键提示精简成一行（翻页 / 下页 / 缩放 / 书签·重点·注释 / 布局 / 全屏），详细解释改到鼠标悬浮提示里，打开侧栏不再挤成两堆",
      "第十轮：修旁注卡片压在下一页正文上 —— 连续滚动时量出旁注列的高度、在纸下面垫出等高的地方，下一页自动让开；文字页的旁注列整个挪到纸的外面",
      "第十轮：一条批注再长也有限高（超出在卡片内滚动），不会把页面之间的空档撑得离谱",
      "第九轮：注释后挂在页面左上角的那排编号按键搬到纸的外面正上方，不再压住正文（书页与文字页都算，纸上方自动留出空带，连续滚动时页间距同步加大）"
    ]
  },
  {
    version: '1.2.4',
    date: '2026-09-17',
    items: [
      '第五轮：窗口顶部改成软件自绘的标题栏（去掉系统标题栏与重复的软件名），整条随主题变色，含全屏 / 最小化 / 最大化 / 关闭四个按钮，空白处可拖动、双击最大化还原；F11 全局切全屏，全屏时标题栏自动隐藏',
      '第五轮：资料可与任意任务、项目 / 课程互相关联，阅读界面按分钟把阅读时长记进所关联任务或课程的专注时间（统计页项目用时同步计入）；拖入或选择文件后先弹确认窗，让用户填资料简介并挑选关联任务 / 课程，不填就留空',
      '第五轮：详情弹窗改单列自上而下排版，不再出现左右两栏互相重叠；删掉「抽取文字」的展示，换成用户自己填的「资料简介」，并显示读到第几页与本篇已读时长',
      '第五轮：阅读界面点书页左侧回上一页、右侧翻下一页，放大（可拖动）状态下自动禁用，避免拖动看细节时误触',
      '第五轮：修翻页收尾抖一下的问题 —— 缓存命中的画布当帧贴上（不再闪空白占位）、相邻页提前预取、动效时长统一 340ms 且退场收到全透明、阴影改渐变、逐页模式不再在翻页瞬间挪滚动条',
      '第五轮：修三款皮肤的适配问题：复古桌面卡片标题条不再用负边距出血盖住上方内容（设置页遮挡）、数据驾驶舱侧栏导轨可收可放（折叠按钮回到导轨里，默认折叠但一键展开）、荧光终端等主题下网格卡片内容超高时改为可滚动（任务页工具条被切半行）',
      '修复时钟「笔画粗细」六档只有两档生效：系统自带的中文黑体只有常规与粗体两个字重，导致中等=常规、粗与特粗退回半粗；现内置 Inter / JetBrains Mono 可变字体（wght 100-900），细、常规、中等、半粗、粗、特粗各自对应一个真实字重',
      '时钟日期格式选「英文」时星期同步改为英文（Sep 17, 2026 · Thu），不再出现英文日期配中文星期',
      '主题体系改为两层：顶层是「主题皮肤」，共 8 款并列可选；默认主题之下再挂 18 种「风格」（10 种配色风格 + 8 种观感风格），选中默认主题才能挑风格，切去别的皮肤时风格自动收起、切回即恢复',
      '新增 7 款与默认主题并列的皮肤，改的是界面结构而不只换色：纸间杂志（导航成顶部刊头、卡片改细线留白、正文衬线并首字下沉）、琉璃极光（悬浮胶囊侧栏 + 毛玻璃卡片 + 流动极光底）、荧光终端（全等宽 + ASCII 双线面板 + 行号侧栏 + 底部状态行 + 扫描线）、粗野主义（顶部块状标签 + 3px 描边 + 硬投影）、数据驾驶舱（窄图标侧栏 + 四角括号 + 网格底 + 遥测状态栏）、奶油拟物（无描边双向柔光浮雕 + 全圆角）、复古桌面（卡片带窗口标题栏 + 立体斜边 + 方块滚动条 + 分格状态栏）',
      '设置页主题选择改为「主题」+「默认主题 · 风格」两层，皮肤预览卡用同一份迷你界面由皮肤规则各自重排，导航位置 / 卡片造型 / 状态栏差异一眼可见',
      '修复「设置」入口在部分皮肤下消失：纸间杂志与粗野主义整条隐藏侧栏、数据驾驶舱把侧栏折叠成窄图标导轨，而设置与明暗切换只挂在侧栏底部，切到这三款皮肤后就回不到设置页；现在顶部导航右端常驻明暗切换与设置（窄窗口自动换行不会被裁掉），驾驶舱的窄导轨只收起在导轨里没有意义的「收起侧栏」按钮、明暗切换与设置都以图标留在导轨里，八款皮肤逐一复查均可进入设置与切换深浅色',
      '导入不再一律转 Markdown：PDF / PPT / Excel / Word 等按原版式成书（图片、表格、排版都在）且只读，网页与 EPUB 打包成自包含 HTML 按原排版成书，只有 Markdown / TXT / 代码等文本类保留编辑模式；渲染件统一收进书库，原文件被移走也照样能翻',
      '新增独立全屏阅读界面：点任意一条笔记即翻书进入，页面自适应原文件尺寸，支持适宽 / 适页 / 100% 等比缩放与单页 / 双页 / 连续三种摆放',
      '翻页做了 5 种动效（直切 / 淡入 / 推移 / 覆盖 / 仿真翻书），键盘全套：← → PgUp PgDn 空格 Home End 缩放 + − 0、B 书签、S 重点页、E 注释、Ctrl+F 查找、Esc 返回',
      '每份资料像一本书：目录（读 PDF 书签 / HTML 标题 / Markdown 标题）、页面缩略图、全文逐页查找、书签、重点页、带原文摘录的页内注释，并自动记住读到第几页',
      '文本类阅读界面提供字号控制与就地编辑；只读资料在笔记页只展示供搜索用的抽取文字并给出说明，不再被误当成可编辑正文',
      '阅读界面工具条不再按窗口宽度藏控件：原先窄于 1280px 会收起翻页与页面摆放两组按钮，现在整条自动换行，翻页、缩放、书签、重点页、注释、查找在任何窗口尺寸下都在',
      '修复阅读界面放大后页面被裁掉一半：舞台改用 margin:auto 居中，任意倍率下四个方向都能滚到页面边缘；新增按住鼠标左键拖动平移放大后的画面，拖动不会被误判成点击跳页',
      '缩放改为 Ctrl + 鼠标滚轮（以指针为锚点），Ctrl+ + / − / 0 同样有效；普通滚轮在单页模式滚到边自动翻页。快捷键对齐主流阅读器：Home End 首末页、R 旋转、F 全屏、1 / 2 / 3 切单页 双页 连续、L 循环摆放，工具条补旋转与全屏按钮',
      '修复连续模式卡住不动：渲染改为单通道优先级队列（当前页与相邻页优先），画布按页码 + 倍率 + 角度缓存复用，十页并发把界面钉死的问题不再出现；翻页动效重做，残影不再塌陷、时长收敛、翻书补书脊阴影、快速连翻会取消上一段动画，系统「减少动效」时直接切页',
      '导入加进度条：底部浮层显示第几个文件、当前阶段（解析 / 生成原版式 / 入库）、总百分比与预计剩余时间；多文件并行解析、同一份字节只读一次、超长 PDF 限页抽取、PDF 书签后台解析，导入与开书都更快',
      '笔记页卡片右下角的书本按钮一键进入阅读模式；选中任意资料改为弹出独立详情视图（正文、原件、复习计划、标签、删除），不再常驻右侧被挤到显示不全；修复窄列下「导入」按钮被压成两行、分类页签中文竖排的错位',
      '笔记列表占满整页宽度后宽窗口按两列排布；笔记页布局存档升到 v4，此前自定义过的笔记页布局会回到新的默认排布',
      '深色下模块边界加强：基础深色描边提亮，卡片叠内亮边与外暗边，并逐一校正 14 套深色配色与皮肤（含奶油拟物所有层级同色导致模块糊在一起的问题）',
      '移除常态下的模块拖拽与拉伸热区：只有进入编辑模式（工具条「编辑布局」或长按任意模块 0.55 秒）才能摆放与拉伸，长按进编辑保持不变'
    ]
  },
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
                <p className="text-xs font-medium text-muted-foreground">主题</p>
                <span className="text-[11px] text-foreground">{themeSkinLabel(draft.themeSkin)}</span>
              </div>
              <SkinPicker
                value={draft.themeSkin ?? 'default'}
                mode={mode}
                onChange={(key) => void patch({ themeSkin: key })}
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {THEME_SKINS.find((item) => item.key === (draft.themeSkin ?? 'default'))?.hint ?? ''}。
                皮肤改的是界面结构（导航位置、卡片造型、字体、底纹、状态栏），不只换颜色；上面显示的是当前
                {mode === 'dark' ? '深色' : '浅色'}下的效果。
              </p>
            </div>
            {draft.themeSkin === 'default' ? (
              <div className="grid gap-2.5 rounded-lg border border-border bg-muted/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">默认主题 · 风格</p>
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
                  配色风格只换颜色；观感风格连圆角、描边、阴影、字体与页面底纹一起换。
                  两者都与深浅色互不影响，切换上方「主题」到其他皮肤时这套风格会暂时收起，回到默认主题即恢复。
                </p>
              </div>
            ) : null}
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
                    format={(value) => '字重 ' + value}
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
                  笔画粗细已内置可变字体，细 / 常规 / 中等 / 半粗 / 粗 / 特粗 六档各对应一个真实字重，
                  不再出现「中等看着和常规一样、粗和特粗又回到半粗」的情况。
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
                日期格式选「英文」时，星期会跟着变成英文（如 Sep 17, 2026 · Thu）。
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
            <div className="grid gap-1.5 rounded-xl border border-border bg-muted/25 p-3">
              <p className="text-xs font-medium text-foreground">窗口标题栏与全屏</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                顶部一条是软件自绘的标题栏（不再是系统标题栏，也没有重复的软件名），
                背景、描边与按钮全部取当前主题的令牌，换主题或深浅色时一起变。
                空白处可拖动窗口，双击最大化 / 还原，右端依次是全屏、最小化、最大化、关闭。
              </p>
              <div className="mt-0.5 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <p><span className="text-foreground">F11</span> 进入 / 退出全屏（全屏时标题栏自动隐藏）</p>
                <p><span className="text-foreground">双击标题栏</span> 最大化 / 还原</p>
                <p><span className="text-foreground">阅读界面 F</span> 同样切全屏，<span className="text-foreground">Esc</span> 退出</p>
                <p><span className="text-foreground">阅读界面 Ctrl+滚轮</span> 缩放，点书页左右侧翻页</p>
              </div>
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
