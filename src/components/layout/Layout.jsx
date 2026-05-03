import Sidebar from './Sidebar'
import OTNotifications from '../notifications/OTNotifications'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      <OTNotifications />
    </div>
  )
}
