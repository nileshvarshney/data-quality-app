import TableDashboardPage from './PageClient'

export function generateStaticParams() {
  return [{ assetId: '__placeholder__' }]
}

export default function Page() {
  return <TableDashboardPage />
}
