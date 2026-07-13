---
name: taste
description: High-agency frontend design framework for building premium, non-generic UIs. Use when designing or building frontend interfaces, dashboards, landing/hero sections, or when choosing typography, layout, motion, or visual styling — especially to avoid "AI slop" aesthetics. Encodes opinionated defaults for React/Next.js + Tailwind, motion, layout, and surface/texture.
---

# Taste Skill — High-Agency Frontend Design Framework
# Source: https://github.com/Leonxlnx/taste-skill

## Global Configuration
- DESIGN_VARIANCE: 8 (layout experimentation — high)
- MOTION_INTENSITY: 6 (animation amount — moderate-high)
- VISUAL_DENSITY: 4 (content density — lean)

Override these dynamically per request, but these are the defaults.

## Stack Defaults
- React / Next.js with Server Components
- Tailwind CSS v3/v4 (use version-specific syntax)
- Icons: `@phosphor-icons/react` or `@radix-ui/react-icons` exclusively

## Critical Viewport Rule
**NEVER use `height: 100vh` for Hero sections. ALWAYS use `min-height: 100dvh`** — prevents layout jumping on mobile browsers.

## Anti-AI-Slop Rules (enforce on every edit)
- No emojis anywhere in code or content
- No purple/neon aesthetic or "AI-style" glows
- No excessive card overuse — use negative space and borders instead
- No generic placeholder names ("John Doe", "Acme Corp")
- No serif fonts in dashboards (reserved for editorial designs only)
- No 3-column card layouts as default
- Never use Inter for premium designs — use Geist, Outfit, Cabinet Grotesk, or Satoshi

## Typography Defaults
Preferred: `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`
Avoid: Inter (too generic for premium work)

## Animation Philosophy (MOTION_INTENSITY > 5)
- Use Framer Motion `useMotionValue` and spring physics (`stiffness: 100, damping: 20`) — NOT React state — to prevent mobile performance collapse
- Complex scroll animations: GSAP or ThreeJS in isolation — never mix with Framer Motion
- Perpetual micro-interactions on interactive elements

## Layout Principles
- Asymmetric "Bento 2.0" grid architecture for dashboards
- Five card micro-animation archetypes: Intelligent List, Command Input, Live Status, Wide Data Stream, Contextual UI Focus Mode
- Maximise negative space — content doesn't need to fill every column
- Broken grids over symmetric layouts
- Whitespace maximisation, parallax stacks, split-screen scroll

## Surface & Texture
- True glassmorphism (backdrop-filter + subtle border)
- Spotlight borders
- Grain overlays
- Tinted shadows (never flat/generic drop-shadows)

## Pill Badge Rule
- Never use `border-radius: 20px+` for tags/badges on editorial/portfolio work
- Use `border-radius: 3px` or `2px` — sharp, refined
