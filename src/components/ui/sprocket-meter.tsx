import { cn } from "@/lib/utils"

/**
 * Sprocket Meter — the signature "Night Splice" component.
 * Reads as a strip of film: perforation notches along the top and bottom
 * edge of the track, a fill segment representing days of clip coverage
 * remaining, and a mono timecode readout ("03d 14h").
 */
function SprocketMeter({
  days,
  label,
  className,
}: {
  /** Days of coverage remaining, may be fractional. */
  days: number
  /** Accessible label describing what this meter measures. */
  label: string
  className?: string
}) {
  const clampedDays = Math.max(days, 0)
  const percent = Math.min((clampedDays / 7) * 100, 100)
  const low = clampedDays <= 3
  const whole = Math.floor(clampedDays)
  const hours = Math.round((clampedDays - whole) * 24)

  return (
    <div className={cn("w-full", className)} data-slot="sprocket-meter">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-3 w-full overflow-hidden rounded-[3px] bg-muted ring-1 ring-foreground/5"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, var(--dim) 0, var(--dim) 2px, transparent 2px, transparent 6px)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, var(--dim) 0, var(--dim) 2px, transparent 2px, transparent 6px)",
          }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500"
          style={{
            width: `${percent}%`,
            backgroundColor: low ? "var(--tungsten)" : "var(--splice)",
          }}
        />
      </div>
      <p className="timecode mt-1.5 text-right text-xs text-muted-foreground">
        {String(whole).padStart(2, "0")}d {String(hours).padStart(2, "0")}h
      </p>
    </div>
  )
}

export { SprocketMeter }
