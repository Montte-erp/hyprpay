import { tv } from "tailwind-variants";

export const card = tv({
  base: [
    "group/card flex flex-col rounded-xl bg-card text-card-foreground ring-1 ring-border",
    "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
    "*:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  ],
  variants: {
    size: {
      default: "gap-6 py-6",
      sm: "gap-4 py-4 text-sm",
    },
  },
  defaultVariants: { size: "default" },
});

export const cardAction = tv({
  base: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
});

export const cardContent = tv({
  base: "px-6 group-data-[size=sm]/card:px-4",
});

export const cardDescription = tv({
  base: "text-base text-muted-foreground group-data-[size=sm]/card:text-sm",
});

export const cardFooter = tv({
  base: "flex items-center rounded-b-xl border-t bg-muted/50 p-6 group-data-[size=sm]/card:p-4",
});

export const cardHeader = tv({
  base: [
    "@container/card-header grid auto-rows-min items-start gap-1 px-6 group-data-[size=sm]/card:px-4",
    "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
  ],
});

export const cardTitle = tv({
  base: "font-heading text-xl font-medium leading-snug group-data-[size=sm]/card:text-base",
});
