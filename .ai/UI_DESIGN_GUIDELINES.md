# Professional Web UI / UX Design Standard

When designing or implementing any web interface, treat the UI as a professional production product, not a prototype, demo, template, or generic AI-generated dashboard.

The goal is to create interfaces that are:

- modern
- clean
- highly readable
- visually consistent
- intuitive
- responsive
- accessible
- efficient
- professional
- restrained rather than decorative
- pleasant to use for long periods of time

The interface should follow contemporary web-design standards while avoiding short-lived visual gimmicks.

---

## 1. DESIGN PHILOSOPHY

Prioritize, in this order:

1. Usability
2. Information hierarchy
3. Readability
4. Consistency
5. Accessibility
6. Responsiveness
7. Visual polish
8. Decoration

Never sacrifice usability for visual effects.

The interface should feel intentionally designed rather than assembled from unrelated components.

Every visual element should have a purpose.

Avoid unnecessary complexity.

Use progressive disclosure: show users what they need at the moment instead of exposing every possible option simultaneously.

---

# 2. VISUAL HIERARCHY

Every screen must have a clear hierarchy.

A user should quickly understand:

- where they are
- what the page represents
- what information is most important
- what actions are available
- what the primary action is
- what requires attention

Use hierarchy through:

- typography
- spacing
- size
- grouping
- alignment
- contrast
- restrained use of color

Do not rely exclusively on color to communicate meaning.

Primary actions should be visually distinguishable from secondary and tertiary actions.

Avoid having multiple elements competing equally for attention.

---

# 3. LAYOUT

Use clean, predictable layouts.

Prefer established interface structures such as:

- page header
- sidebar navigation
- top navigation
- content container
- section header
- cards
- tables
- panels
- forms
- drawers
- dialogs

Use grids and consistent alignment.

Elements that visually belong together should be spatially grouped.

Unrelated content should have visibly larger separation.

Avoid arbitrary element positioning.

Avoid overly dense layouts unless information density is genuinely required.

For desktop applications, use available screen width intelligently but avoid stretching textual content across excessively wide areas.

Typical readable text containers should generally remain around:

60–80 characters per line.

Large dashboards may use wider layouts, but individual text sections should still remain readable.

---

# 4. SPACING SYSTEM

Use a consistent spacing scale.

Prefer a system based on approximately:

4px / 8px increments.

Example:

4px  
8px  
12px  
16px  
20px  
24px  
32px  
40px  
48px  
64px

Do not introduce arbitrary spacing values without reason.

Maintain consistent:

- component padding
- section gaps
- form spacing
- card padding
- table spacing
- page margins

Whitespace is part of the design.

Do not attempt to fill every empty area.

---

# 5. TYPOGRAPHY

Typography must be highly readable.

Use a restrained type scale.

Typical hierarchy:

Page title  
Section title  
Subsection title  
Body text  
Supporting text  
Metadata / caption

Avoid too many font sizes and font weights.

Recommended approach:

Page title:
28–36px

Section heading:
20–24px

Component heading:
16–18px

Body:
14–16px

Secondary / metadata:
12–14px

Use sufficient line height.

Typical body text:

line-height approximately 1.4–1.6.

Do not use tiny text simply to fit more information.

Use bold text sparingly.

Do not bold entire paragraphs.

Avoid excessive uppercase text.

---

# 6. COLOR SYSTEM

Use a restrained color palette.

Define semantic color roles rather than applying random colors.

At minimum define:

- background
- surface
- elevated surface
- primary text
- secondary text
- muted text
- border
- primary accent
- hover
- focus
- success
- warning
- danger
- informational

Accent color should guide interaction, not dominate the entire UI.

Avoid excessive gradients.

Avoid unnecessary saturated colors.

Avoid using many different accent colors on the same page.

Use semantic colors consistently.

For example:

green → success  
yellow/orange → warning  
red → destructive/error  
blue → informational/primary action

Maintain adequate text/background contrast.

---

# 7. SURFACES AND CARDS

Do not turn every piece of content into a card.

Cards should represent meaningful groups of information.

Prefer:

spacing + typography + subtle separators

when a full card is unnecessary.

When using cards:

- maintain consistent radius
- consistent padding
- subtle border or shadow
- clear hierarchy
- avoid excessive elevation

Do not create "card inside card inside card" layouts unless structurally necessary.

Avoid excessive floating containers.

---

# 8. BORDERS, SHADOWS AND RADIUS

Keep visual effects subtle.

Borders should usually be low contrast.

Use shadows primarily to indicate actual elevation:

- menus
- popovers
- dropdowns
- dialogs
- floating panels

Do not apply strong shadows to every component.

Use a consistent border-radius system.

For example:

small controls: 6–8px  
cards: 8–12px  
dialogs: 12–16px

Avoid excessive pill-shaped components unless they represent:

- tags
- filters
- statuses
- compact controls

Not every button needs to be pill-shaped.

---

# 9. BUTTONS

Use a clear action hierarchy.

Typical button variants:

Primary  
Secondary  
Tertiary / Ghost  
Danger

There should normally be only one visually dominant primary action within a local context.

Buttons must include:

- default state
- hover state
- active state
- focus state
- disabled state
- loading state when appropriate

Button labels should describe actions.

Prefer:

"Create project"

instead of:

"OK"

Prefer:

"Delete document"

instead of:

"Confirm"

Use icons only when they improve recognition.

Do not rely on ambiguous icon-only buttons unless their meaning is universally understood or supported by a tooltip.

---

# 10. ICONS

Use one consistent icon library whenever possible.

Maintain consistent:

- stroke width
- icon size
- visual style

Typical sizes:

16px  
18px  
20px  
24px

Do not mix unrelated icon styles.

Avoid decorative icons that provide no informational value.

Icons should support labels rather than replace them when meaning could be ambiguous.

---

# 11. NAVIGATION

Navigation must be predictable.

Users should always understand:

- their current location
- available destinations
- how to return
- how sections relate to one another

Clearly distinguish the active navigation item.

Do not overload navigation with too many equal-level options.

Group related navigation items when necessary.

Avoid unnecessary nested navigation.

For complex applications consider:

Sidebar → primary navigation  
Tabs → context navigation  
Breadcrumbs → structural location

Do not use all three unless they serve distinct purposes.

---

# 12. FORMS

Forms must feel simple even when the underlying data is complex.

Use clear labels.

Never rely solely on placeholders as field labels.

Group related fields.

Use logical field ordering.

Use appropriate controls:

- text input
- textarea
- select
- combobox
- checkbox
- radio
- switch
- date picker
- file picker

Provide clear validation.

Validation messages should explain:

- what is wrong
- how to correct it

Avoid showing validation errors prematurely while the user is still typing unless immediate validation is genuinely helpful.

Clearly distinguish:

required fields  
optional fields  
disabled fields  
read-only fields

Destructive actions require appropriate confirmation.

---

# 13. TABLES AND DATA-DENSE INTERFACES

Tables should prioritize scanning.

Use:

- aligned columns
- meaningful headers
- appropriate numeric alignment
- restrained separators
- sufficient row height
- predictable actions

Numbers should normally be right-aligned.

Text should normally be left-aligned.

Statuses can use compact semantic badges.

Avoid placing too many buttons directly inside every table row.

Use contextual menus when there are many secondary actions.

For large datasets consider:

- filtering
- search
- sorting
- pagination
- column visibility
- sticky headers

Empty tables should contain meaningful empty states instead of blank areas.

---

# 14. STATES

Every important component must consider all relevant states.

Do not design only the ideal state.

Consider:

- initial
- loading
- empty
- populated
- partial
- error
- offline
- disabled
- unauthorized
- success

Avoid blank screens.

Loading states should reduce perceived waiting time.

Prefer skeletons for structured content when appropriate.

Use spinners primarily for short or localized operations.

---

# 15. EMPTY STATES

Empty states should explain:

1. what the area represents
2. why it is empty
3. what the user can do next

Example:

No projects yet.

Create your first project to start organizing your documentation.

[Create project]

Avoid useless messages such as:

"No data."

---

# 16. FEEDBACK

Every user action should provide appropriate feedback.

Examples:

saved  
deleted  
copied  
uploaded  
updated  
failed

Use:

inline feedback  
toast notifications  
status indicators  
progress indicators

depending on context.

Do not show success notifications for trivial interactions that are already visually obvious.

Never silently fail.

---

# 17. RESPONSIVE DESIGN

Design mobile responsiveness intentionally.

Do not simply shrink the desktop interface.

Consider:

Desktop  
Tablet  
Mobile

On smaller screens:

- stack layouts
- reduce secondary information
- move secondary actions into menus
- convert sidebars into drawers when appropriate
- preserve comfortable touch targets
- avoid horizontal scrolling except for inherently wide data such as complex tables

Touch targets should generally be at least around 44×44px.

---

# 18. ACCESSIBILITY

Accessibility is part of design quality.

Use semantic HTML whenever possible.

Support keyboard navigation.

Interactive elements must have visible focus states.

Do not remove browser focus outlines without providing an equivalent alternative.

Ensure adequate contrast.

Use accessible labels.

Use ARIA only when semantic HTML cannot express the required behavior.

Respect:

prefers-reduced-motion

when animations are present.

Never communicate important meaning exclusively through:

- color
- animation
- position
- icon shape

---

# 19. MICROINTERACTIONS

Animations should help users understand changes.

Keep them subtle and quick.

Typical transition duration:

120–250ms.

Use motion for:

- hover transitions
- expanding panels
- menu appearance
- modal transitions
- state changes
- drag/drop feedback

Avoid:

- unnecessary bouncing
- excessive parallax
- long animations
- decorative motion
- transitions that delay interaction

UI should feel responsive rather than animated.

---

# 20. MODALS AND DIALOGS

Use dialogs only when interruption is justified.

Good uses:

- destructive confirmation
- short focused workflow
- critical decision
- compact editing operation

Avoid placing complex multi-page workflows inside modals.

Dialogs should contain:

clear title  
short explanation when necessary  
main content  
primary action  
secondary/cancel action

Destructive actions should be visually differentiated.

---

# 21. DASHBOARDS

Dashboards should answer important questions quickly.

Prioritize meaningful information rather than maximizing widget count.

Structure dashboards around:

summary → important metrics → trends → details → actions

Avoid dashboards containing many equally weighted colorful cards.

Use visualizations only when they communicate information better than text or numbers.

A single clear metric is often better than a chart.

---

# 22. SEARCH

Search should be easy to discover when content volume justifies it.

Provide:

- visible search entry
- clear placeholder
- keyboard accessibility
- meaningful no-result state

For large applications consider:

global search  
command palette  
quick navigation

Search results should prioritize relevance and clarity.

---

# 23. DARK MODE

If dark mode exists, design it intentionally.

Do not simply invert colors.

Avoid pure black backgrounds across the entire interface.

Prefer layered dark surfaces.

For example:

background  
surface  
elevated surface

Maintain readable contrast without producing excessive glare.

Semantic colors may require different values between light and dark themes.

---

# 24. CONTENT DESIGN

UI text should be concise and human-readable.

Prefer:

"Save changes"

instead of:

"Submit"

Prefer:

"Something went wrong while saving the document."

instead of:

"Error 500."

Technical details may be available separately when useful.

Avoid unnecessary jargon unless the application targets technical professionals who expect it.

---

# 25. VISUAL CONSISTENCY

Before introducing a new UI pattern, check whether an existing pattern can be reused.

The same function should look and behave the same throughout the application.

Keep consistent:

buttons  
inputs  
dialogs  
cards  
tables  
navigation  
badges  
spacing  
icons  
typography

Avoid creating one-off component styles.

---

# 26. DESIGN SYSTEM

Whenever possible define reusable design tokens.

Example categories:

colors  
spacing  
typography  
radius  
shadows  
breakpoints  
z-index  
animation duration

Build reusable components rather than repeatedly styling raw elements.

However, avoid overengineering the design system for small projects.

---

# 27. MODERN WEB DESIGN PRINCIPLES

Favor contemporary design characteristics such as:

- generous but controlled whitespace
- strong typography
- restrained color usage
- subtle surfaces
- soft borders
- clean navigation
- clear hierarchy
- compact but readable controls
- responsive layouts
- contextual actions
- meaningful empty states
- polished loading states
- excellent accessibility

Avoid blindly following temporary visual trends.

Modern does not mean flashy.

Modern means clear, efficient, consistent and polished.

---

# 28. AVOID THE "AI-GENERATED UI" LOOK

Do not default to stereotypical AI-generated interface patterns.

Avoid:

- excessive gradients
- glowing borders
- random purple/blue neon themes
- oversized hero sections inside applications
- unnecessary glassmorphism
- every section inside rounded cards
- excessive pills
- huge border radii
- random floating elements
- excessive shadows
- decorative charts without meaningful data
- enormous typography in normal application screens
- unnecessary icons next to every label
- excessive explanatory text
- unrealistic placeholder statistics
- overly spacious dashboards wasting screen area

The interface should look like it was designed by an experienced product designer rather than generated from a generic UI prompt.

---

# 29. DO NOT REDESIGN WITHOUT REASON

When working on an existing application:

first inspect its existing:

- colors
- typography
- spacing
- components
- navigation
- patterns
- branding

Extend the existing design language rather than replacing it.

Do not redesign unrelated parts of the interface while implementing a feature.

Preserve visual continuity.

If an existing pattern is clearly inconsistent or problematic, improve it systematically rather than introducing another variation.

---

# 30. FUNCTION BEFORE STYLE

Every screen must first work logically.

Before styling, verify:

- what the user wants to accomplish
- what information they need
- what actions are required
- what actions are primary
- what can be hidden
- what can be automated
- what can be simplified

Good interface design often removes elements rather than adding them.

---

# 31. FINAL UI QUALITY CHECK

Before considering any interface complete, review it for:

### Structure

Is the page hierarchy immediately understandable?

### Alignment

Are elements consistently aligned?

### Spacing

Is spacing based on a consistent system?

### Typography

Is the text readable and hierarchy obvious?

### Color

Is color restrained and meaningful?

### Components

Are reusable patterns consistent?

### Actions

Is the primary action obvious?

### States

Are loading, empty and error states handled?

### Responsiveness

Does the interface work across screen sizes?

### Accessibility

Can the interface be used with keyboard and assistive technologies?

### Density

Is the interface neither unnecessarily empty nor overcrowded?

### Consistency

Does this screen look like part of the same application?

### Necessity

Can any element be removed without reducing usability?

If yes, consider removing it.

---

# 32. IMPLEMENTATION RULE

When asked to implement a UI:

Do not immediately start writing components.

First understand:

1. the purpose of the screen
2. the primary user task
3. existing application patterns
4. available design system/components
5. information hierarchy

Then choose the simplest interface that solves the problem.

When multiple UI approaches are possible, prefer the one with:

- fewer interactions
- lower cognitive load
- clearer hierarchy
- fewer visual elements
- stronger consistency with the rest of the application

The final result should feel:

professional, calm, modern, intentional, cohesive and production-ready.

# 33. WEB APPLICATION VS MARKETING WEBSITE

Before designing any interface, determine what type of product is being built.

Do not use the same design patterns for a web application and a marketing website.

A web application exists primarily to help users perform tasks.

A marketing website exists primarily to communicate value, build trust and encourage conversion.

The visual language, density, layout and interaction model should reflect this difference.

---

## WEB APPLICATIONS

Examples:

- documentation systems
- admin panels
- dashboards
- management systems
- productivity tools
- SaaS applications
- self-hosted applications
- inventory systems
- project-management tools
- finance applications
- analytics applications

For web applications prioritize:

1. efficiency
2. information density
3. predictable navigation
4. fast task completion
5. clear hierarchy
6. consistent components
7. low cognitive load
8. keyboard accessibility
9. responsive interaction
10. long-term usability

A web application should feel like a professional tool.

Avoid designing it like a landing page.

Do not use:

- oversized hero sections
- huge marketing headlines
- decorative feature sections
- excessive gradients
- unnecessary illustrations
- full-screen visual storytelling
- large promotional banners inside normal workflows
- excessive whitespace that reduces information density

Application screens should usually prioritize:

navigation → page context → content → actions.

---

# 34. APPLICATION SHELL

For complex applications use a stable application shell.

Typical structure:

Sidebar / navigation  
Top bar  
Page header  
Main content  
Contextual actions

The navigation should remain predictable between screens.

Important application areas should not move depending on page content.

Users should build spatial memory of the interface.

Example:

Sidebar:

Dashboard  
Documents  
Projects  
Search  
Settings

Main content:

Page title  
Description / context  
Primary action  
Filters  
Content

Avoid radically different page structures between sections unless necessary.

---

# 35. APPLICATION INFORMATION DENSITY

Productivity interfaces should use screen space efficiently.

Do not confuse minimalism with emptiness.

Minimalism means:

removing unnecessary elements.

It does not mean:

making every element enormous.

For desktop web applications:

prefer compact but readable UI.

Use whitespace strategically rather than excessively.

Users should be able to see enough useful information without constant scrolling.

---

# 36. APPLICATION PAGE HEADER

Application pages should normally have a compact page header.

Recommended structure:

Page title  
Optional short description  
Primary action  
Optional secondary actions

Example:

Documents

Manage and organize your documentation.

[New document]

Avoid turning every page header into a marketing hero.

---

# 37. APPLICATION SIDEBARS

Sidebars should be functional and restrained.

Use clear navigation groups.

Keep icon usage consistent.

Prefer:

icon + label

for important destinations.

Do not rely on icons alone for primary navigation.

Clearly indicate:

active item  
hover state  
collapsed state  
disabled state

Avoid placing dozens of items at the same hierarchy level.

---

# 38. APPLICATION TOOLBARS

When users frequently interact with content, provide contextual toolbars.

Examples:

search  
filter  
sort  
view switcher  
bulk actions  
create action

Group related controls.

Avoid scattered actions across the entire screen.

Primary actions should remain easy to locate.

---

# 39. APPLICATION CRUD FLOWS

For interfaces that manage objects such as:

documents  
users  
devices  
projects  
assets  
notes  
files  
tasks

use consistent CRUD patterns.

Create  
Read  
Update  
Delete

The user should not have to learn a different interaction model for every resource.

Typical structure:

list → details → edit → save

or:

list → inline action → drawer/dialog

Choose the model appropriate to task complexity.

---

# 40. DETAIL PAGES

For object detail pages prioritize:

identity  
status  
important metadata  
primary actions  
related information  
history/activity

Example structure:

Object name  
Status  
Primary actions

Overview  
Configuration  
Activity  
Permissions

Avoid placing every field in one enormous card.

Break information into logical sections.

---

# 41. SETTINGS

Settings interfaces should prioritize clarity over visual creativity.

Group settings by purpose.

Examples:

General  
Appearance  
Security  
Notifications  
Integrations  
Advanced

Use clear descriptions when a setting has consequences.

Dangerous settings belong in a clearly separated area such as:

Danger Zone

Do not visually emphasize advanced settings more than common settings.

---

# 42. ADMIN INTERFACES

Admin interfaces may require higher information density.

Prioritize:

- visibility
- filtering
- status
- auditability
- bulk operations
- clear destructive actions

Avoid decorative UI.

Administrators typically value:

speed  
clarity  
predictability

over visual storytelling.

---

# 43. MARKETING WEBSITES

Marketing websites have different priorities.

Primary goals may include:

- explaining the product
- communicating value
- establishing trust
- showing differentiation
- presenting features
- encouraging signup/download/contact
- presenting brand identity

Marketing pages may use more expressive visual design than application interfaces.

They may include:

hero sections  
illustrations  
product screenshots  
feature sections  
testimonials  
comparisons  
social proof  
pricing  
FAQ  
calls to action

But the design should still remain restrained and professional.

---

# 44. MARKETING PAGE HIERARCHY

A typical marketing homepage may follow:

Hero  
Value proposition  
Product preview  
Key benefits  
Features  
Use cases  
Proof / trust  
CTA  
Footer

Not every project requires every section.

Only include sections that contribute useful information.

Avoid making pages long simply because modern landing pages are often long.

---

# 45. HERO SECTIONS

Hero sections should communicate:

what the product is  
who it is for  
why it matters  
what the visitor should do next

A strong hero usually contains:

headline  
short supporting statement  
primary CTA  
optional secondary CTA  
visual representation of the product

Avoid vague slogans that do not explain the product.

Bad:

"Transform your digital future."

Better:

"Lightweight self-hosted documentation for teams that want clarity without enterprise bloat."

---

# 46. PRODUCT SCREENSHOTS

For software products, showing the product itself is often more valuable than decorative illustrations.

Prefer authentic interface previews.

Screenshots should:

- demonstrate real workflows
- use realistic content
- match the actual application
- be visually legible
- avoid fake functionality

Do not create misleading product previews.

---

# 47. MARKETING CTA HIERARCHY

Marketing pages should have a clear primary conversion action.

Examples:

Get started  
Try demo  
Download  
View documentation  
Contact sales

Do not display several equally strong CTA buttons next to one another.

Choose one primary conversion path.

Secondary actions should remain visually subordinate.

---

# 48. BRAND EXPRESSION

Marketing surfaces may use stronger brand identity than application surfaces.

This may include:

- brand typography
- distinctive illustration
- accent colors
- product graphics
- subtle gradients
- photography
- motion

However branding must not reduce readability.

The application itself should usually be visually calmer than its marketing website.

---

# 49. LANDING PAGE VISUAL RHYTHM

Alternate content density to create rhythm.

For example:

strong hero  
focused section  
product preview  
short feature grid  
large visual section  
compact CTA

Avoid repeating identical:

three-card sections

throughout the entire page.

The page should feel composed rather than generated from reusable templates.

---

# 50. MARKETING COPY

Marketing copy should be:

specific  
concise  
benefit-oriented  
credible

Avoid excessive buzzwords.

Avoid:

revolutionary  
game-changing  
next-generation  
cutting-edge

unless there is meaningful evidence supporting those claims.

Explain concrete benefits.

Instead of:

"Powerful document management."

Prefer:

"Organize technical documentation, notes and procedures in one lightweight workspace."

---

# 51. PRODUCT APPLICATION VS PRODUCT WEBSITE

A software product may have two distinct visual systems.

### Product website

Purpose:

sell and explain the product.

Can be expressive.

### Application

Purpose:

help users perform work.

Should be calmer and more functional.

They should share:

brand  
colors  
typography  
icon language  
visual identity

but they should not necessarily share identical layouts or density.

Do not copy landing-page patterns directly into the application UI.

---

# 52. APPLICATION UI SHOULD AGE WELL

Avoid design decisions based entirely on temporary trends.

Do not build core application interfaces around trends such as:

extreme glassmorphism  
neon glow  
oversized rounded cards  
excessive gradients  
floating blobs  
3D decorative objects

These may be used selectively in marketing surfaces but should rarely dominate productivity interfaces.

The application should still look professional several years after release.

---

# 53. PRODUCTIVE DESKTOP EXPERIENCE

For applications primarily used on desktop:

take advantage of desktop screen space.

Support:

- wider content
- split views
- persistent navigation
- contextual side panels
- keyboard shortcuts
- data tables
- multi-column layouts

Do not force mobile-style single-column layouts onto desktop users.

---

# 54. MOBILE APPLICATION EXPERIENCE

On mobile, prioritize the most important tasks.

Do not attempt to expose every desktop capability simultaneously.

Use:

bottom sheets  
drawers  
compact menus  
stacked content  
sticky actions

where appropriate.

Primary actions should remain reachable.

Avoid extremely dense desktop tables on mobile.

Provide alternative representations when needed.

---

# 55. RESPONSIVE PRIORITY

Responsive design should answer:

What information is essential?

What can move?

What can collapse?

What can become secondary?

What can be hidden behind an interaction?

Do not simply scale every desktop component down.

---

# 56. DESIGN DECISION RULE

Whenever deciding between two UI approaches, ask:

Which approach allows the user to understand the screen faster?

Which requires fewer decisions?

Which requires fewer clicks?

Which better matches existing patterns?

Which remains understandable without explanation?

Prefer that approach.

---

# 57. PROFESSIONALISM TEST

The interface should look appropriate for a real production product used by paying customers or professionals.

Avoid anything that resembles:

a tutorial project  
a UI framework demo  
a hackathon prototype  
a generic dashboard template  
an automatically generated landing page

Every major visual decision should appear intentional.

---

# 58. FINAL DESIGN CHARACTER

The desired overall impression is:

clean  
modern  
quiet  
structured  
precise  
professional  
trustworthy  
efficient  
polished

The interface should not try to impress users with the number of visual effects.

It should impress them with how easy it is to understand and use.
