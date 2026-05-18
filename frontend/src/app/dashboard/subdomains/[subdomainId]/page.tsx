import SubdomainDetailPage from './PageClient'

export function generateStaticParams() {
  return [{ subdomainId: '__placeholder__' }]
}

export default function Page() {
  return <SubdomainDetailPage />
}
