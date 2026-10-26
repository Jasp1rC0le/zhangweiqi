// DEV-only file encoders for the stateful synthetic workflow. Production uses the authenticated Java service.
import {zipSync,strToU8} from 'fflate'
import {dayNumber} from '../src/utils/timetable.js'
const heads=['日期','星期','开始钟点','结束钟点','时间或节次','课程','教室','任课教师','班级或教学组','来源','状态']
const source=r=>r.sources.length>1?'个人导入与教学合并':r.sources[0]==='TEACHING'?'教学安排':'个人导入'
const cells=r=>[r.date,'周'+'日一二三四五六'[new Date(r.date+'T12:00:00Z').getUTCDay()],r.startTime||'',r.endTime||'',r.timeLabel,r.name,r.room,r.teacher,r.className,source(r),r.cancelled?'已取消':'已安排']
const xml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
function xlsx(rows,filter,scope){
  const col=n=>String.fromCharCode(65+n),row=(n,values)=>`<row r="${n}" ht="32" customHeight="1">${values.map((v,i)=>{const numeric=typeof v==='number';if(v==='')return`<c r="${col(i)}${n}"/>`;return`<c r="${col(i)}${n}" s="${n===5?1:numeric&&i===0?2:numeric?3:0}" ${numeric?'':'t="inlineStr"'}>${numeric?`<v>${v}</v>`:`<is><t xml:space="preserve">${xml(v)}</t></is>`}</c>`}).join('')}</row>`
  let sheet=row(2,['课程安排'])+row(3,[`${filter.from} 至 ${filter.to}（北京时间）`])+row(4,[`${scope}，${rows.length}项，模拟下载快照`])+row(5,heads)
  rows.forEach((r,i)=>{const v=cells(r);v[0]=dayNumber(r.date)+25569;for(const j of [2,3])if(v[j]){const [h,m]=v[j].split(':').map(Number);v[j]=(h*60+m)/1440}sheet+=row(i+6,v)})
  const entries={
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="课程安排" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F5FA"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf fontId="0" fillId="0" borderId="0"><alignment wrapText="1" vertical="center"/></xf><xf fontId="1" fillId="2" borderId="0"><alignment wrapText="1" horizontal="center" vertical="center"/></xf><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="2" ySplit="5" topLeftCell="C6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${[15,8,11,11,24,30,28,24,32,25,11].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheet}</sheetData><autoFilter ref="A5:K${rows.length+5}"/></worksheet>`,
  }
  return zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])))
}
async function pdf(rows,filter,scope){
  const [{PDFDocument,rgb},fontkit,fontUrl]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit'),import('./fonts/CampthinkExportSans-Regular.ttf?url')])
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit.default);const font=await doc.embedFont(await(await fetch(fontUrl.default)).arrayBuffer(),{subset:true});let page,y
  const line=(s,x,top,size=10)=>page.drawText(s,{x,y:top,size,font,color:rgb(.16,.2,.24)})
  const wrap=(s,width)=>{const lines=[];let current='';for(const c of s){if(c==='\n'||current&&font.widthOfTextAtSize(current+c,10)>width){lines.push(current);current=c==='\n'?'':c}else current+=c}lines.push(current);return lines}
  for(const r of rows){const columns=[r.date+'\n'+cells(r)[1],r.timeLabel,r.name+'\n'+source(r),r.room,r.teacher||'未提供',r.className],widths=[86,106,178,138,116,154],lines=columns.map((s,i)=>wrap(s,widths[i]-12)),height=Math.max(44,Math.max(...lines.map(a=>a.length))*15+16)
    if(!page||y-height<40){page=doc.addPage([842,595]);line('课程安排（模拟）',32,550,20);line(`${filter.from} 至 ${filter.to}（北京时间）`,32,526);line(scope,32,508);y=474;page.drawRectangle({x:32,y:y-25,width:778,height:25,color:rgb(.95,.96,.98)});let x=32;['日期','时间或节次','课程与来源','教室','任课教师','班级或教学组'].forEach((h,i)=>{line(h,x+6,y-17);x+=widths[i]});y-=25;line('Campthink · 本页内存合成数据，不是学校资料',32,18,8)}
    let x=32;lines.forEach((a,i)=>{a.forEach((s,j)=>line(s,x+6,y-16-j*15));x+=widths[i]});y-=height;page.drawLine({start:{x:32,y},end:{x:810,y},thickness:.5,color:rgb(.88,.9,.92)})
  }
  return doc.save()
}
export async function syntheticScheduleFile(rows,filter,scope,at){
  const format=filter.format
  if(format==='XLSX')return{bytes:xlsx(rows,filter,scope),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
  if(format==='PDF')return{bytes:await pdf(rows,filter,scope),mime:'application/pdf'}
  if(format==='JSON')return{bytes:strToU8(JSON.stringify({schema:'campthink.schedule-export.v1',filter,scope,timezone:'Asia/Shanghai',entries:rows})),mime:'application/json'}
  if(format==='CSV'){const cell=v=>{let s=String(v??'').replace(/\p{Cc}/gu,' ');if(/^[\s\uFEFF]*[=+@-]/u.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"'};return{bytes:strToU8('\uFEFF'+[['课程安排（模拟）',scope,filter.from,filter.to,'北京时间'],heads,...rows.map(cells)].map(a=>a.map(cell).join(',')).join('\r\n')+'\r\n'),mime:'text/csv;charset=UTF-8'}}
  if(rows.some(r=>!r.startTime||!r.endTime))throw new Error('未核定钟点不能生成ICS；可换用表格')
  const esc=s=>s.replaceAll('\\','\\\\').replaceAll('\r\n','\\n').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,'),fold=s=>{let result='',n=0;for(const c of s){const count=strToU8(c).length;if(n+count>75){result+='\r\n ';n=1}result+=c;n+=count}return result+'\r\n'},utc=s=>new Date(s).toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'
  let value='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Campthink//Synthetic Export//ZH\r\n';for(const r of rows)value+=['BEGIN:VEVENT','UID:'+r.id+'@campthink.cn','DTSTAMP:'+utc(at),'DTSTART:'+utc(r.date+'T'+r.startTime+':00+08:00'),'DTEND:'+utc(r.date+'T'+r.endTime+':00+08:00'),'SUMMARY:'+esc(r.name),'LOCATION:'+esc(r.room),'DESCRIPTION:'+esc('任课教师：'+r.teacher+'；来源：'+source(r)),'STATUS:'+(r.cancelled?'CANCELLED':'CONFIRMED'),'END:VEVENT'].map(fold).join('');value+='END:VCALENDAR\r\n';return{bytes:strToU8(value),mime:'text/calendar;charset=UTF-8'}
}
