# Technical instructions for execution

## Copy
Think very deeply about the product, audience, ICP, call to action, and text that should appear on page. Then, produce a set of words, quips, paragraphs, etc. that you think would be idea for this app. Once you've produced a set of text, perform a review audit. Continue to improve the text until it's 10/10-- like something Steve Jobs would greenlight.

## Tech stack

Use Context7 generally speaking to learn more about how to use these APIs

## Coding guidelines
- **Very important** Use as much of our core component library  as much as possible. You can use Context7 to read about these docs more in detail.
- **Very important** Use the UI component library for EVERYTHING! Do NOT write custom CSS or your own components. Background images, headers, icons, styling, etc. all comes from the UI library.
- You may also install an icons library as needed.
- Ensure you test everything on a distinct, open port.
- Pretend you are blind and the only way visually understand this website is to look at screenshots and console logs. In other words, do not just rely on looking at code to produce the result.
- Use the ligthouse MCP to monitor for performance. You are not allowed to complete your task unless the app is extremely optimized.
- Every time you make a significant update or change, use the playwright MCP to take a screenshot. Then look at the page and assess on a score from 1-10 how good the page looks. Keep making updates until it's a 10/10. Be extremely critical, pay attention to the small details, make sure text makes sense, etc.
- When using screenshots to understand the page, look at sections at a time rather than the entire page all at once. This way you can come up with more granular feedback. Overlapping components, truncated text, overflow issues, thin margins, bad padding, etc. MUST be eliminated.
- Make sure the page is responsive and looks good on mobile as well. Ensure you test by looking at screenshots at different resolutions.
- Continue on repeat look until you arrive at an incredible looking webpage. Don't cut corners, take as much time as you need.
- Update .gitignore accordingly
- If you're stuck, look at ~/Projects/repatch for a good sense of what content being produced might look like.

## UI guidelines

- The site should immediately feel like a premium agency-designed landing page — think "modern devtool + motion studio," not generic template. Avoid anything that looks like default browser styling or boilerplate Tailwind components. Every major element (buttons, cards, nav, sections) should feel like it came from the UI library. You can accomplish this by using as many components as possible from the library.
- Use a limited, opinionated visual language.
- The hero needs at least one signature animated component, not just text over a gradient. Again, use what we have in the UI library.
- Add micro-motion to the CTA area
- Headings should be short, punchy, and scannable. Avoid generic SaaS headlines; anchor them in what Repatch actually does
- Every major section should have at least one of scrollable storytelling blocks and data or product-feeling UI mockups. Design fake Repatch UI surfaces (not real screenshots, but stylized “pseudo UI”)
- Do not make your own backgrounds. The UI libs should generally have their own background components. Use native background components or colors suggested by the UI library. Use suggested colors by the UI library.
- When using the UI library, start with very simple components-- things that don't have a ton of animations. Then, you can garnish the page with them. Don't go overboard. Start with fundamentals first.
- Make sure there is both a dark mode and a light mode and they both look good.
- You can generate fake screenshots (i.e. components that mock what Repatch does) as figures or images for the site.
- For sections that show different services/apps being connected, use appropriate components.
- Be sure you think very deeply about the right components that fit in. Feel free to experiment by placing things in, see if they look nice. If they don't fit (i.e. not a 10/10) that's fine! Find something else that has good composition.
- DO NOT excessively use gradients. Writing your own gradients are the enemy. Just rely on the component libraries and their colors from scratch.
- Do NOT use generic icons/logos for the brand.
- Along the way, please validate the score using Lighthouse in order to ensure that the page is performant.

# Quality Control

As the website is being built and as it is being reviewed, ensure you kick off processes and reviews to account for the following:

## Accessibility
Ensure you follow standard accessibility protocols:
- WCAG 2.1/2.2 guidelines (Level A, AA, AAA)
- ADA compliance and Section 508 standards
- ARIA (Accessible Rich Internet Applications) specification
- Assistive technology testing (screen readers, keyboard navigation, voice control)
- Inclusive design principles and methodologies
- Accessibility auditing and remediation
- Automated and manual testing techniques
- Disability awareness and user needs across diverse abilities
- Provide text alternatives for non-text content
- Provide captions and alternatives for multimedia
- Create content that can be presented in different ways
- Make it easier to see and hear content (contrast, text sizing, audio control)

## Screenshot review
When reviewing screenshots, follow this rubrick. The goal is to arrive at 10/10 for every glimpse into the page.
- Text or icons overlapping images, borders, or other components?
- Icons or badges touching container edges with no padding?
- Lines that run very long side-to-side, making paragraphs look like walls of text?
- Table cells that cut off important values or labels without hover affordance.
- Nav items with uneven spacing between them.
- Logo not aligned with the main content column.
- Header content that visually “leans” to one side because of poor alignment or uneven padding.
- Does my eye go to the most important thing first (hero, main CTA)?
- Is there a clear second and third point of focus?
- Are low-importance elements (nav, footnotes) visually quieter?
- Are columns and card edges perfectly aligned?
- Do text blocks and buttons share common left/right alignments?
- Are things “almost” aligned (1–2px off) anywhere?
- Is there a consistent spacing scale (e.g. 8 / 16 / 24 / 32) between elements?
- Are related items closer together than unrelated ones?
- Is vertical spacing between sections consistent across the page?
- Are there clear, reused text styles (H1, H2, body, caption)?
- Are font sizes, weights, and letter-spacing consistent for each role?
- Is body text readable (line length ~50–80 chars, comfortable line-height)?
- Is there a small, deliberate palette (brand colors + neutrals), not a rainbow?
- Are certain colors used consistently for meaning (primary CTA, errors, links)?
- Do all buttons look like they’re from the same family (radius, padding, font)?
- Do cards, inputs, badges use consistent corner radii and shadows?
- Are similar elements styled identically across different sections?
- Is there adequate margin from the viewport edges?
- Do sections have breathing room between them?
- Does anything feel noticeably more cramped or more airy than the rest?
- Are all icons from the same set (same stroke width, style, size)?
- Do images/illustrations support the content instead of feeling random/stocky?
- Are all interactive elements clearly identifiable (buttons look clickable)?
- Is the primary CTA clearly more prominent than secondary actions?
- Do inputs look like inputs, not just text on a line?
- Does the page feel like one cohesive “voice” (type, color, imagery all match)?
- Could each section belong to the same product/brand?

# Design Principles
You tend to converge toward generic, "on distribution" outputs. In frontend design,this creates what users call the "AI slop" aesthetic. Avoid this: make creative,distinctive frontends that surprise and delight. 

Focus on:
- Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.
- Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.
- Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.
- Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!

## Typography
Deliberately choose a set of fonts, accents, colors, and styles for text. Think deeply about the theme and the brand and choose a set of canonical fonts that should be used across the entire site. Avoid generic and default fonts; try to match the theme being built.

## Colors
Define a color pallete that will be the basis of all colors on the site.

## Design standards
- Do NOT use custom gradients. All custom gradients are forbidden. You MAY use gradients only if they were created by the UI component library.
- Minimize the use of generic, cheesy icons (i.e. magic wand, sparkle, lightning bolt, etc). Icon use should only be used if the situation calls for it such as a diagram.
- Backgrounds should be nice, and ideally they should use backgrounds from the component library.
- Components should have animations. But animations should not be overly excessive. Not every component needs animations.
- Make use of interesting, eye catching objects, photos, or 3d renders. They should exist but not distract from the core page.
- Ensure components have on-load/on-scroll appropriate animations. Do not be overly excessive though.
- Pill banner components are generally bad.
- Ensure that the UI component library's philosophy is followed.

## Copy
- Copy should be short, quipy, direct, and to the point. An uninformed ready should be able to read the copy from the site and 10/10 be able to describe exactly what the product does and who it solves for.
- Copy, including header paragraphs and the hero, should be short, clear, and direct.
- Perform a review of all copy on the site to ensure it's 10/10 clear and concise.

## Testing procedure
1. Look at the screenshots from Playwright and determine if the site looks good or not.
2. Ensure the page is responsive across different resolutions
3. Ensure the performance is top notch
4. Check that the majority of our components are coming from the preferred component library.

Before completion, do a final rundown.

1. Take screenshots of each section of the website. Ensure proper accessibilty, contrast, good content, no text issues/overflow, etc.
2. Run through the accessibility checklist.
3. Give an overall vibe check. We're aiming for an A+ site. Assume this is going to be Fortune 500 quality. If there are any revisions, even minor, that need to be made, suggest those and we'll restart.
4. Check the text and copy. Do a sweep to make sure the narrative is clear and makes sense. The value prop should be very clear. No fluff, just straightforward value and CTA.
5. Ensure the peformance is highly rated by checking Lighthouse MCP