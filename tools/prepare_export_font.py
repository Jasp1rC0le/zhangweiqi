"""Reproducibly instantiate the licensed export font at readable Regular weight."""
from pathlib import Path
import hashlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1] / 'campus-ai-server/src/main/resources/fonts'
original = root / 'NotoSansSC-VF.ttf'
if hashlib.sha256(original.read_bytes()).hexdigest() != 'd68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964':
    raise SystemExit('Unexpected source font; nothing modified')
font = TTFont(original)
regular = instantiateVariableFont(font, {'wght': 400}, inplace=False)
for entry in regular['name'].names:
    replacement = {1: 'Campthink Export Sans', 2: 'Regular', 4: 'Campthink Export Sans Regular',
                   6: 'CampthinkExportSans-Regular', 16: 'Campthink Export Sans', 17: 'Regular'}.get(entry.nameID)
    if replacement is not None:
        entry.string = replacement.encode(entry.getEncoding())
# Variation sequences are not supported by the PDF encoder; never promise they were rendered.
regular['cmap'].tables = [table for table in regular['cmap'].tables if table.format != 14]
output = root / 'CampthinkExportSans-Regular.ttf'
regular.save(output)
regular.close()
font.close()
print('Regular export font created; original font, copyright and SIL OFL retained.')
