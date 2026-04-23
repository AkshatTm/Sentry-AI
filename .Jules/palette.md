## 2026-04-23 - Missing Button Semantics
**Learning:** Generic `<button>` and `<motion.button>` components often lack explicit `type="button"` and `aria-label` attributes. Without `type="button"`, buttons inside forms default to `type="submit"`, leading to accidental form submissions. Missing `aria-label`s on icon-only buttons severely impairs screen reader accessibility.
**Action:** Always verify that generic or icon-only `<button>` and `<motion.button>` elements are explicitly assigned `type="button"` and a descriptive `aria-label`.
