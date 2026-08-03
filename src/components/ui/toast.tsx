"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CheckCircle2, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitive.Provider

/** Re-exported so callers can do `const toast = useToast(); toast.add({ title: "Archived" })`. */
const useToast = ToastPrimitive.useToastManager

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed top-auto right-0 bottom-0 z-[100] mx-auto flex w-full max-w-[calc(100%-2rem)] flex-col gap-2 p-4 sm:right-4 sm:bottom-4 sm:max-w-sm",
          className
        )}
        {...props}
      />
    </ToastPrimitive.Portal>
  )
}

/**
 * Renders the current toast stack. Mount once near the root (see layout.tsx),
 * inside a <ToastProvider>.
 */
function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastViewport>
      {toasts.map((toast) => (
        <ToastPrimitive.Root
          key={toast.id}
          toast={toast}
          data-slot="toast"
          className={cn(
            "slate-mark relative flex w-full items-start gap-2.5 rounded-xl border border-border bg-card p-3.5 text-sm text-card-foreground shadow-lg ring-1 ring-foreground/10",
            "select-none",
            "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
            "data-[ending-style]:opacity-0",
            "data-[swipe-direction]:transition-none",
            "transition-all duration-200 ease-out",
            "[&[data-limited]]:hidden"
          )}
          style={{
            transform: "translateY(calc(var(--toast-swipe-movement-y, 0px)))",
          }}
        >
          <div className="mt-0.5 shrink-0 text-primary">
            <CheckCircle2 className="size-4" aria-hidden />
          </div>
          <ToastPrimitive.Content data-slot="toast-content" className="min-w-0 flex-1">
            {toast.title && (
              <ToastPrimitive.Title
                data-slot="toast-title"
                className="font-heading text-sm leading-snug font-medium"
              />
            )}
            {toast.description && (
              <ToastPrimitive.Description
                data-slot="toast-description"
                className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
              />
            )}
          </ToastPrimitive.Content>
          <ToastPrimitive.Close
            data-slot="toast-close"
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <XIcon className="size-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
    </ToastViewport>
  )
}

export { ToastProvider, Toaster, useToast }
