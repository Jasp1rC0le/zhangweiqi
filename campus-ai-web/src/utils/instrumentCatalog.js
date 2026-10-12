// Original short learning notes with primary-source reference links. Not model-specific SOPs.
export const instrumentSources = {
  scope:{title:'Tektronix · 示波器基础',url:'https://www.tek.com/tw/documents/primer/xyzs-oscilloscopes-primer',scope:'示波器原理学习，不是具体型号手册'},
  dmm:{title:'Keysight · 数字万用表',url:'https://www.keysight.com/zz/en/products/digital-multimeters.html',scope:'仪器类别介绍；接线与额定值以本机手册为准'},
  generator:{title:'Keysight · 33210A 用户指南',url:'https://www.keysight.com/om/en/assets/9018-02202/user-manuals/9018-02202.pdf',scope:'示例型号 33210A；不通用于其他型号'},
  power:{title:'Keysight · 电源与电子负载基础课程',url:'https://www.keysight.com/vn/en/learn/course.power-supply-and-electronic-load-basics.html',scope:'原理课程，不提供本机允许的接线或参数'},
  measure:{title:'Mitutoyo · 精密测量仪器快速指南',url:'https://www2.mitutoyo.co.jp/eng/useful/E11003/',scope:'测量类别参考，分辨率与量程按实物核对'},
  gate:{title:'PASCO · 光电门与计时器',url:'https://help.pasco.com/software/sparkvue/configure-sensors-and-hardware/devices/about-photogates-timers',scope:'PASCO 系列与 Sparkvue 配置说明'},
  force:{title:'PASCO · PS-2104 力传感器',url:'https://www.pasco.com/products/sensors/pasport/pasport-force-sensor',scope:'示例型号 PS-2104，禁止套用其量程到其他传感器'},
  physics:{title:'PASCO · 850 物理实验目录',url:'https://www.pasco.com/resources/lab-experiments/collection/43',scope:'教学实验目录，需另核对选用套件及实验手册'},
  optics:{title:'PASCO · 基础光学实验系统与手册',url:'https://www.pasco.com/products/signature/basic-optics-system',scope:'OS-8515 系列示例，不代表本校设备'},
  ray:{title:'PASCO · 光学转台说明',url:'https://www.pasco.com/products/item/basic-optics-table',scope:'OS-8536 历史型号参考；页面注明已停产'},
  microscope:{title:'Nikon · 显微镜学习中心',url:'https://www.microscope.healthcare.nikon.com/resources/e-learning',scope:'原理与教学入口，需匹配显微镜和物镜型号'},
  balance:{title:'METTLER TOLEDO · 正确称量指南',url:'https://www.mt.com/us/en/home/library/guides/laboratory-weighing/weighing-the-right-way.html',scope:'实验室称量实践；完整资料可能需要注册'},
  ph:{title:'METTLER TOLEDO · pH 测量基础',url:'https://www.mt.com/us/en/home/library/guides/lab-analytical-instruments/pH-measurement-guide.html',scope:'原理与维护参考，需匹配电极与样品'},
  pipette:{title:'METTLER TOLEDO · 移液器选择与维护',url:'https://www.mt.com/gb/en/home/library/white-papers/rainin-pipettes/pipette-choice-and-maintenance.html',scope:'活塞式移液器的使用与维护参考'},
  centrifuge:{title:'Eppendorf · 离心机安全',url:'https://www.eppendorf.com/us-en/lab-academy/life-science/cell-biology/centrifuge-safety/',scope:'安全教育，不是转子或样品的运行许可'},
  uv:{title:'Shimadzu · 分光光度计的结构',url:'https://www.shimadzu.com/an/service-support/technical-support/uv/overview/structure.html',scope:'光学结构与原理，需使用本机测量规程'},
  daq:{title:'NI · 数据采集基础',url:'https://www.ni.com/en/shop/data-acquisition.html',scope:'系统组成与用途，不提供接线额定值'},
  plc:{title:'Siemens · S7-1200 文档导航',url:'https://docs.tia.siemens.cloud/r/simatic_s7_1200_manual_collection_enus_20/introduction/s7-1200-documentation-guide',scope:'S7-1200 系列参考，硬件及固件版本必须匹配'},
}
const item=(id,name,group,source,purpose,readings,check,risk='普通测量')=>({id,name,group,source,purpose,readings,check,risk,checkedAt:'2026-09-24'})
export const instruments=[
  item('oscilloscope','数字示波器','电学与电子','scope','观察信号随时间的变化，比较幅值、周期与时序','时基、垂直档位、探头倍率、触发设置','波形不稳时先记录触发源与探头设置，不直接改动被测设备','需教师确认接线'),
  item('multimeter','数字万用表','电学与电子','dmm','测量电压、电流、电阻等电学量','测量功能、插孔、量程、单位','读数异常先核对测量模式及单位；不得将电流档直接跨接电源','需教师确认接线'),
  item('generator','函数／任意波形发生器','电学与电子','generator','为教学电路提供可设定的测试信号','波形、频率、幅值定义、偏置、负载设置','显示幅值与实测不符时记录负载设置，先与指导书核对','需教师确认接线'),
  item('power-supply','直流稳压电源','电学与电子','power','为经过核准的电路提供直流供电','输出设定、实际读数、恒压／恒流状态','先区分设定值和输出值；由教师确认极性及限流，禁止带电改线','需教师确认接线'),
  item('electronic-load','电子负载','电学与电子','power','模拟负载，学习电源与电池测试原理','工作模式、功率限制、输入极性','出现保护提示时停止实验并核对型号手册，不反复强制启动','需专门培训'),
  item('caliper','游标／数显卡尺','尺寸与计量','measure','测量外径、内径、深度等尺寸','零位、测量位置、分辨率、单位','清洁测量面并核对零位，保持工件与量具正确对齐'),
  item('micrometer','外径千分尺','尺寸与计量','measure','精密测量工件厚度或外径','零位、测力、温度、读数','按本机规定施加测力，不用旋钮强夹工件'),
  item('dial-indicator','百分表／千分表','尺寸与计量','measure','观察相对位移与比较测量偏差','预压量、测头方向、基准、量程','确认支架稳定和测头方向，超出行程停止测量'),
  item('height-gauge','高度尺','尺寸与计量','measure','在基准平台上进行高度比较','基准面、零位、接触位置','先清洁基准与工件，不将划线附件当作通用测头'),
  item('photogate','光电门','力学与传感','gate','用遮光事件记录运动时间','挡光长度、计时模式、采样事件','区分单次遮光与多门计时，检查单位与事件含义'),
  item('force-sensor','力传感器','力学与传感','force','记录拉力或碰撞过程中的力变化','零点、方向、量程、采样率','未受力时核对零点；避免冲击或超量程加载'),
  item('motion-sensor','运动／位移传感器','力学与传感','physics','记录位置变化，辅助分析速度与加速度','时间、位移、采样间隔','先核对坐标方向与遮挡，再分析异常数据'),
  item('temperature','温度传感器','力学与传感','physics','记录温度随时间的变化','探头类型、温度单位、时间','检查接触条件与稳定时间，不超过探头适用范围'),
  item('pressure','压力传感器','力学与传感','physics','观察气体或流体的压力变化','绝对／表压、单位、零点','确认读数基准；压力装置由教师核准','需专门培训'),
  item('sound','声学传感器','力学与传感','physics','研究声波与频率特征','采样率、时间、幅度单位','区分相对信号和经校准的声压级'),
  item('optics-bench','光具座与透镜组','光学','optics','学习成像，记录物距、像距与焦距关系','光学元件位置、读数基准、像清晰度','先核对元件位置与基准，不直接注视强光或激光','需教师确认光源'),
  item('ray-table','光学转台／折射实验台','光学','ray','观察反射与折射并读取角度','法线位置、入射角、折射角','区分相对法线与相对表面的角度','需教师确认光源'),
  item('microscope','光学显微镜','光学','microscope','观察微小结构，理解物镜与成像条件','物镜、总放大率、照明、标尺','先识别物镜类型；不能只凭放大率判断分辨能力'),
  item('balance','电子天平','分析与生命科学','balance','测量样品质量并理解称量误差来源','调平、校准状态、去皮、稳定标志','读数漂移先检查气流、振动和样品温度'),
  item('ph-meter','pH 计','分析与生命科学','ph','测量溶液酸碱度并学习电极响应','电极型号、缓冲液、温度、校准记录','先核对电极状况和缓冲液，不用未知样品试错','需教师确认样品'),
  item('pipette','微量移液器','分析与生命科学','pipette','按指定体积转移液体','体积范围、吸头适配、操作方式','先核对量程与吸头，避免超量程调节及交叉污染','需教师确认样品'),
  item('centrifuge','台式离心机','分析与生命科学','centrifuge','通过旋转分离样品，学习离心原理','转子型号、配平方式、RCF／RPM','异常振动时按本机紧急流程处理，不打开未停止的转子','需专门培训'),
  item('spectrophotometer','紫外可见分光光度计','分析与生命科学','uv','学习光吸收并测定样品的光谱响应','波长、空白、比色皿、吸光度','先核对空白与比色皿适用波段，不自行拆卸光源','需教师确认样品'),
  item('daq','数据采集卡／采集系统','自动化与制造','daq','把传感器信号记录为可分析的数据','通道、接线类型、量程、采样率','保存原始数据与通道配置；不能用插头外形推断电气兼容','需教师确认接线'),
  item('plc','PLC 教学实验台','自动化与制造','plc','学习控制逻辑、输入输出与诊断状态','CPU 型号、固件、I/O 分配、诊断信息','先在授权仿真或断开执行器的教学环境核对；不得绕过安全联锁','需专门培训'),
]
export const instrumentGroups=[...new Set(instruments.map(i=>i.group))]
export function instrumentNote(item,model='',symptom='',tried='') {
  const source=instrumentSources[item.source]
  return `## 仪器学习记录：${item.name}\n实际型号：${model.trim()||'待核对'}\n用途：${item.purpose}\n需记录：${item.readings}\n当前现象：${symptom.trim()||'未填写'}\n已尝试：${tried.trim()||'未填写'}\n核对提示：${item.check}\n参考：${source.title}\n${source.url}\n适用范围：${source.scope}\n资料链接核验：${item.checkedAt}\n边界：本记录不是设备操作许可；具体接线、参数与故障处理按匹配型号的手册及教师指导执行\n`
}
