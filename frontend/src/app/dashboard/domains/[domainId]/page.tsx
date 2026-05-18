import DomainDetailPage from './PageClient'

export function generateStaticParams() {
  return [{ domainId: '__placeholder__' }]
}

export default function Page() {
  return <DomainDetailPage />
}
