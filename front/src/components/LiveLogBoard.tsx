import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Copy, RotateCcw, Search, TerminalSquare } from "lucide-react";
import type { LogItem } from "@/lib/api";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Switch } from "@/components/ui";
import { cn, copyText } from "@/lib/utils";

type LogTone = "default" | "success" | "error" | "warn" | "info";
type DisplayLogItem = LogItem & { tone: LogTone; searchText: string };

const DEFAULT_RENDERED_LOGS = 300;
const LOG_RENDER_STEP = 300;

function detectLogTone(message: string): LogTone {
  if (/(error|failed|failure|exception|traceback|拒绝|失败|异常|拦截|timeout|timed out)/i.test(message)) {
    if (/(success|成功|完成)/i.test(message) && !/(fail|失败|error)/i.test(message)) return "success";
    return "error";
  }
  if (/(warn|warning|风险|注意|重试|retry)/i.test(message)) return "warn";
  if (/(success|成功|完成|imported|saved|已保存)/i.test(message)) return "success";
  if (/(stage|step|开始|启动|waiting|proxy|browser|Turnstile|SSO)/i.test(message)) return "info";
  return "default";
}

const logToneClass: Record<LogTone, string> = {
  default: "text-slate-700",
  success: "text-emerald-700",
  error: "text-rose-700",
  warn: "text-amber-700",
  info: "text-slate-800",
};

const LogLine = memo(function LogLine({ item }: { item: DisplayLogItem }) {
  return (
    <div className="border-b border-slate-200/60 py-0.5 last:border-0 [contain-intrinsic-size:auto_24px] [content-visibility:auto]">
      <span className="text-sky-600">[{item.time}]</span>{" "}
      <span className={cn("whitespace-pre-wrap break-all", logToneClass[item.tone])}>{item.message}</span>
    </div>
  );
});

export function LiveLogBoard({
  logs,
  running,
  lastError,
  title = "实时日志",
  description = "按时间顺序显示浏览器和流程日志。",
  ariaLabel = "实时日志",
  emptyIdleHint = "等待日志…启动任务后会在这里实时输出。",
  emptyRunningHint = "任务运行中，正在等待实时日志…",
  statusRunningLabel = "日志持续同步中",
  statusIdleLabel = "等待新任务",
  extraMeta,
  onClearView,
  onToast,
}: {
  logs: LogItem[];
  running: boolean;
  lastError?: string;
  title?: string;
  description?: string;
  ariaLabel?: string;
  emptyIdleHint?: string;
  emptyRunningHint?: string;
  statusRunningLabel?: string;
  statusIdleLabel?: string;
  extraMeta?: string;
  onClearView?: () => void;
  onToast?: (message: string, tone?: "default" | "success" | "error") => void;
}) {
  const [renderedLogLimit, setRenderedLogLimit] = useState(DEFAULT_RENDERED_LOGS);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [logLevel, setLogLevel] = useState<"all" | LogTone>("all");
  const logRef = useRef<HTMLDivElement | null>(null);
  const userPinnedRef = useRef(false);
  const deferredLogQuery = useDeferredValue(logQuery);

  const displayLogs = useMemo<DisplayLogItem[]>(
    () =>
      logs.map((item) => ({
        ...item,
        tone: detectLogTone(item.message),
        searchText: `${item.time || ""}\n${item.message}`.toLowerCase(),
      })),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const q = deferredLogQuery.trim().toLowerCase();
    if (!q && logLevel === "all") return displayLogs;
    return displayLogs.filter((item) => {
      if (logLevel !== "all" && item.tone !== logLevel) return false;
      if (!q) return true;
      return item.searchText.includes(q);
    });
  }, [displayLogs, deferredLogQuery, logLevel]);

  const renderedLogs = useMemo(
    () => filteredLogs.slice(-renderedLogLimit),
    [filteredLogs, renderedLogLimit]
  );
  const hiddenFilteredLogCount = Math.max(filteredLogs.length - renderedLogs.length, 0);
  const latestRenderedLogId = renderedLogs[renderedLogs.length - 1]?.id || 0;

  useEffect(() => {
    setRenderedLogLimit(DEFAULT_RENDERED_LOGS);
  }, [deferredLogQuery, logLevel]);

  useEffect(() => {
    if (autoScroll && !userPinnedRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      setShowJumpBottom(false);
    }
  }, [latestRenderedLogId, autoScroll]);

  const onLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    userPinnedRef.current = !nearBottom;
    setShowJumpBottom(!nearBottom);
  };

  const jumpToBottom = () => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userPinnedRef.current = false;
    setShowJumpBottom(false);
  };

  const revealOlderLogs = () => {
    const el = logRef.current;
    const previousHeight = el?.scrollHeight || 0;
    const previousTop = el?.scrollTop || 0;
    setRenderedLogLimit((current) => Math.min(filteredLogs.length, current + LOG_RENDER_STEP));
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.scrollTop = previousTop + Math.max(el.scrollHeight - previousHeight, 0);
    });
  };

  const copyVisibleLogs = async () => {
    const text = filteredLogs.map((item) => `[${item.time}] ${item.message}`).join("\n");
    if (!text) {
      onToast?.("没有可复制的日志", "error");
      return;
    }
    const ok = await copyText(text);
    onToast?.(ok ? `已复制 ${filteredLogs.length} 行日志` : "复制失败", ok ? "success" : "error");
  };

  const levelFilters: Array<{ id: "all" | LogTone; label: string }> = [
    { id: "all", label: "全部" },
    { id: "error", label: "错误" },
    { id: "warn", label: "警告" },
    { id: "success", label: "成功" },
    { id: "info", label: "流程" },
  ];

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="space-y-3 border-b border-slate-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-slate-600" />
              {title}
            </CardTitle>
            <CardDescription>{lastError ? `最近错误：${lastError}` : description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyVisibleLogs()}>
              <Copy className="h-3.5 w-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onClearView?.();
                onToast?.(running ? "视图已清空，将继续接收新日志" : "日志视图已清空");
              }}
              disabled={!onClearView}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清空视图
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="搜索日志内容或时间…"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {levelFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLogLevel(item.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition",
                  logLevel === item.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <Switch
              checked={autoScroll}
              onCheckedChange={(checked) => {
                setAutoScroll(checked);
                if (checked) {
                  userPinnedRef.current = false;
                  requestAnimationFrame(jumpToBottom);
                }
              }}
              label="自动滚动"
            />
            <span>自动滚动</span>
          </label>
        </div>
      </CardHeader>

      <CardContent className="relative p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", running ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
            {running ? statusRunningLabel : statusIdleLabel}
          </span>
          <span className="tabular-nums">
            {extraMeta ? `${extraMeta} · ` : ""}
            显示 {renderedLogs.length} / {filteredLogs.length} · 缓冲 {logs.length}
          </span>
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {renderedLogs.length ? `最新日志：${renderedLogs[renderedLogs.length - 1].message}` : ""}
        </div>

        <div
          ref={logRef}
          onScroll={onLogScroll}
          role="log"
          aria-label={ariaLabel}
          aria-live="off"
          className="font-mono-log h-[50dvh] min-h-[360px] max-h-[640px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 sm:h-[540px] sm:p-4"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-slate-500">
              <div>{logs.length === 0 ? (running ? emptyRunningHint : emptyIdleHint) : "没有符合筛选条件的日志。"}</div>
            </div>
          ) : (
            <>
              {hiddenFilteredLogCount > 0 ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-sans text-xs text-slate-500">
                  <span>为保持流畅，前面 {hiddenFilteredLogCount} 行暂未生成页面节点。</span>
                  <button
                    type="button"
                    onClick={revealOlderLogs}
                    className="font-medium text-sky-600 hover:text-sky-700"
                  >
                    再显示 {Math.min(LOG_RENDER_STEP, hiddenFilteredLogCount)} 行
                  </button>
                </div>
              ) : null}
              {renderedLogs.map((item) => (
                <LogLine key={item.id} item={item} />
              ))}
            </>
          )}
        </div>

        {showJumpBottom ? (
          <button
            type="button"
            onClick={jumpToBottom}
            className="absolute bottom-8 right-8 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:bg-slate-50"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            回到底部
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
