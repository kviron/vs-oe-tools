import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'h-5 gap-1 rounded-full border border-transparent px-2 py-0.5 text-[0.625rem] font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-2.5! group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive: 'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground bg-input/20 dark:bg-input/30',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-link underline-offset-4 hover:underline',
        class: 'border-kind-class/40 bg-kind-class/15 text-kind-class',
        method: 'border-kind-method/40 bg-kind-method/15 text-kind-method',
        module: 'border-kind-method/40 bg-kind-method/15 text-kind-method',
        attribute: 'border-kind-attribute/40 bg-kind-attribute/15 text-kind-attribute',
        lifecycle: 'border-kind-lifecycle/40 bg-kind-lifecycle/15 text-kind-lifecycle',
        journal: 'border-kind-journal/40 bg-kind-journal/15 text-kind-journal',
        list: 'border-kind-list/40 bg-kind-list/15 text-kind-list',
        object: 'border-kind-object/40 bg-kind-object/15 text-kind-object',
        statusNew: 'border-task-status-new/40 bg-task-status-new/15 text-task-status-new',
        statusWork: 'border-task-status-work/40 bg-task-status-work/15 text-task-status-work',
        statusReview: 'border-task-status-review/40 bg-task-status-review/15 text-task-status-review',
        statusDone: 'border-task-status-done/40 bg-task-status-done/15 text-task-status-done',
        statusPaused: 'border-task-status-paused/40 bg-task-status-paused/15 text-task-status-paused',
        statusBlocked: 'border-task-status-blocked/40 bg-task-status-blocked/15 text-task-status-blocked',
        priorityCritical: 'border-task-priority-critical/40 bg-task-priority-critical/15 text-task-priority-critical',
        priorityHigh: 'border-task-priority-high/40 bg-task-priority-high/15 text-task-priority-high',
        priorityNormal: 'border-task-priority-normal/40 bg-task-priority-normal/15 text-task-priority-normal',
        priorityLow: 'border-task-priority-low/40 bg-task-priority-low/15 text-task-priority-low',
        taskNeutral: 'border-task-neutral/40 bg-task-neutral/15 text-task-neutral',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
