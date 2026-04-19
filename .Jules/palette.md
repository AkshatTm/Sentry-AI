## 2024-05-30 - Button missing type attribute and aria label
**Learning:** Found some buttons not having type=button and aria-labels in setup page. Nextjs/React throws warnings if you don't explicitly pass type to buttons or if it's icon only it needs aria-labels for accessibility.
**Action:** Adding type="button" and aria-label properties where necessary across frontend/src/app
