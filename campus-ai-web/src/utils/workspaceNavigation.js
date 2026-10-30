// One small daily navigation; task-specific workspaces live in the header.
export function workspaceToolsPlacement(width, height, anchorRight, anchorBottom) {
  const menuWidth = Math.min(300, width - 24)
  const top = anchorBottom + 8
  return {
    top: `${top}px`,
    right: `${Math.min(Math.max(12, width - anchorRight), Math.max(12, width - menuWidth - 12))}px`,
    maxHeight: `${Math.max(0, height - top - 16)}px`,
  }
}

export const primaryNavigation = Object.freeze(
  [
    { name: 'chat', label: '校园助手', path: '/chat', icon: 'assistant' },
    { name: 'wall', label: '校园墙', path: '/wall', icon: 'wall' },
    { name: 'timetable', label: '课表', path: '/timetable', icon: 'timetable' },
    { name: 'canteens', label: '评分', path: '/canteens', icon: 'canteen' },
  ].map(Object.freeze),
)

export const workspaceTools = Object.freeze(
  [
    {
      name: 'school-invoice',
      label: '学校开票',
      path: '/account#invoice-info',
      icon: 'sources',
      description: '复制单位名称与税号',
    },
    {
      name: 'teaching',
      label: '教学考勤',
      path: '/teaching',
      icon: 'timetable',
      description: '查看绑定课程、点名与负责范围',
    },
    {
      name: 'study',
      label: '实验与作业',
      path: '/study',
      icon: 'study',
      description: '从题目到步骤，把思路理清',
    },
    {
      name: 'projects',
      label: '我的项目',
      path: '/projects',
      icon: 'projects',
      description: '继续整理资料、检查与导出',
    },
    {
      name: 'instruments',
      label: '仪器资料',
      path: '/instruments',
      icon: 'instruments',
      description: '查使用说明与安全注意事项',
    },
    {
      name: 'reviews',
      label: '收到的审阅',
      path: '/reviews',
      icon: 'sources',
      description: '查看分享给你的项目版本',
    },
    {
      name: 'account',
      label: '产品更新',
      path: '/account#product-updates',
      icon: 'updates',
      description: '查看已完成的改进与使用入口',
    },
  ].map(Object.freeze),
)
