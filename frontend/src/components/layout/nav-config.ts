import {
  Globe, Database, Shield, Calendar, Bell, ClipboardList, ClipboardCheck,
  PlayCircle, Settings, FolderKanban, User, BrainCircuit, HelpCircle,
  Search, BookOpen, Package, FileText, Sparkles, AlertOctagon, ShoppingBag,
  BarChart2, Lock, Trash2, Layers, Gavel, Cpu, ScanSearch,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  badgeKey?: string
  action?: () => void
}

export interface NavSection {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
  adminOnly?: boolean
}

export const NAV: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Globe,
    items: [
      { href: '/dashboard/global', label: 'Global Dashboard',      icon: Globe },
      { href: '/executive',        label: 'Cost Impact Dashboard', icon: BarChart2 },
    ],
  },
  {
    id: 'quality',
    label: 'Data Quality',
    icon: Shield,
    items: [
      { href: '/rules',               label: 'Rules',          icon: Shield,         badgeKey: 'pending_rules' },
      { href: '/rules/approval-queue',label: 'Approval Queue', icon: ClipboardCheck },
      { href: '/assets',              label: 'Data Assets',    icon: Database },
      { href: '/assets/discovery',    label: 'Auto Discovery', icon: ScanSearch },
      { href: '/schedules',           label: 'Schedules',      icon: Calendar },
      { href: '/runs',                label: 'Execution Logs', icon: PlayCircle },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Bell,
    items: [
      { href: '/alerts', label: 'Alerts',     icon: Bell,          badgeKey: 'open_alerts' },
      { href: '/audit',  label: 'Audit Logs', icon: ClipboardList },
    ],
  },
  {
    id: 'catalog',
    label: 'Data Catalog',
    icon: Search,
    items: [
      { href: '/catalog',       label: 'Data Catalog',  icon: Search },
      { href: '/glossary',      label: 'Glossary',      icon: BookOpen },
      { href: '/data-products', label: 'Data Products', icon: Package },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: Gavel,
    items: [
      { href: '/governance',  label: 'Governance Hub',   icon: Layers },
      { href: '/contracts',   label: 'Data Contracts',   icon: FileText },
      { href: '/incidents',   label: 'Incidents',        icon: AlertOctagon, badgeKey: 'open_incidents' },
      { href: '/marketplace', label: 'Rule Marketplace', icon: ShoppingBag },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy & Compliance',
    icon: Lock,
    items: [
      { href: '/compliance', label: 'Compliance', icon: Shield },
    ],
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    icon: Cpu,
    items: [
      {
        href: '#copilot',
        label: 'AI Copilot',
        icon: Sparkles,
        action: () => window.dispatchEvent(new CustomEvent('open-ai-copilot')),
      },
      { href: '/ai-assistant', label: 'AI Assistant', icon: BrainCircuit },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    icon: HelpCircle,
    items: [
      { href: '/help', label: 'Help & Reference', icon: HelpCircle },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    adminOnly: true,
    items: [
      { href: '/admin/domains', label: 'Domain Management', icon: FolderKanban },
      { href: '/admin/users',   label: 'User Management',   icon: User },
      { href: '/admin/cleanup', label: 'Data Cleanup',      icon: Trash2 },
      { href: '/settings',      label: 'Settings',          icon: Settings },
    ],
  },
]

/** Returns the section ID whose items match the given pathname, or null. */
export function getActiveSectionId(pathname: string): string | null {
  for (const section of NAV) {
    if (section.items.some(
      item => !item.action && (pathname === item.href || pathname.startsWith(item.href + '/'))
    )) {
      return section.id
    }
  }
  return null
}
