## 2024-04-24 - Interactive Elements Requiring Hover & Focus
**Learning:** When implementing animated tooltips or revealed helper text on custom interactive elements (like `SensorDot` or `motion.button`), coupling `onMouseEnter` and `onMouseLeave` is insufficient for keyboard users. Furthermore, giving these custom wrappers interactive roles like `role="status"` instead of `role="button"` breaks semantic meaning when focusable.
**Action:** Pair `onFocus` and `onBlur` handlers with mouse events, provide `tabIndex={0}`, an interactive `role` (e.g., `button`), and an `aria-label` to ensure keyboard accessibility. Also ensure generic `<button>` elements have explicit `type="button"` attributes to prevent accidental form submissions.

## 2024-05-17 - Missing explicit types and aria labels on custom UI buttons
**Learning:** Found several decorative or interactive elements utilizing generic HTML `<button>` or `motion.button` tags that were missing an explicit `type="button"` and accessible `aria-label`s, especially on custom list-mapping items and icon-only tools. These buttons can cause unintended form submissions or be unreadable to screen readers when they don't have text.
**Action:** Ensure all interactive components map proper `aria-label` descriptions (even dynamic ones) and explicit `type="button"` values to avoid form side effects and poor a11y.
