# Export font

Noto Sans SC variable TrueType font, unmodified upstream font from the Noto CJK
Sans2.004 release. Source:
https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf

SIL Open Font License 1.1 is distributed as OFL.txt beside the font.
`tools/prepare_export_font.py` instantiates weight 400, retains copyright/license,
renames the derivative family to Campthink Export Sans, and removes the unsupported
variation-sequence cmap. Only that readable Regular font is packaged in the backend
for PDF subsets; the original variable font is a reproducible build input excluded
from the JAR. Neither is fetched from the internet at export time. Font hashes are
recorded in the task receipt. Exact source Unicode is retained in PDF ToUnicode;
unsupported/ambiguous glyphs fail explicitly rather than becoming blank squares.
