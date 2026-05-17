import RuleDetailPage from './PageClient'

export function generateStaticParams() {
  return [{ ruleId: '__placeholder__' }]
}

export default function Page() {
  return <RuleDetailPage />
}
