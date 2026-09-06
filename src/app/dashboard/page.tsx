import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/ui";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-3xl mx-auto bg-surface-container-lowest border border-outline-variant rounded-xl p-8 shadow-medium">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-outline-variant">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Welcome to your authenticated session.
            </p>
          </div>
          <SignOutButton />
        </div>

        <div className="mt-6 space-y-4">
          <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-outline mb-1">
              Account Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <span className="text-xs text-on-surface-variant block">Full Name</span>
                <span className="text-sm font-medium text-on-surface">{user.name}</span>
              </div>
              <div>
                <span className="text-xs text-on-surface-variant block">Email Address</span>
                <span className="text-sm font-medium text-on-surface">{user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
