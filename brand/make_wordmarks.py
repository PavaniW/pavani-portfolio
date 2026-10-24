# Builds pavaniii.w wordmarks from hand-drawn geometric letters.
# Every logo is one colour (currentColor) so it can be recoloured for any brand.

def ring(cx, r_out=50, r_in=20, cy=150):
    return (f"M{cx-r_out},{cy} a{r_out},{r_out} 0 1,0 {2*r_out},0 a{r_out},{r_out} 0 1,0 {-2*r_out},0 Z "
            f"M{cx-r_in},{cy} a{r_in},{r_in} 0 1,1 {2*r_in},0 a{r_in},{r_in} 0 1,1 {-2*r_in},0 Z")

def p(x):  return f'<path d="{ring(x+50)}"/><path d="M{x},100 H{x+30} V245 a15,15 0 0,1 -30,0 Z"/>'
def a(x):  return f'<path d="{ring(x+50)}"/><rect x="{x+70}" y="100" width="30" height="100"/>'
def v(x):  return f'<path d="M{x},100 H{x+34} L{x+50},148 L{x+66},100 H{x+100} L{x+60},200 H{x+40} Z"/>'
def n(x):  return f'<path d="M{x},200 V150 A50,50 0 0,1 {x+100},150 V200 H{x+70} V150 A20,20 0 0,0 {x+30},150 V200 Z"/>'
def i(x):  return f'<rect x="{x}" y="100" width="30" height="100" rx="0"/><circle cx="{x+15}" cy="70" r="16"/>'
def dot(x):return f'<circle cx="{x+16}" cy="184" r="16"/>'
def u(x):  return f'<path d="M{x},100 V150 A50,50 0 0,0 {x+100},150 V100 H{x+70} V150 A20,20 0 0,1 {x+30},150 V100 Z"/>'
def w(x):  return u(x) + u(x+70)

WIDTH = {p: 100, a: 100, v: 100, n: 100, i: 30, dot: 32, w: 170}
WORD = [p, a, v, a, n, i, i, i, dot, w]

def build(gap, gaps_override=None):
    x, parts = 0, []
    for k, f in enumerate(WORD):
        parts.append(f(x))
        g = gaps_override[k] if gaps_override and k in gaps_override else gap
        x += WIDTH[f] + g
    return "".join(parts), x - gap

def svg(inner, width, extra_defs="", attrs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 40 {width+20} 230" '
            f'fill="currentColor" fill-rule="evenodd" {attrs}>{extra_defs}{inner}</svg>\n')

# 1. Clean: even spacing, three plain i's
inner, wd = build(12)
open("wm-1-clean.svg", "w").write(svg(inner, wd))

# 2. Kissing: letters overlap so the word fuses into one continuous shape
inner, wd = build(-8, {5: 8, 6: 8, 7: 6, 8: 6})
open("wm-2-kissing.svg", "w").write(svg(inner, wd))

# 3. Sliced: one diagonal cut runs through the whole word (stays transparent)
inner, wd = build(12)
cut = (f'<defs><mask id="slice"><rect x="-20" y="0" width="{wd+40}" height="300" fill="#fff"/>'
       f'<path d="M-20,178 L{wd+20},118 L{wd+20},128 L-20,188 Z" fill="#000"/></mask></defs>')
open("wm-3-sliced.svg", "w").write(svg(f'<g mask="url(#slice)">{inner}</g>', wd, cut))
print("ok")
