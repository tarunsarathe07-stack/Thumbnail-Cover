# ThumbAI Design System

## Colors
- Background (landing): #000000 (black)
- Background (generator): #ffffff (white) 
- Gold accent: #C8962E
- Text primary: #ffffff (on dark), #202020 (on light)
- Text secondary: #888888
- Card surface (landing): rgba dark glassmorphism
- Card surface (generator): #ffffff with border
- Border: #e5e5e5
- Selected state: #C8962E border + #fffbf5 bg
- Error: red
- Success: green

## Typography
- Font family: Inter (all pages)
- Hero heading: bold, large display size
- Section labels: small caps, letter-spaced
- Body: regular weight Inter
- Nav: medium weight

## Components
- Navbar: floating dark pill #121212, centered
- CTA button primary: gold #C8962E, black text, 
  border-radius 40px
- CTA button secondary: white bg, black border, 
  border-radius 40px
- Generate button: black bg, white text, 
  border-radius 40px, full width
- Cards (landing features): pastel backgrounds
  green #e7f7c8, peach #ffe2d3, 
  lavender #e8e1f7, blue #e1ecf7
- Cards (generator): white bg, rounded-xl, 
  subtle shadow
- Input fields: light grey bg, rounded corners
- Aspect ratio cards: white, black border when selected
- Quality cards: white, gold border when selected
- Loading overlay: rgba(0,0,0,0.88) dark

## Pages
- login.html: dark theme, theatre hero background,
  two column layout (hero left, login card right),
  feature cards section below
- generator.html: light theme, white background,
  single column vertical scroll layout
- result.html: light theme, thumbnail preview,
  download + generate another buttons,
  rating section, prompt used section

## Assets
- Hero background: /assets/theatre.jpeg
- Favicon: gold lightning bolt SVG

## Current Issues (to fix)
- Generator is light mode while landing is dark
- Pastel feature cards clash with dark hero
- No depth or glassmorphism in generator
- Buttons lack gradient and glow
- No split workspace layout
