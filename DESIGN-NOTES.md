# Studio appearance refinement

The shell now uses a neutral shadcn palette. App artwork continues to use its own theme.

| Before | After | Why |
| --- | --- | --- |
| Tall, repeated project statistics | Compact project cards with gallery metadata and language progress | Make the workspace easier to scan |
| Filter bar with clipped triggers and scrollbars | shadcn Tabs with connected panels, counts and keyboard navigation | Keep selection and focus behavior consistent |
| Headers based on window width | Headers based on available content width | Prevent crowded actions beside the sidebar |
| Language filters with clipped mobile controls | Shared Tabs sizing and fitted labels | Keep every filter visible on phones |
| Dense table headers and uneven numeric columns | Muted headers, named action column and right-aligned counts | Improve comparison between languages |

## Color declarations in `ui/src/styles.css`

Every changed declaration is listed below. The common reason is to remove the warm hue bias and use one neutral tonal scale across surfaces, text, controls and navigation. Semantic error colors follow the standard shadcn tokens.

| Theme/token | Previous value | Replacement | Reason |
| --- | --- | --- | --- |
| Light `--background` | `oklch(99% .003 80)` | `oklch(1 0 0)` | One neutral tonal scale |
| Light `--foreground` | `oklch(24% .01 80)` | `oklch(0.145 0 0)` | One neutral tonal scale |
| Light `--card` | `oklch(100% 0 0)` | `oklch(1 0 0)` | One neutral tonal scale |
| Light `--popover` | `oklch(100% 0 0)` | `oklch(1 0 0)` | One neutral tonal scale |
| Light `--primary` | `oklch(53% .16 36)` | `oklch(0.205 0 0)` | One neutral tonal scale |
| Light `--primary-foreground` | `oklch(99% 0 0)` | `oklch(0.985 0 0)` | One neutral tonal scale |
| Light `--secondary` | `oklch(95.5% .006 85)` | `oklch(0.97 0 0)` | One neutral tonal scale |
| Light `--secondary-foreground` | `oklch(28% .01 80)` | `var(--primary)` | One neutral tonal scale |
| Light `--muted` | `oklch(95.5% .006 85)` | `oklch(0.97 0 0)` | One neutral tonal scale |
| Light `--muted-foreground` | `oklch(48% .015 80)` | `oklch(0.556 0 0)` | One neutral tonal scale |
| Light `--accent` | `oklch(94.5% .009 85)` | `oklch(0.97 0 0)` | One neutral tonal scale |
| Light `--accent-foreground` | `var(--foreground)` | `var(--primary)` | One neutral tonal scale |
| Light `--destructive` | `oklch(53% .19 26)` | `oklch(0.577 0.245 27.325)` | Standard semantic error color |
| Light `--border` | `oklch(91% .007 85)` | `oklch(0.922 0 0)` | One neutral tonal scale |
| Light `--input` | `oklch(87% .01 85)` | `var(--border)` | One neutral tonal scale |
| Light `--ring` | `oklch(45% .01 80)` | `oklch(0.708 0 0)` | One neutral tonal scale |
| Light `--radius` | `.6rem` | `0.625rem` | One neutral tonal scale |
| Light `--sidebar` | `oklch(97% .006 85)` | `oklch(0.985 0 0)` | One neutral tonal scale |
| Light `--sidebar-accent` | `oklch(93% .01 85)` | `oklch(0.955 0 0)` | One neutral tonal scale |
| Dark `--background` | `oklch(17% .008 70)` | `oklch(0.145 0 0)` | One neutral tonal scale |
| Dark `--foreground` | `oklch(94% .004 80)` | `oklch(0.985 0 0)` | One neutral tonal scale |
| Dark `--card` | `oklch(20.5% .008 70)` | `oklch(0.205 0 0)` | One neutral tonal scale |
| Dark `--popover` | `oklch(23% .008 70)` | `oklch(0.205 0 0)` | One neutral tonal scale |
| Dark `--primary` | `oklch(74% .13 44)` | `oklch(0.922 0 0)` | One neutral tonal scale |
| Dark `--primary-foreground` | `oklch(18% .02 40)` | `oklch(0.205 0 0)` | One neutral tonal scale |
| Dark `--secondary` | `oklch(27% .009 70)` | `oklch(0.269 0 0)` | One neutral tonal scale |
| Dark `--muted` | `oklch(26% .008 70)` | `oklch(0.269 0 0)` | One neutral tonal scale |
| Dark `--muted-foreground` | `oklch(71% .012 80)` | `oklch(0.708 0 0)` | One neutral tonal scale |
| Dark `--accent` | `oklch(29% .012 70)` | `oklch(0.269 0 0)` | One neutral tonal scale |
| Dark `--destructive` | `oklch(73% .16 25)` | `oklch(0.704 0.191 22.216)` | Standard semantic error color |
| Dark `--border` | `oklch(31% .01 70)` | `oklch(0.31 0 0)` | One neutral tonal scale |
| Dark `--input` | `oklch(36% .012 70)` | `oklch(0.36 0 0)` | One neutral tonal scale |
| Dark `--ring` | `oklch(75% .012 80)` | `oklch(0.556 0 0)` | One neutral tonal scale |
| Dark `--sidebar` | `oklch(19% .008 70)` | `oklch(0.18 0 0)` | One neutral tonal scale |

The obsolete initial HSL sidebar fallback blocks were removed; their declarations were already overridden by the active theme blocks. Sidebar theme aliases stay connected to the same semantic properties.

## Project navigation and narrow layouts (v4.3)

| Before | After | Why |
| --- | --- | --- |
| One long project page, with galleries after the language table | Overview, Galleries and Languages tabs | Reach each task directly |
| Unfinished counts without a next action | A next-step card links to the first unfinished language | Make the overview actionable |
| Wide language tables hide actions offscreen | A desktop table and compact cards on narrow screens | Keep all counts and actions visible |
| Device tabs clipped in narrow workbenches | A shadcn Select when the tabs do not fit | Keep every device reachable |
| Translation fields split at the window breakpoint | Reference and input split only when the field itself has room | Preserve usable input width beside the sidebar |
| Generic reference placeholder and long fallback badges | Specific reference placeholders and a concise fallback badge | Clarify what to write without crowding the label |
| Route tab focus could duplicate history entries | Manual activation for route-changing tabs | Make browser Back and Forward predictable |

No theme color declarations changed in v4.3.
