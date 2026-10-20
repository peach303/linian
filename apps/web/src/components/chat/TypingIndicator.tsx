/** 「梦角正在输入…」指示器（由 rules.chat.typingIndicator 控制是否显示） */
export function TypingIndicator({ name = '梦角' }: { name?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-ink-sub">
      <span className="flex gap-0.5 rounded-lg bg-surface px-2.5 py-2 shadow-card">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
            style={{ animationDelay: `${i * 120}ms`, animationDuration: '1s' }}
          />
        ))}
      </span>
      <span>{name}正在输入…</span>
    </div>
  )
}
